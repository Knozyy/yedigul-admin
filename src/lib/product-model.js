export const MAX_IMAGES = 6;
export const MAX_VARIANTS = 8;

export function truthy(value) {
  return value === true || value === 1 || value === '1';
}

export function listToText(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}

export function textToList(value) {
  return String(value || '')
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionalNumber(value, label) {
  if (value === '' || value == null) return null;
  const number = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} sıfır veya daha büyük bir sayı olmalı.`);
  }
  return number;
}

export function normalizeVariantRows(rows = []) {
  if (!Array.isArray(rows) || rows.length > MAX_VARIANTS) {
    throw new Error(`En çok ${MAX_VARIANTS} fiyat seçeneği eklenebilir.`);
  }

  const variants = [];
  for (const row of rows) {
    const nameTr = String(row?.name_tr || '').trim();
    const nameEn = String(row?.name_en || '').trim();
    const rawPrice = String(row?.price ?? '').trim();
    if (!nameTr && !nameEn && rawPrice === '') continue;
    const price = optionalNumber(rawPrice, 'Seçenek fiyatı');
    if (!nameTr || !nameEn || price == null) {
      throw new Error('Her fiyat seçeneğinde Türkçe ad, İngilizce ad ve fiyat zorunlu.');
    }
    variants.push({
      name_tr: nameTr,
      name_en: nameEn,
      name_ar: String(row?.name_ar || '').trim(),
      name_ru: String(row?.name_ru || '').trim(),
      price,
    });
  }
  return variants;
}

/**
 * Ürün listesinde ve günlük fiyat ekranında görünen fiyat metni.
 *
 * Piyasa fiyatlı üründe `price` iki farklı şey demek: null ise günün fiyatı
 * henüz girilmemiş (menüde "Piyasa Fiyatı" yazar), doluysa girilmiş.
 */
export function priceLabel(product) {
  if (truthy(product?.is_market_price)) {
    return product.price == null ? 'Piyasa fiyatı' : `Günlük ${product.price} TL`;
  }
  if (product?.variants?.length) {
    const values = product.variants.map((variant) => Number(variant.price));
    return `${Math.min(...values)}–${Math.max(...values)} TL`;
  }
  return product?.price == null ? '—' : `${product.price} TL`;
}

export function buildProductPayload(form, original = null) {
  const nameTr = String(form.name_tr || '').trim();
  const nameEn = String(form.name_en || '').trim();
  if (!nameTr || !nameEn) throw new Error('Türkçe ve İngilizce ürün adı zorunlu.');
  if (!String(form.category_id || '').trim()) throw new Error('Kategori seçin.');

  const variants = normalizeVariantRows(form.variants);
  const isMarketPrice = truthy(form.is_market_price);
  const wasMarketPrice = truthy(original?.is_market_price);
  const basePrice = variants.length ? null : optionalNumber(form.price, isMarketPrice ? 'Günün fiyatı' : 'Fiyat');

  const payload = {
    category_id: String(form.category_id).trim(),
    name_tr: nameTr,
    name_en: nameEn,
    name_ar: String(form.name_ar || '').trim(),
    name_ru: String(form.name_ru || '').trim(),
    desc_tr: String(form.desc_tr || '').trim(),
    desc_en: String(form.desc_en || '').trim(),
    desc_ar: String(form.desc_ar || '').trim(),
    desc_ru: String(form.desc_ru || '').trim(),
    price: basePrice,
    kcal: optionalNumber(form.kcal, 'Kalori'),
    portion: String(form.portion || '').trim() || null,
    sort: Number(form.sort || 0),
    is_market_price: isMarketPrice,
    is_available: truthy(form.is_available),
    is_hidden: truthy(form.is_hidden),
    popular: truthy(form.popular),
    chef: truthy(form.chef),
    diet: [...new Set(Array.isArray(form.diet) ? form.diet.map(String).filter(Boolean) : [])],
    ing_tr: textToList(form.ing_tr),
    ing_en: textToList(form.ing_en),
    ing_ar: textToList(form.ing_ar),
    ing_ru: textToList(form.ing_ru),
    alg_tr: textToList(form.alg_tr),
    alg_en: textToList(form.alg_en),
    alg_ar: textToList(form.alg_ar),
    alg_ru: textToList(form.alg_ru),
    variants,
  };

  // Backend aynı PATCH içinde is_market_price=true görürse fiyatı bilinçli
  // olarak NULL yapar. Zaten piyasa fiyatlı bir üründe günlük fiyat yazarken
  // bayrağı tekrar göndermeyip yalnız price alanını güncellemek gerekir.
  if (isMarketPrice && original?.id && wasMarketPrice) {
    delete payload.is_market_price;
  } else if (isMarketPrice) {
    payload.price = null;
  }

  return payload;
}
