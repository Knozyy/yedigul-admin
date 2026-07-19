import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProductPayload, normalizeVariantRows, textToList } from '../../src/lib/product-model.js';

const base = {
  id: 'levrek', category_id: 'fish', name_tr: 'Levrek', name_en: 'Sea Bass',
  name_ar: '', name_ru: '', desc_tr: '', desc_en: '', desc_ar: '', desc_ru: '',
  price: '650', kcal: '320', portion: '350 gr', sort: 1, diet: ['gf'],
  ing_tr: 'Balık, Limon\nZeytinyağı', ing_en: '', ing_ar: '', ing_ru: '',
  alg_tr: 'Balık', alg_en: '', alg_ar: '', alg_ru: '', variants: [],
  is_market_price: false, is_available: true, is_hidden: false, popular: true, chef: false,
};

test('metin listelerini virgül ve satır sonundan temizler', () => {
  assert.deepEqual(textToList(' Balık, Limon\n Zeytinyağı ,, '), ['Balık', 'Limon', 'Zeytinyağı']);
});

test('ürün payloadı gelişmiş alanları API biçimine dönüştürür', () => {
  const payload = buildProductPayload(base, base);
  assert.equal(payload.price, 650);
  assert.equal(payload.kcal, 320);
  assert.deepEqual(payload.ing_tr, ['Balık', 'Limon', 'Zeytinyağı']);
  assert.deepEqual(payload.alg_tr, ['Balık']);
  assert.deepEqual(payload.diet, ['gf']);
});

test('varyantlar doğrulanır ve tek fiyatı devre dışı bırakır', () => {
  const variants = normalizeVariantRows([{ name_tr: '35 cl', name_en: '35 cl', name_ar: '', name_ru: '', price: '1200' }]);
  assert.equal(variants[0].price, 1200);
  const payload = buildProductPayload({ ...base, variants }, base);
  assert.equal(payload.price, null);
  assert.deepEqual(payload.variants, variants);
  assert.throws(() => normalizeVariantRows([{ name_tr: '35 cl', name_en: '', price: 1200 }]), /zorunlu/);
});

test('mevcut piyasa ürününde günlük fiyat için bayrağı tekrar göndermez', () => {
  const original = { ...base, is_market_price: 1, price: null };
  const payload = buildProductPayload({ ...base, is_market_price: true, price: '850' }, original);
  assert.equal(payload.price, 850);
  assert.equal('is_market_price' in payload, false);
});

test('yeni veya sabit fiyatlı ürünü piyasaya geçirirken fiyatı null yapar', () => {
  const payload = buildProductPayload({ ...base, is_market_price: true, price: '850' }, base);
  assert.equal(payload.is_market_price, true);
  assert.equal(payload.price, null);
});
