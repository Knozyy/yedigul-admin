import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_SOURCE_LENGTH,
  buildRequestBody,
  buildTranslationInput,
  parseTranslationResponse,
  systemInstruction,
  translationPatch,
} from '../../shared/translate.js';

/** Gemini yanıt zarfı: gerçek yanıtta items bir JSON METNİ olarak gelir. */
const yanit = (obj) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });

const UC_DIL = (en, ar, ru) => ({ en, ar, ru });

test('liste alanı virgül ve satır sonundan ayrılır, öğe sayısı korunur', () => {
  const items = buildTranslationInput('ing', 'Levrek, Limon\nZeytinyağı');
  assert.deepEqual(items, ['Levrek', 'Limon', 'Zeytinyağı']);
});

test('metin alanı tek öğeye indirgenir', () => {
  assert.deepEqual(buildTranslationInput('name', 'Izgara Levrek'), ['Izgara Levrek']);
  // Açıklamadaki virgül ayırıcı DEĞİL: metin alanı bölünmemeli.
  assert.deepEqual(buildTranslationInput('desc', 'Taze, günlük balık.'), ['Taze, günlük balık.']);
});

test('boş kaynak ve bilinmeyen alan reddedilir', () => {
  assert.throws(() => buildTranslationInput('name', '   '), /boş/);
  assert.throws(() => buildTranslationInput('name', null), /boş/);
  assert.throws(() => buildTranslationInput('yok', 'x'), /Bilinmeyen/);
});

test('çok uzun kaynak reddedilir', () => {
  assert.throws(() => buildTranslationInput('desc', 'a'.repeat(MAX_SOURCE_LENGTH + 1)), /karakterden/);
});

test('istek gövdesi öğe sayısını şemaya taşır', () => {
  const body = buildRequestBody('ing', ['Levrek', 'Limon', 'Zeytinyağı']);
  const schema = body.generationConfig.responseSchema.properties.items;
  assert.equal(schema.minItems, 3);
  assert.equal(schema.maxItems, 3);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(schema.items.required, ['en', 'ar', 'ru']);
});

test('sistem yönergesi kaynağı, üç hedef dili ve sıra kuralını bildirir', () => {
  const talimat = systemInstruction('ing');
  assert.match(talimat, /Türkçe/);
  assert.match(talimat, /İngilizce/);
  assert.match(talimat, /Arapça/);
  assert.match(talimat, /Rusça/);
  assert.match(talimat, /sırasını BİREBİR koru/);
});

test('yanıt çözülüp üç dile ayrılır', () => {
  const payload = yanit({ items: [
    UC_DIL('Sea bass', 'قاروص', 'Сибас'),
    UC_DIL('Lemon', 'ليمون', 'Лимон'),
  ] });
  const values = parseTranslationResponse(payload, 'ing', 2);
  assert.deepEqual(values, {
    en: 'Sea bass, Lemon',
    ar: 'قاروص, ليمون',
    ru: 'Сибас, Лимон',
  });
});

test('metin alanında öğeler birleştirilmez, tek değer döner', () => {
  const payload = yanit({ items: [UC_DIL('Grilled Sea Bass', 'قاروص مشوي', 'Сибас гриль')] });
  assert.equal(parseTranslationResponse(payload, 'name', 1).en, 'Grilled Sea Bass');
});

// Doldurmak canlı menüye boş malzeme yazar; kırpmak bir ALERJENİ düşürür.
test('öğe sayısı tutmazsa hata fırlatır, onarmaya çalışmaz', () => {
  const payload = yanit({ items: [UC_DIL('Sea bass', 'قاروص', 'Сибас')] });
  assert.throws(() => parseTranslationResponse(payload, 'ing', 3), /3 öğe yerine 1 öğe/);
});

// "salt, pepper" gibi bir çeviri kaydederken textToList tarafından iki
// malzemeye bölünür ve öğe sayısı sessizce artardı.
test('öğe içindeki virgül temizlenir', () => {
  const payload = yanit({ items: [UC_DIL('salt, pepper', 'ملح وفلفل', 'соль, перец')] });
  const values = parseTranslationResponse(payload, 'ing', 1);
  assert.equal(values.en, 'salt pepper');
  assert.equal(values.ru, 'соль перец');
  assert.equal(values.en.includes(','), false);
});

test('boş çeviri kabul edilmez', () => {
  const payload = yanit({ items: [UC_DIL('', 'قاروص', 'Сибас')] });
  assert.throws(() => parseTranslationResponse(payload, 'name', 1), /boş bıraktı/);
});

test('JSON olmayan yanıt anlaşılır hata verir', () => {
  const payload = { candidates: [{ content: { parts: [{ text: 'Tabii, işte çeviri:' }] } }] };
  assert.throws(() => parseTranslationResponse(payload, 'name', 1), /beklenmedik/);
});

test('aday yoksa (güvenlik engeli) hata verir', () => {
  assert.throws(() => parseTranslationResponse({ candidates: [] }, 'name', 1), /boş yanıt/);
  assert.throws(() => parseTranslationResponse({}, 'name', 1), /boş yanıt/);
});

test('items dizi değilse hata verir', () => {
  assert.throws(() => parseTranslationResponse(yanit({ items: 'x' }), 'name', 1), /beklenmedik/);
});

test('translationPatch kaynak Türkçe alanı ezmez', () => {
  const patch = translationPatch('alg', { en: 'Fish', ar: 'سمك', ru: 'Рыба' });
  assert.deepEqual(patch, { alg_en: 'Fish', alg_ar: 'سمك', alg_ru: 'Рыба' });
  assert.equal('alg_tr' in patch, false);
});
