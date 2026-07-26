import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PanoCache, localDay } from '../cache.js';
import { priceSnapshots } from '../snapshots/prices.js';
import { RemoteClient } from '../remote-client.js';
import { loadConfig } from '../config.js';
import { collectPrices, pullSnapshots, pushSnapshots, PULL_METRICS } from '../snapshots/sync.js';

const cfg = loadConfig({ SSH_ENABLED: '0' });

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

test('write gövdeyi JSON olarak POST eder ve token taşır', async () => {
  let gorulen = null;
  const client = new RemoteClient(cfg, async (url, options) => {
    gorulen = { url, options };
    return new Response(JSON.stringify({ written: 2, skipped: 0, unknown: [] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  });

  const sonuc = await client.write('/snapshots', { items: [{ day: '2026-07-25' }] }, 'tok');
  assert.deepEqual(sonuc, { written: 2, skipped: 0, unknown: [] });
  assert.equal(gorulen.options.method, 'POST');
  assert.equal(gorulen.options.headers.authorization, 'Bearer tok');
  assert.equal(gorulen.options.headers['content-type'], 'application/json');
  assert.ok(gorulen.url.endsWith('/snapshots'));
  assert.deepEqual(JSON.parse(gorulen.options.body), { items: [{ day: '2026-07-25' }] });
});

test('write hata durumunda sunucunun mesajını taşıyan hata fırlatır', async () => {
  const client = new RemoteClient(cfg, async () =>
    new Response(JSON.stringify({ error: 'Tek seferde en çok 2000 kayıt.' }), {
      status: 413, headers: { 'content-type': 'application/json' },
    }));

  await assert.rejects(() => client.write('/snapshots', { items: [] }, 'tok'), (error) => {
    assert.equal(error.status, 413);
    assert.match(error.message, /2000/);
    return true;
  });
});

test('write ağ hatasında 503 ile anlaşılır mesaj verir', async () => {
  const client = new RemoteClient(cfg, async () => { throw new Error('ECONNREFUSED'); });
  await assert.rejects(() => client.write('/snapshots', {}, 'tok'), (error) => {
    assert.equal(error.status, 503);
    return true;
  });
});

/** remoteClient taklidi: read ve write çağrılarını kaydeder. */
function sahteIstemci({ menu = { products: [] }, rows = [], writeSonuc = { written: 0, skipped: 0, unknown: [] } } = {}) {
  const cagrilar = { read: [], write: [] };
  return {
    cagrilar,
    async read(path) {
      cagrilar.read.push(path);
      if (path === '/menu') return menu;
      return { rows };
    },
    async write(path, body) {
      cagrilar.write.push({ path, body });
      return writeSonuc;
    },
  };
}

test('collectPrices menüyü çeker ve fiyatları yerele yazar', async () => {
  const cache = new PanoCache('');
  const client = sahteIstemci({ menu: { products: [{ id: 'levrek', price: 850, variants: [] }] } });

  const yazilan = await collectPrices({ remoteClient: client, remoteToken: 't', cache });
  assert.equal(yazilan, 1);
  assert.deepEqual(cache.history('menu.price', 30, 'levrek'), [{ day: localDay(), value: 850 }]);
  assert.deepEqual(client.cagrilar.read, ['/menu']);
});

test('collectPrices aynı gün ikinci kez menüyü çekmez', async () => {
  const cache = new PanoCache('');
  const client = sahteIstemci({ menu: { products: [{ id: 'levrek', price: 850, variants: [] }] } });

  await collectPrices({ remoteClient: client, remoteToken: 't', cache });
  const ikinci = await collectPrices({ remoteClient: client, remoteToken: 't', cache });

  assert.equal(ikinci, 0);
  assert.equal(client.cagrilar.read.length, 1, 'menü günde bir kez çekilmeli');
});

test('collectPrices force ile her zaman taze çeker', async () => {
  const cache = new PanoCache('');
  const client = sahteIstemci({ menu: { products: [{ id: 'levrek', price: 900, variants: [] }] } });

  await collectPrices({ remoteClient: client, remoteToken: 't', cache });
  await collectPrices({ remoteClient: client, remoteToken: 't', cache, force: true });

  assert.equal(client.cagrilar.read.length, 2);
  assert.deepEqual(cache.history('menu.price', 30, 'levrek'), [{ day: localDay(), value: 900 }]);
});

test('pushSnapshots yereldeki kayıtları tek çağrıda gönderir', async () => {
  const cache = new PanoCache('');
  cache.snapshot('ig.followers', 4100, localDay());
  cache.snapshot('menu.price', 850, localDay(), 'levrek');
  const client = sahteIstemci({ writeSonuc: { written: 2, skipped: 0, unknown: [] } });

  const sonuc = await pushSnapshots({ remoteClient: client, remoteToken: 't', cache });
  assert.equal(sonuc.written, 2);
  assert.equal(client.cagrilar.write.length, 1, 'tek POST');
  assert.equal(client.cagrilar.write[0].path, '/snapshots');
  assert.equal(client.cagrilar.write[0].body.items.length, 2);
});

test('pushSnapshots gönderecek bir şey yoksa ağa çıkmaz', async () => {
  const client = sahteIstemci();
  const sonuc = await pushSnapshots({ remoteClient: client, remoteToken: 't', cache: new PanoCache('') });
  assert.equal(sonuc.written, 0);
  assert.equal(client.cagrilar.write.length, 0);
});

test('pullSnapshots sunucudaki günleri yerele yazar', async () => {
  const cache = new PanoCache('');
  const client = sahteIstemci({ rows: [{ day: '2026-07-20', entity: '', value: 4000 }] });

  const cekilen = await pullSnapshots({ remoteClient: client, remoteToken: 't', cache });
  assert.equal(cekilen, PULL_METRICS.length, 'her ölçüt için bir satır çekildi');
  assert.deepEqual(cache.history('ig.followers', 30), [{ day: '2026-07-20', value: 4000 }]);
  assert.equal(client.cagrilar.read.length, PULL_METRICS.length);
});
