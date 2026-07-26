import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PanoCache } from '../cache.js';
import { runAll, runConnector, Unconfigured } from '../connectors/runner.js';
import { siteStats } from '../connectors/site-stats.js';
import { instagram } from '../connectors/instagram.js';
import { analytics, reviews } from '../connectors/pending.js';
import { loadConfig } from '../config.js';

const config = loadConfig({ SSH_ENABLED: '0' });

function ctx(extra = {}) {
  return { config, cache: new PanoCache(''), ...extra };
}

test('anahtarı olmayan konektör unconfigured döner, hata değil', async () => {
  for (const connector of [instagram, analytics, reviews]) {
    const result = await runConnector(connector, ctx());
    assert.equal(result.status, 'unconfigured', `${connector.id} unconfigured olmalı`);
    assert.ok(result.message.length > 10);
    assert.match(result.hint, /\.env/);
  }
});

test('çöken konektör tek başına düşer, diğerleri çalışmaya devam eder', async () => {
  const saglam = { id: 'saglam', label: 'Sağlam', ttlMs: 0, load: async () => ({ deger: 42 }) };
  const cokende = { id: 'coken', label: 'Çöken', ttlMs: 0, load: async () => { throw new Error('API kotası doldu'); } };
  const eksik = { id: 'eksik', label: 'Eksik', ttlMs: 0, load: async () => { throw new Unconfigured('Anahtar yok.', '.env → X'); } };

  const results = await runAll([saglam, cokende, eksik], ctx());

  assert.deepEqual(results.map((r) => r.status), ['ok', 'error', 'unconfigured']);
  assert.deepEqual(results[0].data, { deger: 42 });
  assert.match(results[1].error, /kotası doldu/);
});

test('çağrı düşerse önbellekteki son veri bayat olarak gösterilir', async () => {
  const cache = new PanoCache('');
  let saglikli = true;
  const connector = {
    id: 'degisken',
    label: 'Değişken',
    ttlMs: 0,
    load: async () => {
      if (!saglikli) throw new Error('sunucu yanıt vermedi');
      return { puan: 4.4 };
    },
  };

  const ilk = await runConnector(connector, ctx({ cache }));
  assert.equal(ilk.status, 'ok');
  assert.equal(ilk.stale, false);

  saglikli = false;
  const ikinci = await runConnector(connector, ctx({ cache }));
  assert.equal(ikinci.status, 'error');
  assert.equal(ikinci.stale, true, 'bayat veri işaretlenmeli');
  assert.deepEqual(ikinci.data, { puan: 4.4 }, 'son bilinen veri korunmalı');
});

test('TTL içinde ikinci çağrı ağa çıkmaz', async () => {
  const cache = new PanoCache('');
  let cagri = 0;
  const connector = {
    id: 'sayac',
    label: 'Sayaç',
    ttlMs: 60_000,
    load: async () => { cagri += 1; return { cagri }; },
  };

  await runConnector(connector, ctx({ cache }));
  await runConnector(connector, ctx({ cache }));
  assert.equal(cagri, 1, 'TTL dolmadan yeniden çekilmemeli');
});

test('oturum kapanınca önbellekteki veri sızmaz', async () => {
  // Gerçek koşularda yakalandı: runner önbelleği guard'dan ÖNCE okursa,
  // çıkış yapmış kullanıcıya önceki oturumun verisi gösteriliyordu.
  const cache = new PanoCache('');
  const remoteClient = {
    read: async (path) =>
      path === '/stats'
        ? { today: { day: '2026-07-25', menu_view: 222, qr_scan: 138 }, days: [] }
        : { entries: [] },
  };

  const girisli = await runConnector(siteStats, ctx({ cache, remoteClient, remoteToken: 'tkn' }));
  assert.equal(girisli.status, 'ok');
  assert.equal(girisli.data.today.menu_view, 222);

  // Aynı önbellek, token yok: TTL dolmamış olsa bile veri görünmemeli.
  const girissiz = await runConnector(siteStats, ctx({ cache, remoteClient, remoteToken: null }));
  assert.equal(girissiz.status, 'unconfigured', 'çıkış sonrası veri gösterilmemeli');
  assert.equal(girissiz.data, undefined, 'önbellekteki veri sızmamalı');
});

test('anahtar silinince panel önbellekten beslenmeye devam etmez', async () => {
  const cache = new PanoCache('');
  const dolu = loadConfig({ SSH_ENABLED: '0', PLACES_API_KEY: 'anahtar', PLACES_PLACE_ID: 'yer' });
  const canli = { ...reviews, load: async () => ({ puan: 4.4 }) };

  const ilk = await runConnector(canli, { config: dolu, cache });
  assert.equal(ilk.status, 'ok');

  // .env'den anahtar silindi: kart hemen "bağlı değil" olmalı.
  const sonra = await runConnector(canli, { config, cache });
  assert.equal(sonra.status, 'unconfigured');
  assert.equal(sonra.data, undefined);
});

test('sürüm artınca eski şekilli önbellek servis edilmez', async () => {
  const cache = new PanoCache('');
  const eski = { id: 'sekil', label: 'Şekil', ttlMs: 60_000, version: 1, load: async () => ({ ad: 'eski' }) };
  const yeni = { ...eski, version: 2, load: async () => ({ ad: 'yeni', ekAlan: true }) };

  const ilk = await runConnector(eski, ctx({ cache }));
  assert.deepEqual(ilk.data, { ad: 'eski' });

  // TTL dolmadı ama sürüm değişti: yeni şekil çekilmeli, eskisi değil.
  const sonra = await runConnector(yeni, ctx({ cache }));
  assert.equal(sonra.status, 'ok');
  assert.equal(sonra.data.ad, 'yeni');
  assert.equal(sonra.data.ekAlan, true);
});

test('site istatistikleri girişsiz unconfigured, girişliyken seri üretir', async () => {
  const yok = await runConnector(siteStats, ctx({ remoteToken: null }));
  assert.equal(yok.status, 'unconfigured');

  const remoteClient = {
    read: async (path) => {
      if (path === '/stats') {
        return {
          today: { day: '2026-07-25', menu_view: 248, qr_scan: 156 },
          week: { menu_view: 900, qr_scan: 400 },
          month: { menu_view: 3200, qr_scan: 1400 },
          days: [
            { day: '2026-07-18', menu_view: 257, qr_scan: 150 },
            { day: '2026-07-25', menu_view: 248, qr_scan: 156 },
          ],
        };
      }
      return { entries: [{ id: 1, action: 'update', entity: 'product', detail: 'Levrek güncellendi', ts: Date.now() }] };
    },
  };

  const sonuc = await runConnector(siteStats, ctx({ remoteClient, remoteToken: 'tkn' }));
  assert.equal(sonuc.status, 'ok');
  assert.equal(sonuc.data.days.length, 30, 'seyrek seri 30 güne tamamlanmalı');
  assert.equal(sonuc.data.today.remote, 92, '248 - 156 = 92 uzaktan');
  assert.equal(sonuc.data.delta.previous, 257);
  assert.equal(sonuc.data.delta.direction, 'down');
  assert.equal(sonuc.data.history.length, 1);
});

test('denetim kaydı okunamazsa istatistikler yine gelir', async () => {
  const remoteClient = {
    read: async (path) => {
      if (path === '/stats') {
        return { today: { day: '2026-07-25', menu_view: 10, qr_scan: 4 }, days: [] };
      }
      throw new Error('history ucu 500 döndü');
    },
  };
  const sonuc = await runConnector(siteStats, ctx({ remoteClient, remoteToken: 'tkn' }));
  assert.equal(sonuc.status, 'ok');
  assert.deepEqual(sonuc.data.history, []);
});

test('önbellek günlük anlık görüntüyü gün başına tek kayıt tutar', () => {
  const cache = new PanoCache('');
  cache.snapshot('ig.followers', 4180, '2026-07-24');
  cache.snapshot('ig.followers', 4182, '2026-07-25');
  cache.snapshot('ig.followers', 4190, '2026-07-25');

  const gecmis = cache.history('ig.followers');
  assert.equal(gecmis.length, 2);
  assert.deepEqual(gecmis.map((r) => r.day), ['2026-07-24', '2026-07-25']);
  assert.equal(gecmis[1].value, 4190, 'aynı günün son değeri kalmalı');
});
