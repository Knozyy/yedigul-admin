import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PanoCache } from '../cache.js';
import { instagram } from '../connectors/instagram.js';
import { runConnector } from '../connectors/runner.js';
import { loadConfig } from '../config.js';

const BOS = loadConfig({ SSH_ENABLED: '0' });
const DOLU = loadConfig({ SSH_ENABLED: '0', IG_USER_ID: '17841400000000000', IG_ACCESS_TOKEN: 'tohum-token' });

/** fetch'i sahteler; çağrılan URL'leri kaydeder. */
function sahteFetch(yanitlar) {
  const cagrilar = [];
  const orijinal = globalThis.fetch;
  globalThis.fetch = async (url) => {
    cagrilar.push(String(url));
    for (const [desen, yanit] of yanitlar) {
      if (String(url).includes(desen)) {
        return { ok: yanit.ok !== false, status: yanit.status || 200, json: async () => yanit.body };
      }
    }
    return { ok: false, status: 404, json: async () => ({ error: { message: 'eşleşmeyen istek' } }) };
  };
  return { cagrilar, geriAl: () => { globalThis.fetch = orijinal; } };
}

const PROFIL = { username: 'yedigulbalikanadolukavagi', followers_count: 4182, follows_count: 310, media_count: 268 };
const INSIGHTS = {
  data: [
    { name: 'reach', total_value: { value: 18400 } },
    { name: 'views', total_value: { value: 25100 } },
    { name: 'total_interactions', total_value: { value: 1240 } },
    { name: 'accounts_engaged', total_value: { value: 980 } },
  ],
};
const MEDIA = {
  data: [
    { caption: 'Bugünün levreği', permalink: 'https://instagram.com/p/1', media_type: 'IMAGE', timestamp: '2026-07-25T10:00:00+0000', like_count: 96, comments_count: 7 },
  ],
};

test('anahtar yokken unconfigured, ağa hiç çıkmaz', async () => {
  const { cagrilar, geriAl } = sahteFetch([]);
  try {
    const sonuc = await runConnector(instagram, { config: BOS, cache: new PanoCache('') });
    assert.equal(sonuc.status, 'unconfigured');
    assert.equal(cagrilar.length, 0, 'guard geçilmeden istek atılmamalı');
  } finally {
    geriAl();
  }
});

test('kaldırılmış metrikleri istemez ve metric_type=total_value gönderir', async () => {
  const { cagrilar, geriAl } = sahteFetch([
    ['refresh_access_token', { body: { access_token: 'yeni-token', expires_in: 5184000 } }],
    ['/insights', { body: INSIGHTS }],
    ['/media', { body: MEDIA }],
    ['fields=username', { body: PROFIL }],
  ]);
  try {
    await runConnector(instagram, { config: DOLU, cache: new PanoCache('') });
    const insightsUrl = cagrilar.find((u) => u.includes('/insights'));
    assert.ok(insightsUrl, 'insights çağrılmalı');

    // Meta bunları kaldırdı; istenirse API hata döner.
    assert.equal(insightsUrl.includes('impressions'), false, 'impressions kaldırıldı');
    assert.equal(insightsUrl.includes('profile_views'), false, 'profile_views kaldırıldı');
    // Bu parametre olmadan interaction metrikleri hata döner.
    assert.match(insightsUrl, /metric_type=total_value/);
    assert.match(insightsUrl, /period=day/);
  } finally {
    geriAl();
  }
});

test('profil, insights ve gönderileri tek karta indirger', async () => {
  const { geriAl } = sahteFetch([
    ['refresh_access_token', { body: { access_token: 'yeni-token', expires_in: 5184000 } }],
    ['/insights', { body: INSIGHTS }],
    ['/media', { body: MEDIA }],
    ['fields=username', { body: PROFIL }],
  ]);
  try {
    const sonuc = await runConnector(instagram, { config: DOLU, cache: new PanoCache('') });
    assert.equal(sonuc.status, 'ok');
    assert.equal(sonuc.data.followers, 4182);
    assert.equal(sonuc.data.insights.reach, 18400);
    assert.equal(sonuc.data.insights.views, 25100);
    assert.equal(sonuc.data.posts[0].likes, 96);
    // 5184000 sn tam 60 gün; iki Date.now() aynı milisaniyeye düşerse 60,
    // düşmezse 59 çıkar. Kesin değer yerine aralık kontrol edilir.
    assert.ok(
      sonuc.data.token.daysLeft >= 59 && sonuc.data.token.daysLeft <= 60,
      `token ~60 gün olmalı, ${sonuc.data.token.daysLeft} geldi`,
    );
  } finally {
    geriAl();
  }
});

test('insights düşse bile takipçi sayısı gösterilir', async () => {
  // Küçük hesaplarda Meta bazı metrikleri reddedebilir; kart tamamen
  // boşalmamalı — profil zaten elimizde.
  const { geriAl } = sahteFetch([
    ['refresh_access_token', { body: { access_token: 'y', expires_in: 5184000 } }],
    ['/insights', { ok: false, status: 400, body: { error: { message: 'Yetersiz veri' } } }],
    ['/media', { body: MEDIA }],
    ['fields=username', { body: PROFIL }],
  ]);
  try {
    const sonuc = await runConnector(instagram, { config: DOLU, cache: new PanoCache('') });
    assert.equal(sonuc.status, 'ok', 'insights hatası tüm kartı düşürmemeli');
    assert.equal(sonuc.data.followers, 4182);
    assert.equal(sonuc.data.insights, null);
    assert.match(sonuc.data.insightsError, /Yetersiz veri/);
  } finally {
    geriAl();
  }
});

test('profil okunamazsa konektör error döner', async () => {
  const { geriAl } = sahteFetch([
    ['refresh_access_token', { body: { access_token: 'y', expires_in: 5184000 } }],
    ['fields=username', { ok: false, status: 190, body: { error: { message: 'Token geçersiz', code: 190 } } }],
  ]);
  try {
    const sonuc = await runConnector(instagram, { config: DOLU, cache: new PanoCache('') });
    assert.equal(sonuc.status, 'error');
    assert.match(sonuc.error, /Token geçersiz/);
  } finally {
    geriAl();
  }
});

test('yenilenen token veritabanına yazılır ve sonraki koşuda kullanılır', async () => {
  const cache = new PanoCache('');
  const ilk = sahteFetch([
    ['refresh_access_token', { body: { access_token: 'yenilenmis-token', expires_in: 5184000 } }],
    ['/insights', { body: INSIGHTS }],
    ['/media', { body: MEDIA }],
    ['fields=username', { body: PROFIL }],
  ]);
  try {
    await runConnector(instagram, { config: DOLU, cache });
  } finally {
    ilk.geriAl();
  }

  const saklanan = cache.getToken('instagram');
  assert.equal(saklanan.value, 'yenilenmis-token', '.env tohumu değil, yenilenen token saklanmalı');
  assert.ok(saklanan.expires_at > Date.now());

  // TTL'i atlamak için yeni önbellek; token yine DB'den gelmeli.
  const ikinci = sahteFetch([
    ['/insights', { body: INSIGHTS }],
    ['/media', { body: MEDIA }],
    ['fields=username', { body: PROFIL }],
  ]);
  try {
    const sonuc = await runConnector({ ...instagram, version: 2 }, { config: DOLU, cache });
    assert.equal(sonuc.status, 'ok');
    const profilCagrisi = ikinci.cagrilar.find((u) => u.includes('fields=username'));
    assert.match(profilCagrisi, /yenilenmis-token/, 'saklanan token kullanılmalı');
    assert.equal(
      ikinci.cagrilar.some((u) => u.includes('refresh_access_token')),
      false,
      'taze token 24 saat dolmadan yeniden yenilenmemeli',
    );
  } finally {
    ikinci.geriAl();
  }
});

test('token yenileme başarısız olsa da veri gelir, uyarı taşınır', async () => {
  // Facebook Login ile üretilmiş token bu uca uymaz; pano yine çalışmalı.
  const { geriAl } = sahteFetch([
    ['refresh_access_token', { ok: false, status: 400, body: { error: { message: 'Bu token yenilenemez' } } }],
    ['/insights', { body: INSIGHTS }],
    ['/media', { body: MEDIA }],
    ['fields=username', { body: PROFIL }],
  ]);
  try {
    const sonuc = await runConnector(instagram, { config: DOLU, cache: new PanoCache('') });
    assert.equal(sonuc.status, 'ok', 'yenileme hatası veri çekmeyi engellememeli');
    assert.equal(sonuc.data.followers, 4182);
    assert.match(sonuc.data.token.warning, /yenilenemez/);
  } finally {
    geriAl();
  }
});

test('takipçi trendi panonun kendi anlık görüntülerinden gelir', async () => {
  const cache = new PanoCache('');
  cache.snapshot('ig.followers', 4100, '2026-07-23');
  cache.snapshot('ig.followers', 4150, '2026-07-24');

  const { geriAl } = sahteFetch([
    ['refresh_access_token', { body: { access_token: 'y', expires_in: 5184000 } }],
    ['/insights', { body: INSIGHTS }],
    ['/media', { body: MEDIA }],
    ['fields=username', { body: PROFIL }],
  ]);
  try {
    const sonuc = await runConnector(instagram, { config: DOLU, cache });
    assert.equal(sonuc.data.followerHistory.length, 2);
    assert.equal(sonuc.data.followerChange, 4182 - 4100, 'en eski anlık görüntüye göre değişim');
  } finally {
    geriAl();
  }
});
