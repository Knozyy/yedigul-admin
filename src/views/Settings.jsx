import { useEffect, useState } from 'react';
export default function Settings({ request }) {
  const [form, setForm] = useState(null);
  const [state, setState] = useState({ busy: false, error: '', success: '' });
  useEffect(() => { request('get', '/admin/settings').then(setForm).catch((e) => setState((s) => ({ ...s, error: e.message }))); }, [request]);
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  async function submit(event) {
    event.preventDefault(); setState({ busy: true, error: '', success: '' });
    try { setForm(await request('put', '/admin/settings', form)); setState({ busy: false, error: '', success: 'Ayarlar canlı veritabanına kaydedildi.' }); }
    catch (e) { setState({ busy: false, error: e.message, success: '' }); }
  }
  return <div className="view-stack">
    <header className="page-heading"><div><span className="eyebrow">RESTORAN BİLGİLERİ</span><h1>Ayarlar</h1></div></header>
    {!form ? <section className="panel-card"><p className="empty-text">{state.error || 'Ayarlar yükleniyor…'}</p></section> : <form className="panel-card form-stack" onSubmit={submit}>
      {state.error && <div className="alert error">{state.error}</div>}{state.success && <div className="alert success">{state.success}</div>}
      <div className="section-title"><div><span className="eyebrow">DUYURU BANDI</span><h2>Çok dilli duyuru</h2></div></div>
      <div className="form-grid two">
        <label className="field"><span>Türkçe</span><textarea lang="tr" value={form.announcement_tr || ''} onChange={(e) => set('announcement_tr', e.target.value)} /></label>
        <label className="field"><span>İngilizce</span><textarea lang="en" value={form.announcement_en || ''} onChange={(e) => set('announcement_en', e.target.value)} /></label>
        <label className="field"><span>Arapça</span><textarea lang="ar" dir="rtl" value={form.announcement_ar || ''} onChange={(e) => set('announcement_ar', e.target.value)} /></label>
        <label className="field"><span>Rusça</span><textarea lang="ru" value={form.announcement_ru || ''} onChange={(e) => set('announcement_ru', e.target.value)} /></label>
      </div>
      <div className="section-title top-gap"><div><span className="eyebrow">İLETİŞİM</span><h2>Menü bilgi alanları</h2></div></div>
      <div className="form-grid two">
        <label className="field"><span>Telefon</span><input value={form.info_phone || ''} onChange={(e) => set('info_phone', e.target.value)} /></label>
        <label className="field"><span>Çalışma saatleri</span><input value={form.info_hours || ''} onChange={(e) => set('info_hours', e.target.value)} /></label>
        <label className="field"><span>Wi-Fi bilgisi</span><input value={form.info_wifi || ''} onChange={(e) => set('info_wifi', e.target.value)} /></label>
        <label className="field"><span>Instagram</span><input value={form.info_instagram || ''} onChange={(e) => set('info_instagram', e.target.value)} /></label>
        <label className="field"><span>Canlı site adresi</span><input value={form.public_base_url || ''} onChange={(e) => set('public_base_url', e.target.value)} /></label>
        <label className="field"><span>Menü yolu</span><input value={form.menu_path || ''} onChange={(e) => set('menu_path', e.target.value)} /></label>
      </div>
      <div className="form-actions"><span className="spacer" /><button className="primary-button" disabled={state.busy}>{state.busy ? 'Kaydediliyor…' : 'Ayarları kaydet'}</button></div>
    </form>}
  </div>;
}
