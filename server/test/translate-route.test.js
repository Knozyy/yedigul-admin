import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';

let remoteServer, localServer, baseUrl;
/** Enjekte edilen çevirmenin gördüğü çağrılar. */
let cagrilar = [];
let sonuc = { en: 'Sea bass', ar: 'قاروص', ru: 'Сибас' };

const listen = (app) => new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const close = (s) => new Promise((r) => s.close(r));

before(async () => {
  const remote = express();
  remote.use(express.json());
  remote.post('/api/auth/login', (req, res) => {
    if (req.body.password !== 'dogru-sifre') return res.status(401).json({ error: 'Hatalı şifre' });
    res.json({ authenticated: true, token: 'remote-test-token' });
  });
  remoteServer = await listen(remote);

  const config = loadConfig({
    SSH_ENABLED: '0',
    REMOTE_ADMIN_BASE_URL: `http://127.0.0.1:${remoteServer.address().port}`,
    GEMINI_API_KEY: 'gizli-anahtar',
  });
  const tunnel = { status: () => ({ mode: 'direct', state: 'direct', localPort: 0, error: '', startedAt: null }), start: async () => {}, stop: async () => {} };

  // remoteClient/connectors gibi çevirmen de enjekte edilebilir: uç sözleşmesi
  // gerçek Gemini'ye çıkmadan sınanır.
  const translator = {
    configured: true,
    translate: async (group, source) => {
      cagrilar.push({ group, source });
      if (sonuc instanceof Error) throw sonuc;
      return sonuc;
    },
  };
  localServer = await listen(createApp({ config, tunnel, translator }));
  baseUrl = `http://127.0.0.1:${localServer.address().port}`;
});

after(async () => { await close(localServer); await close(remoteServer); });

/** Taze oturum: bootstrap → giriş. Çerez ve CSRF döner. */
async function oturum({ girisYap = true } = {}) {
  const boot = await fetch(`${baseUrl}/local-api/bootstrap`);
  const cookie = boot.headers.get('set-cookie').split(';')[0];
  const { csrf } = await boot.json();
  if (girisYap) {
    await fetch(`${baseUrl}/local-api/session/login`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify({ password: 'dogru-sifre' }),
    });
  }
  return { cookie, csrf };
}

const cevir = ({ cookie, csrf }, body) =>
  fetch(`${baseUrl}/local-api/translate`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) },
    body: JSON.stringify(body),
  });

test('bootstrap yalnız boolean sızdırır, API anahtarını değil', async () => {
  const boot = await (await fetch(`${baseUrl}/local-api/bootstrap`)).json();
  assert.equal(boot.translate, true);
  assert.equal(JSON.stringify(boot).includes('gizli-anahtar'), false);
});

test('CSRF olmadan 403', async () => {
  const s = await oturum();
  const res = await cevir({ cookie: s.cookie, csrf: '' }, { group: 'name', source: 'Levrek' });
  assert.equal(res.status, 403);
});

test('oturum yokken 401 ve çevirmen hiç çağrılmaz', async () => {
  cagrilar = [];
  const s = await oturum({ girisYap: false });
  const res = await cevir(s, { group: 'name', source: 'Levrek' });
  assert.equal(res.status, 401);
  assert.equal(cagrilar.length, 0);
});

test('geçerli istek çeviriyi döndürür', async () => {
  cagrilar = [];
  const s = await oturum();
  const res = await cevir(s, { group: 'ing', source: 'Levrek, Limon' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { group: 'ing', values: sonuc });
  assert.deepEqual(cagrilar, [{ group: 'ing', source: 'Levrek, Limon' }]);
});

test('çevirmenin durum kodu yanıta taşınır', async () => {
  const s = await oturum();
  const onceki = sonuc;

  sonuc = Object.assign(new Error('Bilinmeyen çeviri alanı.'), { status: 400 });
  assert.equal((await cevir(s, { group: 'yok', source: 'x' })).status, 400);

  sonuc = Object.assign(new Error('Çeviri servisi hata verdi: kota'), { status: 429 });
  assert.equal((await cevir(s, { group: 'name', source: 'x' })).status, 429);

  // Gemini 401'i buraya 502 olarak gelir; lokal 401 olsaydı arayüz kullanıcıyı
  // panelden atardı.
  sonuc = Object.assign(new Error('Çeviri servisi hata verdi: API key not valid'), { status: 502 });
  const res = await cevir(s, { group: 'name', source: 'x' });
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /API key not valid/);

  sonuc = onceki;
});

test('yapılandırılmamış anahtar 503 ve ipucu döner', async () => {
  const s = await oturum();
  const onceki = sonuc;
  sonuc = Object.assign(new Error('Çeviri servisi yapılandırılmamış.'), { status: 503, hint: '.env → GEMINI_API_KEY' });
  const res = await cevir(s, { group: 'name', source: 'x' });
  assert.equal(res.status, 503);
  assert.match((await res.json()).hint, /GEMINI_API_KEY/);
  sonuc = onceki;
});
