import { Unconfigured } from './runner.js';

/** Uzak yanıttaki bir pencereyi panonun beklediği şekle sokar. */
function pencere(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row.id === 'string')
    .map((row) => ({
      id: row.id,
      name: String(row.name_tr || row.id),
      views: Number(row.views) || 0,
    }));
}

/**
 * En çok bakılan ürünler.
 *
 * Yedigül'de sipariş/satış verisi yok; ölçülebilen tek şey ilgi — ürün
 * detayının açılması. Bu yüzden liste "ne satıyor" değil "ne merak ediliyor"
 * sorusunu cevaplar.
 *
 * site-stats gibi dış hesap istemez: veri Yedigül'ün kendi veritabanında,
 * mevcut tünelden okunur. Anlık görüntü (snapshot) kaydı da YOK — o mekanizma
 * API'den geriye dönük ALINAMAYAN ölçütler içindir, bu veri kalıcı ve her an
 * yeniden sorgulanabilir.
 */
export const productViews = {
  id: 'product-views',
  label: 'En çok bakılan ürünler',
  // Sıralama gün içinde yavaş değişir; site hareketliliği kadar sık
  // tazelemenin karşılığı yok.
  ttlMs: 10 * 60 * 1000,
  version: 1,

  guard({ remoteToken }) {
    if (!remoteToken) {
      throw new Unconfigured('Yönetim girişi gerekli.', 'Panoya giriş yapın.');
    }
  },

  async load({ remoteClient, remoteToken }) {
    // İki pencere tek çağrıda gelir; panel 7 gün ile 30 gün arasında geçiş
    // yaparken ağa çıkmaz.
    const data = await remoteClient.read('/stats/products', remoteToken);
    return { week: pencere(data?.week), month: pencere(data?.month) };
  },
};
