import { localDay } from '../cache.js';
import { priceSnapshots } from './prices.js';

/**
 * Sunucudan geri çekilecek ölçütler.
 *
 * Sunucu doğrulamanın otoritesidir (ayrı depo, kayıt paylaşılamaz); bu liste
 * yalnızca "neyi çekelim" sorusunu yanıtlar. Sunucunun tanımadığı bir ad
 * buraya girerse GET 400 döner ve senkron hata verir — sessiz kalmaz.
 */
export const PULL_METRICS = ['ig.followers', 'ig.reach', 'reviews.rating', 'reviews.count', 'menu.price'];

/**
 * Güncel menüyü çekip ürün fiyatlarını yerele yazar.
 *
 * Ölçüt günlük çözünürlükte olduğu için menü günde bir kez çekilir; panel her
 * açıldığında tünelden menü indirmek boşuna trafik olurdu. force, kullanıcı
 * fiyat değiştirip hemen senkrona bastığında gerekir.
 */
export async function collectPrices({ remoteClient, remoteToken, cache, force = false }) {
  const day = localDay();
  if (!force && cache.hasMetricOnDay('menu.price', day)) return 0;

  const menu = await remoteClient.read('/menu', remoteToken);
  const items = priceSnapshots(menu, day);
  for (const item of items) cache.snapshot(item.metric, item.value, item.day, item.entity);
  return items.length;
}

/** Yereldeki birikimi tek çağrıda sunucuya iter. Upsert olduğu için tekrar zararsız. */
export async function pushSnapshots({ remoteClient, remoteToken, cache, sinceDays = 90 }) {
  const items = cache.allSnapshots(sinceDays);
  if (!items.length) return { written: 0, skipped: 0, unknown: [] };

  const sonuc = await remoteClient.write('/snapshots', { items }, remoteToken);
  if (sonuc?.unknown?.length) {
    // Panel ve sunucu ayrı depolarda; ölçüt adları ayrışırsa burada görünür.
    console.warn('[snapshot] sunucu bilinmeyen ölçüt bildirdi:', sonuc.unknown.join(', '));
  }
  return sonuc;
}

/** Sunucudaki geçmişi yerele indirir — iki bilgisayarın günleri burada birleşir. */
export async function pullSnapshots({ remoteClient, remoteToken, cache }) {
  let cekilen = 0;
  for (const metric of PULL_METRICS) {
    const data = await remoteClient.read(`/snapshots?metric=${encodeURIComponent(metric)}`, remoteToken);
    for (const row of data?.rows || []) {
      cache.snapshot(metric, Number(row.value), String(row.day), String(row.entity ?? ''));
      cekilen += 1;
    }
  }
  return cekilen;
}

/**
 * Pano açılışındaki otomatik senkron. Ateşle-unut: yanıt BEKLENMEZ.
 *
 * Altı kaynaklı panoda senkron gecikmesi panoyu geciktirmemeli; hata da
 * panoyu karartmamalı. Upsert olduğu için bir tur kaçan senkron kendini
 * sonraki açılışta düzeltir.
 */
export function syncInBackground(ctx) {
  (async () => {
    await collectPrices(ctx);
    await pushSnapshots(ctx);
  })().catch((error) => {
    console.warn('[snapshot] arka plan senkronu başarısız:', error.message);
  });
}
