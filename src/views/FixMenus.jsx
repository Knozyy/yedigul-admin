import { useState } from 'react';
import Modal from '../components/Modal.jsx';
import { tasi } from '../lib/reorder.js';

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

function ItemEditor({ items, setItems, products }) {
  const byCategory = products.reduce((acc, product) => {
    (acc[product.category_id] ||= []).push(product);
    return acc;
  }, {});

  const ekle = () => setItems((rows) => [...rows, { product_id: products[0]?.id || '', qty: 1 }]);
  const guncelle = (index, key, value) =>
    setItems((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));

  return (
    <div className="form-stack">
      <div className="section-title"><h2>İçindekiler</h2></div>
      {items.map((row, index) => (
        <div className="variant-row" key={index}>
          <label className="field">
            <span>Ürün</span>
            <select value={row.product_id} onChange={(e) => guncelle(index, 'product_id', e.target.value)}>
              {Object.entries(byCategory).map(([categoryId, list]) => (
                <optgroup label={categoryId} key={categoryId}>
                  {list.map((product) => <option key={product.id} value={product.id}>{product.name_tr}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Adet</span>
            <input
              type="number" min="1" value={row.qty}
              onChange={(e) => guncelle(index, 'qty', Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <button
            type="button" className="danger-button compact"
            onClick={() => setItems((rows) => rows.filter((_, i) => i !== index))}
          >Kaldır</button>
        </div>
      ))}
      <button type="button" className="secondary-button" onClick={ekle} disabled={!products.length}>
        + Ürün ekle
      </button>
    </div>
  );
}

function SetForm({ set, products, onClose, onSave, onDelete }) {
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

    <ItemEditor items={items} setItems={setItems} products={products} />

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
          onClose={() => setEditing(undefined)}
          onSave={save}
          onDelete={remove}
        />
      </Modal>
    )}
  </div>;
}
