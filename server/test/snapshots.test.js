import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PanoCache, localDay } from '../cache.js';
import { priceSnapshots } from '../snapshots/prices.js';

test('entity ile yazılan kayıtlar birbirini ezmez', () => {
  const cache = new PanoCache('');
  cache.snapshot('menu.price', 850, '2026-07-25', 'levrek');
  cache.snapshot('menu.price', 780, '2026-07-25', 'cipura');
  cache.snapshot('ig.followers', 4100, '2026-07-25');

  assert.deepEqual(cache.history('menu.price', 30, 'levrek'), [{ day: '2026-07-25', value: 850 }]);
  assert.deepEqual(cache.history('menu.price', 30, 'cipura'), [{ day: '2026-07-25', value: 780 }]);
  assert.deepEqual(cache.history('ig.followers', 30), [{ day: '2026-07-25', value: 4100 }]);
});

test('aynı gün + entity tekrar yazılırsa üzerine yazar', () => {
  const cache = new PanoCache('');
  cache.snapshot('menu.price', 850, '2026-07-25', 'levrek');
  cache.snapshot('menu.price', 900, '2026-07-25', 'levrek');
  assert.deepEqual(cache.history('menu.price', 30, 'levrek'), [{ day: '2026-07-25', value: 900 }]);
});

test('allSnapshots gönderime hazır düz liste verir', () => {
  const cache = new PanoCache('');
  const bugun = localDay();
  cache.snapshot('ig.followers', 4100, bugun);
  cache.snapshot('menu.price', 850, bugun, 'levrek');

  const items = cache.allSnapshots(90);
  assert.equal(items.length, 2);
  for (const item of items) {
    assert.deepEqual(Object.keys(item).sort(), ['day', 'entity', 'metric', 'value']);
  }
  assert.ok(items.some((i) => i.metric === 'menu.price' && i.entity === 'levrek' && i.value === 850));
  assert.ok(items.some((i) => i.metric === 'ig.followers' && i.entity === ''));
});

test('allSnapshots penceresi dışındaki günleri getirmez', () => {
  const cache = new PanoCache('');
  const eski = localDay(new Date(Date.now() - 200 * 86400000));
  cache.snapshot('ig.followers', 1, eski);
  cache.snapshot('ig.followers', 2, localDay());

  assert.equal(cache.allSnapshots(90).length, 1);
  assert.equal(cache.allSnapshots(365).length, 2);
});

test('hasMetricOnDay günlük toplamanın tekrarını engeller', () => {
  const cache = new PanoCache('');
  assert.equal(cache.hasMetricOnDay('menu.price', '2026-07-25'), false);
  cache.snapshot('menu.price', 850, '2026-07-25', 'levrek');
  assert.equal(cache.hasMetricOnDay('menu.price', '2026-07-25'), true);
  assert.equal(cache.hasMetricOnDay('menu.price', '2026-07-26'), false);
});

test('tekil fiyatlı ürün ürün id sini entity olarak kullanır', () => {
  const menu = { products: [{ id: 'levrek', price: 850, variants: [] }] };
  assert.deepEqual(priceSnapshots(menu, '2026-07-25'), [
    { day: '2026-07-25', metric: 'menu.price', entity: 'levrek', value: 850 },
  ]);
});

test('varyantlı ürün her varyant için ayrı satır üretir', () => {
  const menu = {
    products: [{
      id: 'raki', price: null,
      variants: [{ name_tr: 'Tek', price: 250 }, { name_tr: 'Duble', price: 400 }],
    }],
  };
  assert.deepEqual(priceSnapshots(menu, '2026-07-25'), [
    { day: '2026-07-25', metric: 'menu.price', entity: 'raki-0', value: 250 },
    { day: '2026-07-25', metric: 'menu.price', entity: 'raki-1', value: 400 },
  ]);
});

test('tekil fiyat varyantlara üstün gelir; ürün iki seriye bölünmez', () => {
  const menu = {
    products: [{ id: 'levrek', price: 850, variants: [{ name_tr: 'Porsiyon', price: 850 }] }],
  };
  const items = priceSnapshots(menu, '2026-07-25');
  assert.equal(items.length, 1);
  assert.equal(items[0].entity, 'levrek');
});

test('gizli, fiyatsız ve id siz ürünler atlanır', () => {
  const menu = {
    products: [
      { id: 'gizli', price: 100, is_hidden: 1, variants: [] },
      { id: 'gunun', price: null, is_market_price: 1, variants: [] },
      { id: '', price: 100, variants: [] },
    ],
  };
  assert.deepEqual(priceSnapshots(menu, '2026-07-25'), []);
});

test('boş veya bozuk menü çökmez', () => {
  assert.deepEqual(priceSnapshots(null, '2026-07-25'), []);
  assert.deepEqual(priceSnapshots({}, '2026-07-25'), []);
  assert.deepEqual(priceSnapshots({ products: [] }, '2026-07-25'), []);
});

test('eski entity siz şema migration ile korunur', () => {
  const cache = new PanoCache('');
  cache.db.exec(`
    DROP TABLE snapshots;
    CREATE TABLE snapshots (
      day TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL,
      PRIMARY KEY (day, metric)
    );
    INSERT INTO snapshots (day, metric, value) VALUES ('2026-07-01', 'ig.followers', 4000);
  `);
  cache.migrateSnapshots();

  assert.deepEqual(cache.history('ig.followers', 30), [{ day: '2026-07-01', value: 4000 }]);
});
