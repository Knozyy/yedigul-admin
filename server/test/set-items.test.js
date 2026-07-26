import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urunEkle, adetDegistir, urunCikar } from '../../src/lib/set-items.js';

test('yeni ürün 1 adetle eklenir', () => {
  assert.deepEqual(urunEkle([], 'levrek'), [{ product_id: 'levrek', qty: 1 }]);
});

test('var olan ürüne tekrar tıklamak adedi artırır, satır çoğaltmaz', () => {
  const items = urunEkle(urunEkle([], 'levrek'), 'levrek');
  assert.deepEqual(items, [{ product_id: 'levrek', qty: 2 }], 'ürün listede bir kez bulunmalı');
});

test('boş id eklenmez', () => {
  assert.deepEqual(urunEkle([], ''), []);
});

test('adet artırılır ve azaltılır', () => {
  const items = [{ product_id: 'levrek', qty: 3 }];
  assert.deepEqual(adetDegistir(items, 'levrek', 1), [{ product_id: 'levrek', qty: 4 }]);
  assert.deepEqual(adetDegistir(items, 'levrek', -1), [{ product_id: 'levrek', qty: 2 }]);
});

test('adet sıfıra düşünce kalem listeden çıkar', () => {
  const items = [{ product_id: 'levrek', qty: 1 }, { product_id: 'ezme', qty: 2 }];
  assert.deepEqual(adetDegistir(items, 'levrek', -1), [{ product_id: 'ezme', qty: 2 }]);
});

test('diğer kalemler etkilenmez', () => {
  const items = [{ product_id: 'a', qty: 1 }, { product_id: 'b', qty: 5 }];
  assert.deepEqual(adetDegistir(items, 'b', -2), [{ product_id: 'a', qty: 1 }, { product_id: 'b', qty: 3 }]);
});

test('ürün çıkarılır', () => {
  const items = [{ product_id: 'a', qty: 1 }, { product_id: 'b', qty: 5 }];
  assert.deepEqual(urunCikar(items, 'a'), [{ product_id: 'b', qty: 5 }]);
});

test('girdiyi değiştirmez', () => {
  const items = [{ product_id: 'a', qty: 1 }];
  const kopya = JSON.parse(JSON.stringify(items));
  urunEkle(items, 'a'); adetDegistir(items, 'a', 5); urunCikar(items, 'a');
  assert.deepEqual(items, kopya, 'kaynak dizi bozulmamalı');
});
