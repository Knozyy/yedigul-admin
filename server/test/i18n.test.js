import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTENT_LANGUAGES,
  missingCategoryTranslationCodes,
  missingProductTranslationCodes,
  productMatchesQuery,
} from '../../src/lib/i18n.js';
import { buildProductPayload } from '../../src/lib/product-model.js';

const product = {
  id: 'fish', category_id: 'main',
  name_tr: 'Izgara Çipura', name_en: 'Grilled Sea Bream',
  name_ar: 'دنيس مشوي', name_ru: 'Дорадо на гриле',
  desc_tr: 'Taze balık', desc_en: 'Fresh fish', desc_ar: 'سمك طازج', desc_ru: 'Свежая рыба',
  ing_tr: ['balık'], ing_en: ['fish'], ing_ar: ['سمك'], ing_ru: ['рыба'],
  alg_tr: ['balık'], alg_en: ['fish'], alg_ar: ['سمك'], alg_ru: ['рыба'],
  price: 650, kcal: 300, portion: '300 g', sort: 1, diet: ['gf'], variants: [],
  is_market_price: false, is_available: true, is_hidden: false, popular: false, chef: false,
};

test('yerel panel dört içerik dilini tanımlar', () => {
  assert.deepEqual(CONTENT_LANGUAGES.map(({ code }) => code), ['tr', 'en', 'ar', 'ru']);
});

test('ürün araması Türkçe, İngilizce, Arapça ve Rusça içerikte çalışır', () => {
  assert.equal(productMatchesQuery(product, 'cipura'), true);
  assert.equal(productMatchesQuery(product, 'SEA BREAM'), true);
  assert.equal(productMatchesQuery(product, 'طازج'), true);
  assert.equal(productMatchesQuery(product, 'СВЕЖАЯ'), true);
  assert.equal(productMatchesQuery(product, 'karides'), false);
});

test('yerel panel payloadı tüm dil alanlarını kayıpsız taşır', () => {
  const form = {
    ...product,
    ing_tr: 'balık', ing_en: 'fish', ing_ar: 'سمك', ing_ru: 'рыба',
    alg_tr: 'balık', alg_en: 'fish', alg_ar: 'سمك', alg_ru: 'рыба',
  };
  const payload = buildProductPayload(form, product);
  assert.equal(payload.name_ar, product.name_ar);
  assert.equal(payload.name_ru, product.name_ru);
  assert.deepEqual(payload.ing_ar, ['سمك']);
  assert.deepEqual(payload.alg_ru, ['рыба']);
});

test('eksik AR/RU içerikleri yönetim listesinde işaretlenebilir', () => {
  assert.deepEqual(missingProductTranslationCodes(product), []);
  assert.deepEqual(missingProductTranslationCodes({ ...product, name_ar: '', desc_ru: '' }), ['ar', 'ru']);
  assert.deepEqual(missingCategoryTranslationCodes({ name_ar: '', name_ru: 'Рыба' }), ['ar']);
});
