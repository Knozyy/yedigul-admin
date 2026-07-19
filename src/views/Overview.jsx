import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

function Metric({ label, value, note }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

export default function Overview({ menu }) {
  const [extra, setExtra] = useState({ stats: null, history: [] });
  useEffect(() => {
    let active = true;
    Promise.allSettled([api.get('/admin/stats'), api.get('/admin/history?limit=8')]).then(([stats, history]) => {
      if (!active) return;
      setExtra({
        stats: stats.status === 'fulfilled' ? stats.value : null,
        history: history.status === 'fulfilled' ? history.value.entries || [] : [],
      });
    });
    return () => { active = false; };
  }, [menu]);

  const visible = menu.products.filter((p) => !p.is_hidden).length;
  const unavailable = menu.products.filter((p) => p.is_available === 0).length;
  const pictured = menu.products.filter((p) => p.image_url).length;
  return (
    <div className="view-stack">
      <header className="page-heading"><div><span className="eyebrow">CANLI VERİTABANI</span><h1>Genel Bakış</h1></div><span className="live-badge"><i /> Bağlı</span></header>
      <section className="metrics-grid">
        <Metric label="Toplam ürün" value={menu.products.length} note={`${visible} menüde görünür`} />
        <Metric label="Aktif kategori" value={menu.categories.filter((c) => c.is_active !== 0).length} note={`${menu.categories.length} kategori kayıtlı`} />
        <Metric label="Görselli ürün" value={pictured} note={`${menu.products.length - pictured} ürün görselsiz`} />
        <Metric label="Tükendi" value={unavailable} note="Menüde tükendi görünür" />
      </section>
      {extra.stats && (
        <section className="panel-card">
          <div className="section-title"><div><span className="eyebrow">SON 30 GÜN</span><h2>Menü trafiği</h2></div></div>
          <div className="traffic-row">
            <div><strong>{extra.stats.today?.menu_view || 0}</strong><span>Bugün görüntüleme</span></div>
            <div><strong>{extra.stats.week?.menu_view || 0}</strong><span>Bu hafta</span></div>
            <div><strong>{extra.stats.month?.qr_scan || 0}</strong><span>QR tarama</span></div>
          </div>
        </section>
      )}
      <section className="panel-card">
        <div className="section-title"><div><span className="eyebrow">DENETİM KAYDI</span><h2>Son değişiklikler</h2></div></div>
        {extra.history.length ? <div className="history-list">{extra.history.map((entry) => (
          <div key={entry.id}><i className={`history-icon ${entry.action}`} /><div><strong>{entry.detail || `${entry.entity} ${entry.action}`}</strong><small>{entry.created_at || entry.at || ''}</small></div></div>
        ))}</div> : <p className="empty-text">Henüz gösterilecek değişiklik kaydı yok.</p>}
      </section>
    </div>
  );
}

