import {
  buildRequestBody,
  buildTranslationInput,
  parseTranslationResponse,
} from '../shared/translate.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 20000;

/**
 * Gemini çevirmeni.
 *
 * Tarayıcı buraya gelmek zorunda: panelin CSP'si `connect-src 'self'`, yani
 * sayfa Google'a çıkamaz. Yan fayda olarak API anahtarı hiç tarayıcıya inmez.
 *
 * instagram.js'in HTTP desenini izler (global fetch, AbortSignal.timeout,
 * Türkçe hata, özgün hata `cause`'da) ama konektör DEĞİLDİR — Pano paneli değil.
 */
export class Translator {
  constructor(config, fetchImpl = globalThis.fetch) {
    this.config = config;
    this.fetch = fetchImpl;
  }

  get configured() {
    return Boolean(this.config.gemini.apiKey);
  }

  /** `{ group, source }` → `{ en, ar, ru }`. Hata durumunda `error.status` taşır. */
  async translate(group, source) {
    if (!this.configured) {
      throw hata('Çeviri servisi yapılandırılmamış.', 503, '.env → GEMINI_API_KEY');
    }

    // Doğrulama ağdan ÖNCE: boş ya da çok uzun kaynak için istek harcamayalım.
    let items;
    try {
      items = buildTranslationInput(group, source);
    } catch (error) {
      throw hata(error.message, 400);
    }

    const { apiKey, model } = this.config.gemini;
    const url = `${API_BASE}/${encodeURIComponent(model)}:generateContent`;

    let response;
    try {
      response = await this.fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // Anahtar BAŞLIKTA; URL'ye konsaydı erişim loglarına düşerdi.
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(buildRequestBody(group, items)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw hata('Çeviri servisine ulaşılamadı.', 504, '', error);
    }

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const detay = payload?.error?.message || `HTTP ${response.status}`;
      // Yukarı akış durumu OLDUĞU GİBİ taşınmaz. Gemini 401'i (yanlış anahtar)
      // lokal 401'e dönüşürse arayüz kullanıcıyı panelden atar — anahtar
      // hatası oturum hatası gibi görünürdü. Tek istisna kota (429).
      const status = response.status === 429 ? 429 : 502;
      throw hata(`Çeviri servisi hata verdi: ${detay}`, status);
    }

    try {
      return parseTranslationResponse(payload, group, items.length);
    } catch (error) {
      throw hata(error.message, 502, '', error);
    }
  }
}

function hata(message, status, hint = '', cause = undefined) {
  return Object.assign(new Error(message), { status, hint, cause });
}
