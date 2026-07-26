/**
 * Fix menü içerik listesi işlemleri.
 *
 * Saf tutulur: seçici arayüzü tıklama olaylarına bağlı, doğrudan test edilmesi
 * zor. "Adet sıfıra düşünce kalem çıkar" ve "var olan ürüne tekrar tıklayınca
 * artar" gibi davranışlar burada tek başına sınanır.
 *
 * Ürün listede BİR KEZ bulunur (sunucudaki PK ile aynı kural); ikinci kez
 * eklemek yeni satır değil, adet artışıdır.
 */

export function urunEkle(items, productId) {
  if (!productId) return items;
  if (items.some((row) => row.product_id === productId)) {
    return items.map((row) => (row.product_id === productId ? { ...row, qty: row.qty + 1 } : row));
  }
  return [...items, { product_id: productId, qty: 1 }];
}

/** Adet değiştirir; sıfıra veya altına inen kalem listeden düşer. */
export function adetDegistir(items, productId, delta) {
  return items
    .map((row) => (row.product_id === productId ? { ...row, qty: row.qty + delta } : row))
    .filter((row) => row.qty > 0);
}

export function urunCikar(items, productId) {
  return items.filter((row) => row.product_id !== productId);
}
