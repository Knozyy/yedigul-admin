export default function Connection({ boot, onDisconnect }) {
  const tunnel = boot.tunnel;
  return <div className="view-stack">
    <header className="page-heading"><div><span className="eyebrow">LOKAL ERİŞİM</span><h1>Bağlantı</h1></div></header>
    <section className="panel-card connection-card">
      <div className="connection-hero"><span className="connection-orb">⌁</span><div><span className="live-badge"><i /> Aktif</span><h2>{tunnel.mode === 'ssh' ? 'SSH tüneli açık' : 'Lokal geliştirme bağlantısı'}</h2><p>Yönetim trafiği tarayıcıdan internete doğrudan çıkmıyor; lokal kontrol katmanı üzerinden iletiliyor.</p></div></div>
      <dl className="connection-details"><div><dt>Mod</dt><dd>{tunnel.mode === 'ssh' ? 'SSH port yönlendirme' : 'Doğrudan loopback'}</dd></div><div><dt>Lokal hedef</dt><dd>127.0.0.1:{tunnel.localPort}</dd></div><div><dt>Başlangıç</dt><dd>{tunnel.startedAt ? new Date(tunnel.startedAt).toLocaleString('tr-TR') : 'Uygulama başlangıcı'}</dd></div><div><dt>Panel yayını</dt><dd>Dış ağa kapalı</dd></div></dl>
      <div className="alert info">Canlı sunucuya erişim anahtarı ve yönetim oturumu yalnızca bu uygulamanın belleğinde tutulur. Uygulama kapanınca oturum silinir.</div>
      {tunnel.mode === 'ssh' && <button className="danger-button" onClick={onDisconnect}>Tüneli kapat</button>}
    </section>
  </div>;
}

