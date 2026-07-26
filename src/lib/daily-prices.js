import { truthy } from './product-model.js';

/**
 * Günün fiyatları ekranının tüm karar mantığı. Ekran yalnız durum tutar.
 *
 * Ağa çıkan tek şey `applyDailyPricePlan`'e DIŞARIDAN verilen `patch`; böylece
 * kısmi başarısızlık davranışı tarayıcısız test edilebiliyor.
 */

/**
 * Yazım hatası koruması. Bu değer PATCH döner dönmez canlı menüde görünüyor ve
 * 8500 ile 850000 arası tek tuş — üst sınır olmadan hata ancak müşteri
 * şaşırdığında fark edilir.
 */
export const MAX_DAILY_PRICE = 100000;

/** Piyasa fiyatlı ürünler, menüdeki sırasıyla. Uzak API 1|0 döndürür. */
export function marketProducts(menu) {
  const products = menu?.products;
  if (!Array.isArray(products)) return [];
  return products.filter((product) => truthy(product?.is_market_price));
}

/**
 * Bir kutunun içeriğini çözer.
 *
 * `null` taslak değeri "piyasa fiyatına dön" demektir (kullanıcı satırdaki
 * düğmeye bastı), boş dize ise "bugün bu ürüne dokunma".
 */
export function parseDailyPrice(raw) {
  if (raw === null) return { value: null };
  const text = String(raw ?? '').trim();
  if (!text) return { skip: true };

  // product-model.js'teki optionalNumber ile aynı: Türkçe klavyede ondalık
  // ayırıcı virgüldür.
  const number = Number(text.replace(',', '.'));
  if (!Number.isFinite(number) || number < 0) return { error: 'Geçerli bir fiyat girin.' };
  if (number > MAX_DAILY_PRICE) {
    return { error: `Fiyat ${MAX_DAILY_PRICE.toLocaleString('tr-TR')} TL'den büyük olamaz.` };
  }
  return { value: number };
}

/**
 * Taslak → gönderilecek PATCH adımları.
 *
 * Tek bir geçersiz satır bile varsa HİÇBİR adım üretilmez: yarısı yazılmış bir
 * toplu kayıt, kullanıcının hangi ürünün güncellendiğini bilmemesi demek.
 */
export function buildDailyPricePlan(products, draft) {
  const steps = [];
  const errors = [];

  for (const product of products) {
    if (!(product.id in draft)) continue;
    const parsed = parseDailyPrice(draft[product.id]);
    if (parsed.skip) continue;
    if (parsed.error) {
      errors.push({ id: product.id, name: product.name_tr, message: parsed.error });
      continue;
    }
    // Aynı değeri tekrar yazmak uzakta denetim kaydı satırı üretir.
    const current = product.price ?? null;
    if (parsed.value === current) continue;

    // YALNIZ price. Gövdede is_market_price truthy görülürse sunucu fiyatı
    // zorla null yapar (Yedigül server/routes/admin.js) — girilen fiyat silinir.
    steps.push({ id: product.id, name: product.name_tr, body: { price: parsed.value } });
  }

  return { steps: errors.length ? [] : steps, errors };
}

/**
 * Adımları sırayla gönderir.
 *
 * Sıralı, `Promise.all` değil: uzakta tek SQLite yazıcı ve tek SSH tüneli var,
 * paralellik süre kazandırmaz ama kilitlenme riski getirir.
 *
 * Bir ürün düşerse KALANLAR DENENİR — tek istisna 401. Orada uzak oturum
 * bitmiştir; kalan her istek aynı hatayı alır ve her biri uygulamayı yeniden
 * giriş ekranına atar.
 */
export async function applyDailyPricePlan(plan, patch, onProgress) {
  const ok = [];
  const failed = [];
  let aborted = false;

  for (const [index, step] of plan.steps.entries()) {
    onProgress?.(index, plan.steps.length);
    try {
      await patch(step.id, step.body);
      ok.push(step.id);
    } catch (error) {
      failed.push({ id: step.id, name: step.name, message: error?.message || 'Bilinmeyen hata.' });
      if (error?.status === 401) { aborted = true; break; }
    }
  }

  return { ok, failed, aborted };
}

/** Kaydedilen satırlar taslaktan düşer; başarısızlar tek tıkla tekrar denensin. */
export function pruneDraft(draft, okIds) {
  const kalan = { ...draft };
  for (const id of okIds) delete kalan[id];
  return kalan;
}
