import { useState } from 'react';
import Modal from '../components/Modal.jsx';
import { missingCategoryTranslationCodes } from '../lib/i18n.js';

const BLANK = { id: '', name_tr: '', name_en: '', name_ar: '', name_ru: '', sort: 0, is_active: true };

function CategoryForm({ category, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(() => category ? { ...category, is_active: category.is_active !== 0 } : { ...BLANK });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await onSave({ ...form, sort: Number(form.sort || 0) }); onClose(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`“${category.name_tr}” kategorisi silinsin mi? İçinde ürün varsa sunucu işlemi reddeder.`)) return;
    setBusy(true);
    try { await onDelete(category.id); onClose(); } catch (e) { setError(e.message); setBusy(false); }
  }
  return <form onSubmit={submit} className="form-stack">
    {error && <div className="alert error">{error}</div>}
    <div className="form-grid two">
      <label className="field"><span>Kategori kimliği *</span><input value={form.id} disabled={Boolean(category)} pattern="[A-Za-z0-9_-]+" onChange={(e) => set('id', e.target.value)} placeholder="sicak-baslangic" required /></label>
      <label className="field"><span>Menü sırası</span><input type="number" value={form.sort} onChange={(e) => set('sort', e.target.value)} /></label>
      <label className="field"><span>Türkçe *</span><input lang="tr" value={form.name_tr} onChange={(e) => set('name_tr', e.target.value)} required /></label>
      <label className="field"><span>İngilizce *</span><input lang="en" value={form.name_en} onChange={(e) => set('name_en', e.target.value)} required /></label>
      <label className="field"><span>Arapça</span><input lang="ar" dir="rtl" value={form.name_ar || ''} onChange={(e) => set('name_ar', e.target.value)} /></label>
      <label className="field"><span>Rusça</span><input lang="ru" value={form.name_ru || ''} onChange={(e) => set('name_ru', e.target.value)} /></label>
    </div>
    <label className="check-card"><input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} /><span>Menüde aktif</span></label>
    <div className="form-actions">{category && <button type="button" className="danger-button" disabled={busy} onClick={remove}>Kategoriyi sil</button>}<span className="spacer" /><button type="button" className="secondary-button" onClick={onClose}>Vazgeç</button><button className="primary-button" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button></div>
  </form>;
}

export default function Categories({ menu, onReload, request }) {
  const [editing, setEditing] = useState(undefined);
  async function save(form) {
    if (editing) await request('patch', `/admin/categories/${editing.id}`, form);
    else await request('post', '/admin/categories', form);
    await onReload();
  }
  async function remove(id) { await request('del', `/admin/categories/${id}`); await onReload(); }
  return <div className="view-stack">
    <header className="page-heading"><div><span className="eyebrow">MENÜ DÜZENİ</span><h1>Kategoriler</h1></div><button className="primary-button" onClick={() => setEditing(null)}>+ Yeni kategori</button></header>
    <section className="data-list category-list">{menu.categories.map((category) => {
      const count = menu.products.filter((p) => p.category_id === category.id).length;
      const missingLanguages = missingCategoryTranslationCodes(category);
      return <button className="category-row" key={category.id} onClick={() => setEditing(category)}><span className="drag-mark">≡</span><span className="category-index">{String(category.sort).padStart(2, '0')}</span><span className="product-main"><strong>{category.name_tr}</strong><small>{category.name_en} · {count} ürün{missingLanguages.length ? ` · ${missingLanguages.map((code) => `${code.toUpperCase()} eksik`).join(', ')}` : ''}</small></span>{category.is_active === 0 && <i className="inactive-badge">Pasif</i>}<span className="edit-circle">›</span></button>;
    })}</section>
    {editing !== undefined && <Modal title={editing ? 'Kategoriyi düzenle' : 'Yeni kategori'} onClose={() => setEditing(undefined)}><CategoryForm category={editing} onClose={() => setEditing(undefined)} onSave={save} onDelete={remove} /></Modal>}
  </div>;
}
