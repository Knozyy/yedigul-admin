import { Unconfigured } from './runner.js';

/**
 * Henüz uygulanmamış konektörler (Faz 3-4). Instagram artık
 * `instagram.js` içinde gerçek uygulamasıyla duruyor.
 *
 * Boş yer tutucu yerine gerçek konektör kaydı olmalarının sebebi: pano ilk
 * günden tüm düzenini gösterir, hangi anahtarın eksik olduğunu söyler, ve
 * sıra o faza geldiğinde yalnızca load() gövdesi dolar — arayüzde hiçbir
 * şey değişmez.
 *
 * Anahtar kontrolü guard() içindedir: önbellekten önce çalışır, böylece
 * .env'den anahtar silindiğinde panel TTL boyunca bağlıymış gibi görünmez.
 */

export const analytics = {
  id: 'analytics',
  label: 'Google Analytics',
  ttlMs: 30 * 60 * 1000,
  guard({ config }) {
    const { propertyId, credentialsPath } = config.ga4;
    if (!propertyId || !credentialsPath) {
      throw new Unconfigured(
        'Faz 3’te açılır. Sitede henüz ölçüm kodu yok; kod eklendikten sonra veri ertesi günden itibaren birikir.',
        '.env → GA4_PROPERTY_ID ve GA4_CREDENTIALS_PATH',
      );
    }
  },
  async load() {
    throw new Error('Analytics konektörü henüz uygulanmadı (Faz 3).');
  },
};

export const reviews = {
  id: 'reviews',
  label: 'Google yorumları',
  ttlMs: 6 * 60 * 60 * 1000,
  guard({ config }) {
    const { apiKey, placeId } = config.places;
    if (!apiKey || !placeId) {
      throw new Unconfigured(
        'Faz 4’te açılır. Puan, toplam yorum sayısı ve son 5 yorum için Places API anahtarı gerekiyor.',
        '.env → PLACES_API_KEY ve PLACES_PLACE_ID',
      );
    }
  },
  async load() {
    throw new Error('Yorumlar konektörü henüz uygulanmadı (Faz 4).');
  },
};
