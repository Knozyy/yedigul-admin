import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';

let remoteServer;
let localServer;
let baseUrl;
let uploadProbe;

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

before(async () => {
  const remote = express();
  remote.use(express.json());
  remote.post('/api/auth/login', (req, res) => {
    if (req.body.password !== 'dogru-sifre') return res.status(401).json({ error: 'Hatalı şifre' });
    res.json({ authenticated: true, token: 'remote-test-token' });
  });
  remote.get('/api/admin/menu', (req, res) => {
    if (req.headers.authorization !== 'Bearer remote-test-token') return res.status(401).json({ error: 'Yetkisiz' });
    res.json({ categories: [{ id: 'balik', name_tr: 'Balıklar' }], products: [{ id: 'levrek', name_tr: 'Levrek' }] });
  });
  remote.post('/api/admin/products/levrek/images', express.raw({ type: 'multipart/form-data', limit: '1mb' }), (req, res) => {
    if (req.headers.authorization !== 'Bearer remote-test-token') return res.status(401).json({ error: 'Yetkisiz' });
    uploadProbe = { contentType: req.headers['content-type'], body: req.body };
    res.json({ id: 'levrek', name_tr: 'Levrek', images: ['/uploads/levrek-test.webp'], image_url: '/uploads/levrek-test.webp' });
  });
  remoteServer = await listen(remote);
  const remotePort = remoteServer.address().port;
  const config = loadConfig({
    SSH_ENABLED: '0',
    REMOTE_ADMIN_BASE_URL: `http://127.0.0.1:${remotePort}`,
    PUBLIC_MENU_URL: 'https://www.yedigulrestorant.com/menu/',
  });
  const tunnel = { status: () => ({ mode: 'direct', state: 'direct', localPort: remotePort, error: '', startedAt: null }), start: async () => {}, stop: async () => {} };
  localServer = await listen(createApp({ config, tunnel }));
  baseUrl = `http://127.0.0.1:${localServer.address().port}`;
});

after(async () => {
  await Promise.all([close(localServer), close(remoteServer)]);
});

test('dış ağ adresine bağlanmayı yapılandırma aşamasında reddeder', () => {
  assert.throws(() => loadConfig({ LOCAL_HOST: '0.0.0.0' }), /loopback/);
  assert.throws(() => loadConfig({ REMOTE_ADMIN_BASE_URL: 'https://example.com' }), /loopback/);
});

test('bootstrap HttpOnly lokal oturum ve CSRF anahtarı üretir', async () => {
  const response = await fetch(`${baseUrl}/local-api/bootstrap`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /yg_local_sid=.*HttpOnly.*SameSite=Strict/i);
  const data = await response.json();
  assert.ok(data.csrf.length >= 32);
  assert.equal(data.authenticated, false);
});

test('CSRF olmadan giriş yapılamaz; token tarayıcıya dönmeden yönetim isteğine eklenir', async () => {
  const bootstrapResponse = await fetch(`${baseUrl}/local-api/bootstrap`);
  const cookie = bootstrapResponse.headers.get('set-cookie').split(';')[0];
  const bootstrap = await bootstrapResponse.json();

  const rejected = await fetch(`${baseUrl}/local-api/session/login`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ password: 'dogru-sifre' }),
  });
  assert.equal(rejected.status, 403);

  const login = await fetch(`${baseUrl}/local-api/session/login`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': bootstrap.csrf }, body: JSON.stringify({ password: 'dogru-sifre' }),
  });
  assert.equal(login.status, 200);
  assert.deepEqual(await login.json(), { authenticated: true });

  const menu = await fetch(`${baseUrl}/local-api/admin/menu`, { headers: { cookie } });
  assert.equal(menu.status, 200);
  assert.equal((await menu.json()).products[0].name_tr, 'Levrek');
});

test('yabancı Origin yazma isteklerini reddeder', async () => {
  const response = await fetch(`${baseUrl}/local-api/session/login`, {
    method: 'POST',
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'dogru-sifre' }),
  });
  assert.equal(response.status, 403);
});

test('multipart görsel gövdesini ve content-type sınırını uzak APIye aynen iletir', async () => {
  const bootstrapResponse = await fetch(`${baseUrl}/local-api/bootstrap`);
  const cookie = bootstrapResponse.headers.get('set-cookie').split(';')[0];
  const bootstrap = await bootstrapResponse.json();
  const login = await fetch(`${baseUrl}/local-api/session/login`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': bootstrap.csrf }, body: JSON.stringify({ password: 'dogru-sifre' }),
  });
  assert.equal(login.status, 200);

  const form = new FormData();
  form.append('image', new Blob(['fake-webp-content'], { type: 'image/webp' }), 'levrek.webp');
  const upload = await fetch(`${baseUrl}/local-api/admin/products/levrek/images`, {
    method: 'POST', headers: { cookie, 'x-csrf-token': bootstrap.csrf }, body: form,
  });
  assert.equal(upload.status, 200);
  assert.match(uploadProbe.contentType, /^multipart\/form-data; boundary=/);
  assert.ok(Buffer.isBuffer(uploadProbe.body));
  assert.match(uploadProbe.body.toString('utf8'), /name="image"/);
  assert.match(uploadProbe.body.toString('utf8'), /fake-webp-content/);
});
