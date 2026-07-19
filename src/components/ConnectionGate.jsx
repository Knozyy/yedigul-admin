import { useState } from 'react';

export function ConnectionGate({ tunnel, onConnect, error }) {
  const [busy, setBusy] = useState(false);
  async function connect() {
    setBusy(true);
    try { await onConnect(); } finally { setBusy(false); }
  }
  return (
    <div className="gate-page">
      <div className="gate-card">
        <span className="brand-mark large">Y</span>
        <span className="eyebrow">YEDİGÜL LOKAL YÖNETİM</span>
        <h1>Güvenli bağlantıyı aç</h1>
        <p>Panel internete yayınlanmaz. Canlı yönetim API’sine yalnızca bu bilgisayardan açılan SSH tüneli üzerinden ulaşır.</p>
        <div className="status-line"><i className={`status-dot ${tunnel.state}`} /> {tunnel.state === 'error' ? 'Bağlantı hatası' : 'Tünel kapalı'}</div>
        {(error || tunnel.error) && <div className="alert error">{error || tunnel.error}</div>}
        <button className="primary-button full" disabled={busy} onClick={connect}>{busy ? 'Bağlanıyor…' : 'SSH tünelini aç'}</button>
        <small className="security-note">Anahtar ve sunucu bilgileri yalnızca bu bilgisayardaki .env dosyasından okunur.</small>
      </div>
    </div>
  );
}

export function LoginGate({ onLogin, error }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try { await onLogin(password); } finally { setBusy(false); }
  }
  return (
    <div className="gate-page">
      <form className="gate-card" onSubmit={submit}>
        <span className="brand-mark large">Y</span>
        <span className="eyebrow">BAĞLANTI HAZIR</span>
        <h1>Yönetim oturumu</h1>
        <p>Canlı veritabanını düzenlemek için sunucudaki yönetim şifresini girin. Şifre diske kaydedilmez.</p>
        {error && <div className="alert error">{error}</div>}
        <label className="field"><span>Yönetim şifresi</span><input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" /></label>
        <button className="primary-button full" disabled={busy || !password}>{busy ? 'Doğrulanıyor…' : 'Panele gir'}</button>
      </form>
    </div>
  );
}

