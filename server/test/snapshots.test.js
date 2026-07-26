import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PanoCache, localDay } from '../cache.js';

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
