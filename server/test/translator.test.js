import assert from 'node:assert/strict';
import test from 'node:test';
import { Translator } from '../translate.js';
import { loadConfig } from '../config.js';

const ANAHTARSIZ = loadConfig({ SSH_ENABLED: '0' });
const DOLU = loadConfig({ SSH_ENABLED: '0', GEMINI_API_KEY: 'gizli-anahtar' });

/** Tek çağrılık sahte fetch: isteği kaydeder, verilen yanıtı döner. */
function sahteFetch(yanit) {
  const cagrilar = [];
  const fetchImpl = async (url, init) => {
    cagrilar.push({ url: String(url), init });
    if (yanit instanceof Error) throw yanit;
    return {
      ok: yanit.ok !== false,
      status: yanit.status || 200,
      json: async () => yanit.body ?? {},
    };
  };
  return { cagrilar, fetchImpl };
}

const basarili = (items) => ({
  body: { candidates: [{ content: { parts: [{ text: JSON.stringify({ items }) }] } }] },
});

const UC = { en: 'Sea bass', ar: 'قاروص', ru: 'Сибас' };

test('anahtar yokken ağa hiç çıkılmaz', async () => {
  const { cagrilar, fetchImpl } = sahteFetch(basarili([UC]));
  const t = new Translator(ANAHTARSIZ, fetchImpl);

  assert.equal(t.configured, false);
  await assert.rejects(() => t.translate('name', 'Levrek'), (e) => e.status === 503);
  assert.equal(cagrilar.length, 0);
});

test('anahtar başlıkta gider, URL de değil', async () => {
  const { cagrilar, fetchImpl } = sahteFetch(basarili([UC]));
  await new Translator(DOLU, fetchImpl).translate('name', 'Levrek');

  const { url, init } = cagrilar[0];
  assert.equal(init.headers['x-goog-api-key'], 'gizli-anahtar');
  assert.equal(url.includes('gizli-anahtar'), false, 'URL erişim loglarına düşer');
  assert.equal(init.method, 'POST');
});

test('model adı .env den gelir', async () => {
  const config = loadConfig({ SSH_ENABLED: '0', GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-3-pro' });
  const { cagrilar, fetchImpl } = sahteFetch(basarili([UC]));
  await new Translator(config, fetchImpl).translate('name', 'Levrek');
  assert.match(cagrilar[0].url, /gemini-3-pro:generateContent/);
});

test('başarılı yanıt üç dile çözülür', async () => {
  const { fetchImpl } = sahteFetch(basarili([UC, { en: 'Lemon', ar: 'ليمون', ru: 'Лимон' }]));
  const values = await new Translator(DOLU, fetchImpl).translate('ing', 'Levrek, Limon');
  assert.deepEqual(values, { en: 'Sea bass, Lemon', ar: 'قاروص, ليمون', ru: 'Сибас, Лимон' });
});

// EN KRİTİK: Gemini 401'i (yanlış anahtar) lokal 401'e dönüşürse arayüz
// kullanıcıyı panelden atar — anahtar hatası oturum hatası gibi görünür.
test('yukarı akış 401 i lokal 401 e dönüşmez', async () => {
  const { fetchImpl } = sahteFetch({ ok: false, status: 401, body: { error: { message: 'API key not valid' } } });
  await assert.rejects(
    () => new Translator(DOLU, fetchImpl).translate('name', 'Levrek'),
    (e) => e.status === 502 && /API key not valid/.test(e.message),
  );
});

test('kota hatası 429 olarak taşınır', async () => {
  const { fetchImpl } = sahteFetch({ ok: false, status: 429, body: { error: { message: 'quota' } } });
  await assert.rejects(() => new Translator(DOLU, fetchImpl).translate('name', 'Levrek'), (e) => e.status === 429);
});

test('bilinmeyen model hatası teşhis edilebilir mesajla döner', async () => {
  const { fetchImpl } = sahteFetch({ ok: false, status: 404, body: { error: { message: 'models/xyz is not found' } } });
  await assert.rejects(
    () => new Translator(DOLU, fetchImpl).translate('name', 'Levrek'),
    (e) => e.status === 502 && /is not found/.test(e.message),
  );
});

test('ağ hatası 504 döner', async () => {
  const { fetchImpl } = sahteFetch(new Error('timeout'));
  await assert.rejects(
    () => new Translator(DOLU, fetchImpl).translate('name', 'Levrek'),
    (e) => e.status === 504 && /ulaşılamadı/.test(e.message),
  );
});

test('bozuk model çıktısı 502 döner', async () => {
  const { fetchImpl } = sahteFetch({ body: { candidates: [{ content: { parts: [{ text: 'düz yazı' }] } }] } });
  await assert.rejects(() => new Translator(DOLU, fetchImpl).translate('name', 'Levrek'), (e) => e.status === 502);
});

test('boş kaynak ağa çıkmadan 400 döner', async () => {
  const { cagrilar, fetchImpl } = sahteFetch(basarili([UC]));
  await assert.rejects(() => new Translator(DOLU, fetchImpl).translate('name', '  '), (e) => e.status === 400);
  assert.equal(cagrilar.length, 0);
});

test('bilinmeyen alan ağa çıkmadan 400 döner', async () => {
  const { cagrilar, fetchImpl } = sahteFetch(basarili([UC]));
  await assert.rejects(() => new Translator(DOLU, fetchImpl).translate('yok', 'Levrek'), (e) => e.status === 400);
  assert.equal(cagrilar.length, 0);
});
