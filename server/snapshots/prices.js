/**
 * Menü yanıtından günlük fiyat anlık görüntüleri üretir.
 *
 * Fiyat geçmişini hiçbir API vermez: canlı veritabanı yalnızca GÜNCEL fiyatı
 * tutar. Biriktirmezsek "zam yapalım mı" sorusunun dayanağı hiç oluşmaz.
 *
 * Saf fonksiyon — ağ ve veritabanı bilmez, bu yüzden tek başına test edilir.
 */
/**
 * Fiyatı sayıya çevirir; yoksa NaN döner.
 *
 * Number(null) === 0 olduğu için doğrudan Number kullanılamaz: fiyatı null
 * olan ürün (gün fiyatı / varyantlı ürün) sessizce "0 TL" diye kaydedilirdi.
 */
function fiyat(value) {
  if (value === null || value === undefined || value === '') return NaN;
  return Number(value);
}

export function priceSnapshots(menu, day) {
  const items = [];
  for (const product of menu?.products || []) {
    const id = String(product?.id || '');
    if (!id) continue;
    if (product.is_hidden) continue;

    // Öncelik kesin: tekil fiyat varsa varyantlar yazılmaz, aksi hâlde aynı
    // ürün iki ayrı seriye bölünürdü.
    const price = fiyat(product.price);
    if (Number.isFinite(price)) {
      items.push({ day, metric: 'menu.price', entity: id, value: price });
      continue;
    }

    const variants = Array.isArray(product.variants) ? product.variants : [];
    variants.forEach((variant, index) => {
      const value = fiyat(variant?.price);
      // entity varyant SIRASINI taşır. Varyantlar yeniden sıralanırsa seri
      // kayar; adı kullanmak çeviriyle değiştiği için daha kırılgan olurdu.
      if (Number.isFinite(value)) {
        items.push({ day, metric: 'menu.price', entity: `${id}-${index}`, value });
      }
    });
  }

  // Fix menü satış fiyatı bileşenlerin toplamından BAĞIMSIZ belirlenir; aradaki
  // indirim marjı ürün fiyatları oynadıkça sessizce erir. Ayrı seri tutulur ki
  // ikisi yan yana çizilebilsin.
  for (const set of menu?.sets || []) {
    const id = String(set?.id || '');
    if (!id) continue;
    const value = fiyat(set.price);
    if (Number.isFinite(value)) {
      items.push({ day, metric: 'menu.setPrice', entity: id, value });
    }
  }
  return items;
}
