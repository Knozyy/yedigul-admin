import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PanoCache } from '../cache.js';
import { CONNECTORS } from '../connectors/index.js';
import { runConnector } from '../connectors/runner.js';
import { productViews } from '../connectors/product-views.js';
import { loadConfig } from '../config.js';

const config = loadConfig({ SSH_ENABLED: '0' });

function ctx(extra = {}) {
  return { config, cache: new PanoCache(''), ...extra };
}

/** Uzak yanıt taklidi; istenen yolu kaydeder. */
function fakeRemote(payload, kayit = []) {
  return {
    read: async (path) => {
      kayit.push(path);
      if (typeof payload === 'function') return payload(path);
      return payload;
    },
  };
}

const YANIT = {
  week: [
    { id: 'levrek', name_tr: 'Izgara Levrek', views: 30 },
    { id: 'kalamar', name_tr: 'Kalamar Tava', views: 21 },
  ],
  month: [{ id: 'levrek', name_tr: 'Izgara Levrek', views: 96 }],
};

test('konektör panoya kayıtlı', () => {
  assert.ok(CONNECTORS.includes(productViews));
});

test('giriş yapılmamışsa unconfigured döner, hata değil', async () => {
  const sonuc = await runConnector(productViews, ctx({ remoteClient: fakeRemote(YANIT), remoteToken: null }));
  assert.equal(sonuc.status, 'unconfigured');
  assert.equal(sonuc.data, undefined);
});

test('iki pencere tek çağrıda alınır ve panonun beklediği şekle girer', async () => {
  const cagrilar = [];
  const sonuc = await runConnector(
    productViews,
    ctx({ remoteClient: fakeRemote(YANIT, cagrilar), remoteToken: 'tkn' }),
  );

  assert.equal(sonuc.status, 'ok');
  assert.deepEqual(cagrilar, ['/stats/products'], 'pencere başına ayrı istek atılmamalı');
  assert.deepEqual(sonuc.data.week, [
    { id: 'levrek', name: 'Izgara Levrek', views: 30 },
    { id: 'kalamar', name: 'Kalamar Tava', views: 21 },
  ]);
  assert.deepEqual(sonuc.data.month, [{ id: 'levrek', name: 'Izgara Levrek', views: 96 }]);
});

test('boş liste hata değil: henüz bakılma yoksa pano yine ok döner', async () => {
  const sonuc = await runConnector(
    productViews,
    ctx({ remoteClient: fakeRemote({ week: [], month: [] }), remoteToken: 'tkn' }),
  );
  assert.equal(sonuc.status, 'ok');
  assert.deepEqual(sonuc.data, { week: [], month: [] });
});

// Eski sunucu ya da yarım yanıt panoyu karartmamalı; kart yalnızca boş görünür.
test('eksik veya bozuk alanlar çökmez, süzülür', async () => {
  const sonuc = await runConnector(
    productViews,
    ctx({
      remoteClient: fakeRemote({ week: [{ name_tr: 'idsiz' }, { id: 'a', views: 'x' }] }),
      remoteToken: 'tkn',
    }),
  );
  assert.equal(sonuc.status, 'ok');
  assert.deepEqual(sonuc.data.week, [{ id: 'a', name: 'a', views: 0 }]);
  assert.deepEqual(sonuc.data.month, []);
});

test('uzak sunucu düşerse konektör error olur, pano çalışmaya devam eder', async () => {
  const patlayan = { read: async () => { throw new Error('tünel düştü'); } };
  const sonuc = await runConnector(productViews, ctx({ remoteClient: patlayan, remoteToken: 'tkn' }));
  assert.equal(sonuc.status, 'error');
  assert.match(sonuc.error, /tünel düştü/);
});
