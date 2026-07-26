import { useState } from 'react';
import Modal from '../components/Modal.jsx';
import { tasi } from '../lib/reorder.js';
import { adetDegistir, urunCikar, urunEkle } from '../lib/set-items.js';

const BLANK = {
  id: '', name_tr: '', name_en: '', name_ar: '', name_ru: '',
  desc_tr: '', desc_en: '', desc_ar: '', desc_ru: '',
  price: '', is_active: true, items: [],
};

const tl = (value) => `${Number(value || 0).toLocaleString('tr-TR')} ₺`;

/** Setin bileşenlerinin ham toplamı — tek fiyatı yoksa varyantın ilki alınır. */
export function hamToplam(items, productsById) {
  let toplam = 0;
  for (const row of items) {
    const product = productsById[row.product_id];
    if (!product) continue;
    const price = product.price ?? product.variants?.[0]?.price ?? null;
    if (price != null) toplam += Number(price) * Number(row.qty || 1);
  }
  return toplam;
}

/** Tek ürünün fiyatı; varyantlıysa ilk varyant temsil eder. */
function urunFiyati(product) {
  return product?.price ?? product?.variants?.[0]?.price ?? null;
}

/**
 * İçindekiler seçici.
 *
 * Önceki hâli her kalem için 74 ürünlük bir açılır liste açtırıyordu; 6 kalemlik
 * bir menü kurmak 6 kez avlanmak demekti. Burada seçilenler üstte durur, altta
 * aranabilir liste vardır ve ekleme tek tıktır — Ürünler ekranının (arama +
 * kategori çipleri) dilinin aynısı, böylece panelde tek bir arama alışkanlığı
 * öğrenilir.
 */
function ItemEditor({ items, setItems, products, categories }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  const productsById = Object.fromEntries(products.map((p) => [p.id, p]));
  const seciliAdet = Object.fromEntries(items.map((i) => [i.product_id, i.qty]));

  const q = query.trim().toLocaleLowerCase('tr');
  const bulunan = products.filter((product) => {
    if (category !== 'all' && product.category_id !== category) return false;
    if (!q) return true;
    return `${product.name_tr} ${product.name_en}`.toLocaleLowerCase('tr').includes(q);
  });

  const adet = (productId, delta) => setItems((rows) => adetDegistir(rows, productId, delta));
  const ekle = (productId) => setItems((rows) => urunEkle(rows, productId));
  const cikar = (productId) => setItems((rows) => urunCikar(rows, productId));

  return (
    <div className="form-stack">
      <div className="section-title">
        <h2>İçindekiler</h2>
        <span className="result-count">
          {items.length ? `${items.length} kalem · ${tl(hamToplam(items, productsById))}` : 'Henüz kalem yok'}
        </span>
      </div>

      {items.length > 0 && (
        <section className="data-list">
          {items.map((row) => {
            const product = productsById[row.product_id];
            const fiyat = urunFiyati(product);
            return (
              <div className="set-item-row" key={row.product_id}>
                <span className="product-main">
                  <strong>{product?.name_tr || row.product_id}</strong>
                  <small>{fiyat == null ? 'fiyatsız' : `${tl(fiyat)} × ${row.qty} = ${tl(fiyat * row.qty)}`}</small>
                </span>
                <span className="qty-stepper">
                  <button type="button" className="icon-button" aria-label="Azalt" onClick={() => adet(row.product_id, -1)}>−</button>
                  <b>{row.qty}</b>
                  <button type="button" className="icon-button" aria-label="Artır" onClick={() => adet(row.product_id, 1)}>+</button>
                </span>
                <button type="button" className="icon-button" aria-label="Çıkar" onClick={() => cikar(row.product_id)}>✕</button>
              </div>
            );
          })}
        </section>
      )}

      <div className="toolbar">
        <label className="search-field">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ürün ara…" />
        </label>
        <span className="result-count">{bulunan.length} ürün</span>
      </div>

      <div className="chips">
        <button type="button" className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>Tümü</button>
        {categories.map((item) => (
          <button
            type="button" key={item.id}
            className={category === item.id ? 'active' : ''}
            onClick={() => setCategory(item.id)}
          >{item.name_tr}</button>
        ))}
      </div>

      <section className="data-list set-picker">
        {bulunan.map((product) => {
          const adet = seciliAdet[product.id] || 0;
          const fiyat = urunFiyati(product);
          return (
            <button type="button" className="product-row" key={product.id} onClick={() => ekle(product.id)}>
              <span className="set-add-mark" aria-hidden="true">{adet ? '✓' : '+'}</span>
              <span className="product-main">
                <strong>{product.name_tr}</strong>
                <small>{fiyat == null ? 'fiyatsız' : tl(fiyat)}</small>
              </span>
              {adet > 0 && <i className="inactive-badge">{adet} adet</i>}
            </button>
          );
        })}
        {!bulunan.length && <p className="empty-text">Aramanıza uyan ürün yok.</p>}
      </section>
    </div>
  );
}

function SetForm({ set, products, categories, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(() => (set
    ? { ...set, price: set.price ?? '', is_active: set.is_active !== 0 }
    : { ...BLANK }));
  const [items, setItems] = useState(() => (set?.items || []).map((i) => ({ ...i })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set_ = (key, value) => setForm((old) => ({ ...old, [key]: value }));

  const productsById = Object.fromEntries(products.map((p) => [p.id, p]));
  const ham = hamToplam(items, productsById);
  const satis = Number(form.price || 0);
  const fark = ham - satis;

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await onSave({
        ...form,
        price: form.price === '' ? null : Number(form.price),
        is_active: form.is_active ? 1 : 0,
        items: items.filter((i) => i.product_id),
      });
      onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm(`“${set.name_tr}” fix menüsü silinsin mi?`)) return;
    setBusy(true);
    try { await onDelete(set.id); onClose(); } catch (e) { setError(e.message); setBusy(false); }
  }

  return <form onSubmit={submit} className="form-stack">
    {error && <div className="alert error">{error}</div>}
    <div className="form-grid two">
      <label className="field"><span>Kimlik *</span>
        <input value={form.id} disabled={Boolean(set)} pattern="[A-Za-z0-9_-]+" required
          onChange={(e) => set_('id', e.target.value)} placeholder="fix-menu-1" /></label>
      <label className="field"><span>Fiyat (₺)</span>
        <input type="number" min="0" step="0.01" value={form.price}
          onChange={(e) => set_('price', e.target.value)} /></label>
      <label className="field"><span>Türkçe ad *</span>
        <input lang="tr" value={form.name_tr} required onChange={(e) => set_('name_tr', e.target.value)} /></label>
      <label className="field"><span>İngilizce ad *</span>
        <input lang="en" value={form.name_en} required onChange={(e) => set_('name_en', e.target.value)} /></label>
      <label className="field"><span>Arapça ad</span>
        <input lang="ar" dir="rtl" value={form.name_ar || ''} onChange={(e) => set_('name_ar', e.target.value)} /></label>
      <label className="field"><span>Rusça ad</span>
        <input lang="ru" value={form.name_ru || ''} onChange={(e) => set_('name_ru', e.target.value)} /></label>
      <label className="field"><span>Türkçe açıklama</span>
        <input lang="tr" value={form.desc_tr || ''} onChange={(e) => set_('desc_tr', e.target.value)} /></label>
      <label className="field"><span>İngilizce açıklama</span>
        <input lang="en" value={form.desc_en || ''} onChange={(e) => set_('desc_en', e.target.value)} /></label>
      <label className="field"><span>Arapça açıklama</span>
        <input lang="ar" dir="rtl" value={form.desc_ar || ''} onChange={(e) => set_('desc_ar', e.target.value)} /></label>
      <label className="field"><span>Rusça açıklama</span>
        <input lang="ru" value={form.desc_ru || ''} onChange={(e) => set_('desc_ru', e.target.value)} /></label>
    </div>

    <label className="check-card">
      <input type="checkbox" checked={form.is_active} onChange={(e) => set_('is_active', e.target.checked)} />
      <span>Menüde göster</span>
    </label>

    <ItemEditor items={items} setItems={setItems} products={products} categories={categories} />

    {/* Fix menü fiyatı bileşenlerin toplamından bağımsız belirlenir; aradaki
        marj fiyatlar oynadıkça sessizce erir. Burada gözle görünür olsun. */}
    {items.length > 0 && (
      <div className="alert info">
        Bileşenler ayrı ayrı <strong>{tl(ham)}</strong>
        {satis > 0 && <> · fix menü <strong>{tl(satis)}</strong> · fark <strong>{tl(Math.abs(fark))}</strong> {fark >= 0 ? 'indirim' : 'fazla'}</>}
      </div>
    )}

    <div className="form-actions">
      {set && <button type="button" className="danger-button" disabled={busy} onClick={remove}>Fix menüyü sil</button>}
      <span className="spacer" />
      <button type="button" className="secondary-button" onClick={onClose}>Vazgeç</button>
      <button className="primary-button" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
    </div>
  </form>;
}

export default function FixMenus({ menu, onReload, request }) {
  const [editing, setEditing] = useState(undefined);
  const [surukleAktif, setSurukleAktif] = useState(false);
  const [kaynak, setKaynak] = useState(null);
  const [siralama, setSiralama] = useState(null);
  const [hata, setHata] = useState('');

  const setler = siralama || menu.sets || [];
  const productsById = Object.fromEntries((menu.products || []).map((p) => [p.id, p]));

  async function save(form) {
    if (editing) await request('patch', `/admin/sets/${editing.id}`, form);
    else await request('post', '/admin/sets', form);
    await onReload();
  }
  async function remove(id) { await request('del', `/admin/sets/${id}`); await onReload(); }

  async function birak(hedef) {
    setSurukleAktif(false);
    if (kaynak === null || kaynak === hedef) { setKaynak(null); return; }
    const onceki = setler;
    const yeni = tasi(setler, kaynak, hedef);
    setKaynak(null); setSiralama(yeni); setHata('');
    try {
      await request('put', '/admin/sets/order', { ids: yeni.map((s) => s.id) });
      await onReload();
      setSiralama(null);
    } catch (error) { setSiralama(onceki); setHata(error.message); }
  }

  return <div className="view-stack">
    <header className="page-heading">
      <div><span className="eyebrow">PAKET MENÜLER</span><h1>Fix Menü</h1></div>
      <button className="primary-button" onClick={() => setEditing(null)}>+ Yeni fix menü</button>
    </header>

    {hata && <div className="alert error">{hata}</div>}

    <section className="data-list category-list">
      {setler.map((set, index) => (
        <div
          className={`category-drag${kaynak === index ? ' dragging' : ''}`}
          key={set.id}
          draggable={surukleAktif}
          onDragStart={() => setKaynak(index)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => birak(index)}
          onDragEnd={() => { setSurukleAktif(false); setKaynak(null); }}
        >
          <span className="drag-mark" title="Sıralamak için sürükleyin" onPointerDown={() => setSurukleAktif(true)}>≡</span>
          <button className="category-row" onClick={() => setEditing(set)}>
            <span className="category-index">{String(index).padStart(2, '0')}</span>
            <span className="product-main">
              <strong>{set.name_tr}</strong>
              <small>
                {set.items.length} ürün · {set.price == null ? 'fiyatsız' : tl(set.price)}
                {set.items.length > 0 && ` · bileşenler ${tl(hamToplam(set.items, productsById))}`}
              </small>
            </span>
            {set.is_active === 0 && <i className="inactive-badge">Pasif</i>}
            <span className="edit-circle">›</span>
          </button>
        </div>
      ))}
      {!setler.length && <p className="empty-text">Henüz fix menü yok. Sağ üstten ekleyebilirsiniz.</p>}
    </section>

    {editing !== undefined && (
      <Modal wide title={editing ? 'Fix menüyü düzenle' : 'Yeni fix menü'} onClose={() => setEditing(undefined)}>
        <SetForm
          key={editing?.id || 'new'}
          set={editing}
          products={menu.products || []}
          categories={menu.categories || []}
          onClose={() => setEditing(undefined)}
          onSave={save}
          onDelete={remove}
        />
      </Modal>
    )}
  </div>;
}
