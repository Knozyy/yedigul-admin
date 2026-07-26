import { useState } from 'react';
import { api } from '../lib/api.js';
import {
  applyDailyPricePlan,
  buildDailyPricePlan,
  marketProducts,
  pruneDraft,
} from '../lib/daily-prices.js';
import { priceLabel } from '../lib/product-model.js';

/**
 * Günün Fiyatları.
 *
 * Balık fiyatı her gün değişir; eski panelde bu ekran vardı, yeni panele
 * taşınmamıştı ve her ürün için ayrı düzenleme penceresi açmak gerekiyordu.
 *
 * Kutular BOŞ başlar, ürünün fiyatı girili olsa bile: boş = "bugün dokunma".
 * Dolu başlasaydı dalgınlıkla basılan bir Kaydet dünkü fiyatı tekrar yazardı.
 */
export default function DailyPrices({ menu, onReload, request }) {
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [rowErrors, setRowErrors] = useState({});
  const [summary, setSummary] = useState(null);

  const products = marketProducts(menu);
  const yaz = (id, value) => setDraft((old) => ({ ...old, [id]: value }));

  async function kaydet() {
    const plan = buildDailyPricePlan(products, draft);
    setRowErrors(Object.fromEntries(plan.errors.map((e) => [e.id, e.message])));
    if (plan.errors.length) {
      setSummary({ tone: 'error', text: 'Girilen değerlerde hata var; hiçbir fiyat gönderilmedi.' });
      return;
    }
    if (!plan.steps.length) {
      setSummary({ tone: 'info', text: 'Değişen bir fiyat yok.' });
      return;
    }

    setBusy(true);
    setSummary(null);
    setProgress({ done: 0, total: plan.steps.length });
    try {
      const sonuc = await applyDailyPricePlan(
        plan,
        (id, body) => request('patch', `/admin/products/${id}`, body),
        (done, total) => setProgress({ done, total }),
      );

      setDraft((old) => pruneDraft(old, sonuc.ok));
      setRowErrors(Object.fromEntries(sonuc.failed.map((f) => [f.id, f.message])));
      setSummary(ozet(sonuc));
      await onReload();

      // Anlık görüntü toplayıcısı günde bir kez korumalı ve pano açılışında
      // zaten çalıştı; zorlamazsak bugün girilen fiyat BUGÜNE hiç kaydedilmez,
      // yarın yarının günüyle damgalanır. Ateşle-unut: kullanıcı "Kaydet"e
      // bastı, "Eşitle"ye değil — fiyatlar kaydedildi, muhasebe hatası için
      // kırmızı uyarı "kayıt başarısız" gibi okunurdu.
      if (sonuc.ok.length) api.post('/panel/sync').catch(() => {});
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return <div className="view-stack">
    <header className="page-heading">
      <div><span className="eyebrow">PİYASA FİYATLI ÜRÜNLER</span><h1>Günün Fiyatları</h1></div>
      {products.length > 0 && (
        <button className="primary-button" disabled={busy} onClick={kaydet}>
          {busy && progress ? `Kaydediliyor… (${progress.done + 1}/${progress.total})` : 'Fiyatları Kaydet'}
        </button>
      )}
    </header>

    {summary && <div className={`alert ${summary.tone}`}>{summary.text}</div>}

    <section className="data-list">
      {products.map((product) => {
        const hata = rowErrors[product.id];
        const geriDonuyor = draft[product.id] === null;
        return (
          <div className="set-item-row" key={product.id}>
            <span className="product-main">
              <strong>{product.name_tr}</strong>
              <small>
                {/* "Bugün girilmedi" DEMİYORUZ: uzak taraf yalnız güncel değeri
                    tutuyor, hangi gün girildiği bilinmiyor. */}
                {product.price == null ? 'Fiyat girilmemiş' : priceLabel(product)}
                {hata && <b className="daily-row-error"> · {hata}</b>}
              </small>
            </span>

            {product.is_hidden ? <i className="inactive-badge">Gizli</i> : null}

            {geriDonuyor ? (
              <>
                <span className="result-count">Piyasa fiyatına dönecek</span>
                <button type="button" className="secondary-button compact" disabled={busy}
                  onClick={() => yaz(product.id, '')}>Vazgeç</button>
              </>
            ) : (
              <>
                {/* type="number" DEĞİL: Chrome "8,50" için '' döndürür, o da
                    boş-atla kuralına takılıp sessizce yutulurdu. */}
                <input
                  className="daily-price-input"
                  type="text" inputMode="decimal"
                  aria-label={`${product.name_tr} bugünkü fiyat`}
                  placeholder={product.price ?? '—'}
                  value={draft[product.id] ?? ''}
                  disabled={busy}
                  onChange={(event) => yaz(product.id, event.target.value)}
                />
                {product.price != null && (
                  <button type="button" className="secondary-button compact" disabled={busy}
                    onClick={() => yaz(product.id, null)}>Piyasa fiyatına dön</button>
                )}
              </>
            )}
          </div>
        );
      })}
      {!products.length && (
        <p className="empty-text">
          Piyasa fiyatlı ürün yok. Ürünler ekranından bir ürünü düzenleyip “Piyasa fiyatı” işaretleyin.
        </p>
      )}
    </section>

    {products.length > 0 && (
      <p className="split-note">
        Girilen fiyat menüde “Piyasa Fiyatı” yerine görünür. Kutuyu boş bırakmak o ürüne
        dokunmaz; “Piyasa fiyatına dön” ise fiyatı kaldırıp tekrar “Piyasa Fiyatı” yazdırır.
      </p>
    )}
  </div>;
}

function ozet({ ok, failed, aborted }) {
  if (aborted) {
    return { tone: 'error', text: `${ok.length} ürün kaydedildi. Uzak oturum düştüğü için kalanlar gönderilmedi.` };
  }
  if (!failed.length) return { tone: 'success', text: `${ok.length} üründe günün fiyatı güncellendi.` };
  if (!ok.length) return { tone: 'error', text: `${failed.length} ürün kaydedilemedi. İşaretli satırlara bakın.` };
  return { tone: 'error', text: `${ok.length} ürün kaydedildi, ${failed.length} ürün kaydedilemedi. İşaretli satırlara bakın.` };
}
