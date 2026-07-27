/**
 * Çeviri sözleşmesi — sunucu ve arayüz birlikte kullanır.
 *
 * Buradaki her şey SAF: ağ yok, anahtar yok. Gemini'ye giden istek gövdesini
 * kurar, dönen yanıtı çözer ve doğrular. Kirli yarısı `server/translate.js`.
 */

/** Kaynak dil tek: Türkçe yazılır, üçü ondan türer. */
export const TARGET_LANGS = ['en', 'ar', 'ru'];

/**
 * Çevrilebilir alan grupları.
 *
 * `list: true` olanlar formda virgül/satır sonuyla ayrılmış METİN tutar ama
 * anlamca listedir — öğe sayısı korunmak zorunda. Yeni bir ekran (kategori,
 * duyuru) eklemek buraya bir satır eklemek demek.
 */
export const TRANSLATION_GROUPS = Object.freeze({
  name: { label: 'Ürün adı', list: false },
  desc: { label: 'Ürün açıklaması', list: false },
  ing: { label: 'İçindekiler', list: true },
  alg: { label: 'Alerjenler', list: true },
});

export function isTranslationGroup(group) {
  return Object.hasOwn(TRANSLATION_GROUPS, group);
}

/** Kaynak metin üst sınırı — 512kb gövde sınırı hata mesajı olarak işe yaramaz. */
export const MAX_SOURCE_LENGTH = 4000;

// Liste alanları formda tek metin: "Levrek, Limon\nZeytinyağı".
// product-model.js'teki textToList ile aynı ayırıcı.
const splitList = (text) => String(text).split(/[,\n]/).map((item) => item.trim()).filter(Boolean);

/**
 * Grubun Türkçesini modele gidecek öğe listesine çevirir.
 *
 * Metin alanları da TEK ÖĞELİK listeye indirgenir: tek şema, tek doğrulayıcı,
 * tek kod yolu. Dört grup için dört ayrı dal tutmak zorunda kalmıyoruz.
 */
export function buildTranslationInput(group, source) {
  if (!isTranslationGroup(group)) throw new Error('Bilinmeyen çeviri alanı.');
  const text = String(source ?? '').trim();
  if (!text) throw new Error('Çevrilecek Türkçe metin boş.');
  if (text.length > MAX_SOURCE_LENGTH) {
    throw new Error(`Çevrilecek metin ${MAX_SOURCE_LENGTH} karakterden uzun olamaz.`);
  }

  const items = TRANSLATION_GROUPS[group].list ? splitList(text) : [text];
  if (!items.length) throw new Error('Çevrilecek Türkçe metin boş.');
  return items;
}

export function systemInstruction(group) {
  const { label, list } = TRANSLATION_GROUPS[group];
  return [
    'Bir Türk balık lokantasının menüsünü çeviriyorsun.',
    `Çevrilen alan: ${label}.`,
    'Kaynak dil Türkçe. Her öğeyi İngilizce (en), Arapça (ar) ve Rusça (ru) diline çevir.',
    'Öğe sayısını ve sırasını BİREBİR koru; öğeleri birleştirme, bölme, ekleme veya çıkarma.',
    'Açıklama, parantez içi not veya alternatif çeviri ekleme.',
    'Bir öğenin içinde virgül KULLANMA.',
    'Arapça için diakritiksiz Modern Standart Arapça kullan.',
    // Marka adının hedef dilde karşılığı YOKTUR. Harf çevirisi de olmaz:
    // misafir şişedeki etiketi arıyor, "إيفيس" ile "Efes"i eşleştiremez.
    'MARKA VE ÖZEL ADLARI ÇEVİRME, HARF ÇEVİRİSİ DE YAPMA (Efes, Kızılca, Yeni Rakı, Kızılay, Coca-Cola, Tekirdağ gibi).',
    'Bunları Arapça ve Rusça çıktıda da Türkçedeki gibi LATİN harfleriyle, harfi harfine aynı bırak.',
    'Ürünün etiketteki tam adı markanın parçasıdır, bölme ("Kızılay Soda" tek parça kalır).',
    'Yerleşmiş yemek adları (rakı, meze, börek) marka değildir: olduğu gibi bırak veya hedef dilde yerleşmiş karşılığını kullan.',
    list ? 'Bu alan bir malzeme/alerjen listesidir; her öğe kısa bir isim tamlamasıdır.' : '',
  ].filter(Boolean).join(' ');
}

/** N öğe → N tane {en, ar, ru}. Üç paralel dizi değil: hizalama yapısal olsun. */
export function responseSchema(count) {
  return {
    type: 'OBJECT',
    required: ['items'],
    properties: {
      items: {
        type: 'ARRAY',
        minItems: count,
        maxItems: count,
        items: {
          type: 'OBJECT',
          required: TARGET_LANGS,
          properties: Object.fromEntries(TARGET_LANGS.map((lang) => [lang, { type: 'STRING' }])),
          propertyOrdering: TARGET_LANGS,
        },
      },
    },
  };
}

export function buildRequestBody(group, items) {
  return {
    // Yapılandırılmış girdi: virgüllü kaynağı düz yazı sanmasın.
    contents: [{ parts: [{ text: JSON.stringify({ alan: group, items }) }] }],
    systemInstruction: { parts: [{ text: systemInstruction(group) }] },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema(items.length),
      temperature: 0.2,
    },
  };
}

// Öğe içindeki virgül/satır sonu, kaydederken textToList tarafından ayırıcı
// sayılır ve "salt, pepper" iki malzemeye bölünürdü. Birleştirmeden önce temizle.
const scrub = (value) => String(value).replace(/[,\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Gemini yanıtını `{ en, ar, ru }` metinlerine çevirir.
 *
 * Öğe sayısı tutmuyorsa ONARMA, reddet: eksiği doldurmak canlı menüye boş
 * malzeme yazar, fazlasını kırpmak bir ALERJENİ düşürür. Tekrar denemek
 * bir saniye.
 */
export function parseTranslationResponse(payload, group, expectedCount) {
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Çeviri servisi boş yanıt döndürdü. Tekrar deneyin.');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Çeviri servisinden beklenmedik bir yanıt geldi. Tekrar deneyin.');
  }

  const items = parsed?.items;
  if (!Array.isArray(items)) {
    throw new Error('Çeviri servisinden beklenmedik bir yanıt geldi. Tekrar deneyin.');
  }
  if (items.length !== expectedCount) {
    throw new Error(`Çeviri servisi ${expectedCount} öğe yerine ${items.length} öğe döndürdü. Tekrar deneyin.`);
  }

  const values = {};
  for (const lang of TARGET_LANGS) {
    const parts = items.map((item) => scrub(item?.[lang] ?? ''));
    if (parts.some((part) => !part)) {
      throw new Error('Çeviri servisi bazı öğeleri boş bıraktı. Tekrar deneyin.');
    }
    // listToText ile aynı ayırıcı, böylece kaydederken öğe sayısı birebir döner.
    values[lang] = TRANSLATION_GROUPS[group].list ? parts.join(', ') : parts[0];
  }
  return values;
}

/** Form durumuna uygulanacak yama. Kaynak `*_tr` alanına DOKUNMAZ. */
export function translationPatch(group, values) {
  return Object.fromEntries(TARGET_LANGS.map((lang) => [`${group}_${lang}`, values[lang]]));
}
