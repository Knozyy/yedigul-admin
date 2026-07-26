import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_DAILY_PRICE,
  applyDailyPricePlan,
  buildDailyPricePlan,
  marketProducts,
  parseDailyPrice,
  pruneDraft,
} from '../../src/lib/daily-prices.js';

const urun = (id, extra = {}) => ({
  id, name_tr: id, is_market_price: 1, price: null, is_hidden: 0, ...extra,
});

/** Kaydeden sahte: çağrıları kaydeder, istenen adımda patlar. */
function sahtePatch({ patlayan = null, hata = new Error('sunucu hatası') } = {}) {
  const cagrilar = [];
  const patch = async (id, body) => {
    cagrilar.push({ id, body });
    if (id === patlayan) throw hata;
    return { id, ...body };
  };
  return { patch, cagrilar };
}

test('piyasa fiyatlı ürünleri 1|0 değerinden ayıklar', () => {
  const menu = { products: [
    urun('levrek'),
    urun('kofte', { is_market_price: 0 }),
    urun('kalkan', { is_market_price: true }),
    urun('ezme', { is_market_price: undefined }),
  ] };
  assert.deepEqual(marketProducts(menu).map((p) => p.id), ['levrek', 'kalkan']);
});

test('menü boşsa veya bozuksa çökmez', () => {
  assert.deepEqual(marketProducts(null), []);
  assert.deepEqual(marketProducts({}), []);
});

test('boş satır isteğe dönüşmez', () => {
  assert.deepEqual(parseDailyPrice(''), { skip: true });
  assert.deepEqual(parseDailyPrice('   '), { skip: true });
  assert.deepEqual(parseDailyPrice(undefined), { skip: true });
});

test('virgüllü fiyat noktaya çevrilir', () => {
  assert.deepEqual(parseDailyPrice('8,50'), { value: 8.5 });
  assert.deepEqual(parseDailyPrice(' 850 '), { value: 850 });
});

// Eski panel Number(v) > 0 ile süzüyordu: 'abc' ve '-5' sessizce atlanıyordu,
// kullanıcı fiyatı girdiğini sanıyordu.
test('geçersiz fiyat sessizce atlanmaz, hata döner', () => {
  assert.ok(parseDailyPrice('abc').error);
  assert.ok(parseDailyPrice('-5').error);
  assert.ok(parseDailyPrice('1e5x').error);
});

test('sınırın üstündeki fiyat reddedilir', () => {
  assert.deepEqual(parseDailyPrice(String(MAX_DAILY_PRICE)), { value: MAX_DAILY_PRICE });
  assert.ok(parseDailyPrice(String(MAX_DAILY_PRICE + 1)).error);
});

// KRİTİK: gövdede is_market_price truthy görülürse sunucu fiyatı ZORLA null
// yapar (Yedigül server/routes/admin.js). Girilen fiyat sessizce silinirdi.
test('PATCH gövdesi yalnızca price içerir', () => {
  const products = [urun('levrek')];
  const { steps } = buildDailyPricePlan(products, { levrek: '850' });
  assert.equal(steps.length, 1);
  assert.deepEqual(steps[0].body, { price: 850 });
  assert.equal('is_market_price' in steps[0].body, false);
});

test('hata varken hiçbir adım üretilmez', () => {
  const products = [urun('levrek'), urun('kalkan')];
  const plan = buildDailyPricePlan(products, { levrek: '850', kalkan: 'abc' });
  assert.equal(plan.errors.length, 1);
  assert.equal(plan.errors[0].id, 'kalkan');
  assert.equal(plan.steps.length, 0, 'tek bir yazım hatası yarım kayıt bırakmamalı');
});

test('değişmeyen fiyat için istek üretilmez', () => {
  const products = [urun('levrek', { price: 850 })];
  assert.equal(buildDailyPricePlan(products, { levrek: '850' }).steps.length, 0);
  assert.equal(buildDailyPricePlan(products, { levrek: '900' }).steps.length, 1);
});

test('piyasa fiyatına dönüş price:null gönderir', () => {
  const products = [urun('levrek', { price: 850 })];
  const { steps } = buildDailyPricePlan(products, { levrek: null });
  assert.deepEqual(steps[0].body, { price: null });
});

test('zaten fiyatsız üründe piyasaya dönüş isteği üretmez', () => {
  const products = [urun('levrek', { price: null })];
  assert.equal(buildDailyPricePlan(products, { levrek: null }).steps.length, 0);
});

test('bilinmeyen id yok sayılır', () => {
  const products = [urun('levrek')];
  const plan = buildDailyPricePlan(products, { silinmis: '850' });
  assert.equal(plan.steps.length, 0);
  assert.equal(plan.errors.length, 0);
});

test('adımlar ürün sırasını korur', () => {
  const products = [urun('a'), urun('b'), urun('c')];
  const { steps } = buildDailyPricePlan(products, { c: '3', a: '1', b: '2' });
  assert.deepEqual(steps.map((s) => s.id), ['a', 'b', 'c']);
});

// Eski döngü ilk hatada duruyordu: dördüncü ürün ikincinin hatası yüzünden
// hiç denenmiyordu.
test('bir ürün düşse kalanlar denenir', async () => {
  const products = [urun('a'), urun('b'), urun('c'), urun('d')];
  const plan = buildDailyPricePlan(products, { a: '1', b: '2', c: '3', d: '4' });
  const { patch, cagrilar } = sahtePatch({ patlayan: 'b' });

  const sonuc = await applyDailyPricePlan(plan, patch);

  assert.equal(cagrilar.length, 4, 'dördü de denenmeli');
  assert.deepEqual(sonuc.ok, ['a', 'c', 'd']);
  assert.deepEqual(sonuc.failed.map((f) => f.id), ['b']);
  assert.equal(sonuc.aborted, false);
});

// 401 tek istisna: uzak oturum bitmiştir, kalan her istek aynı hatayı alır ve
// her biri uygulamayı yeniden giriş ekranına atar.
test('401 gelirse kalan istekler denenmez', async () => {
  const products = [urun('a'), urun('b'), urun('c'), urun('d')];
  const plan = buildDailyPricePlan(products, { a: '1', b: '2', c: '3', d: '4' });
  const hata = Object.assign(new Error('oturum bitti'), { status: 401 });
  const { patch, cagrilar } = sahtePatch({ patlayan: 'b', hata });

  const sonuc = await applyDailyPricePlan(plan, patch);

  assert.equal(cagrilar.length, 2, 'a denendi, b düştü, c ve d hiç denenmedi');
  assert.deepEqual(sonuc.ok, ['a']);
  assert.equal(sonuc.aborted, true);
});

test('başarısız satırlar taslakta kalır, başarılılar silinir', () => {
  const draft = { a: '1', b: '2', c: '3' };
  assert.deepEqual(pruneDraft(draft, ['a', 'c']), { b: '2' });
});

test('boş plan ağa çıkmaz', async () => {
  const { patch, cagrilar } = sahtePatch();
  const sonuc = await applyDailyPricePlan({ steps: [], errors: [] }, patch);
  assert.equal(cagrilar.length, 0);
  assert.deepEqual(sonuc.ok, []);
});
