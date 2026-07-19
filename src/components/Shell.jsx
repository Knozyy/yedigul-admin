const NAV = [
  ['overview', 'Genel Bakış', '◫'],
  ['products', 'Ürünler', '◇'],
  ['categories', 'Kategoriler', '≡'],
  ['settings', 'Ayarlar', '⚙'],
  ['connection', 'Bağlantı', '⌁'],
];

export default function Shell({ active, onSelect, onLogout, publicMenuUrl, children }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">Y</span>
          <div><strong>Yedigül</strong><small>Lokal Yönetim</small></div>
        </div>
        <nav className="side-nav" aria-label="Yönetim bölümleri">
          {NAV.map(([id, label, icon]) => (
            <button key={id} className={active === id ? 'active' : ''} onClick={() => onSelect(id)}>
              <span aria-hidden="true">{icon}</span>{label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a href={publicMenuUrl} target="_blank" rel="noreferrer">Menüyü görüntüle ↗</a>
          <button onClick={onLogout}>Oturumu kapat</button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
      <nav className="mobile-nav" aria-label="Yönetim bölümleri">
        {NAV.slice(0, 4).map(([id, label, icon]) => (
          <button key={id} className={active === id ? 'active' : ''} onClick={() => onSelect(id)}>
            <span aria-hidden="true">{icon}</span><small>{label}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}

