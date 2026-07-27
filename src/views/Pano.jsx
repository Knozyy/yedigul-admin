import { useState } from 'react';
import ConnectorCard, { SERIES } from '../components/ConnectorCard.jsx';
import PeriodRhythm from '../components/PeriodRhythm.jsx';
import { WEEKDAYS_LONG, weekdayIndex } from '../../shared/rhythm.js';
import { clock, logTime, num, since } from '../lib/format.js';
import { api } from '../lib/api.js';

const ARROW = { up: '▲', down: '▼', flat: '■' };

function panelById(panels, id) {
  return panels.find((panel) => panel.id === id)
    || { id, label: id, status: 'error', error: 'Panel bulunamadı.' };
}

function Metric({ label, value, note }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

export default function Pano({ menu, panel, onSynced }) {
  const panels = panel?.panels || [];

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');

  async function esitle() {
    setSyncing(true);
    setSyncError('');
    try {
      await api.post('/panel/sync');
      await onSynced?.();
    } catch (error) {
      // Elle basılan işlem: arka plan senkronunun aksine hata gizlenmez.
      setSyncError(error.message);
    } finally {
      setSyncing(false);
    }
  }
  const stats = panelById(panels, 'site-stats');
  const health = panelById(panels, 'health');
  const viewed = panelById(panels, 'product-views');
  // Anahtarı girilmemiş kaynaklar GİZLENİR. Başta "pano ilk günden tüm düzenini
  // göstersin" diye yer tutucu olarak duruyorlardı; fazlar uzayınca üç tane
  // kalıcı "bağlı değil" kartına dönüştüler ve yalnız yer kapladılar.
  // Anahtar .env'e girilince kart kendiliğinden geri gelir.
  //
  // 'error' GİZLENMEZ: orada kaynak yapılandırılmış ama çağrı düşmüş demektir,
  // kullanıcının görmesi gereken tam olarak budur.
  const rest = ['instagram', 'analytics', 'reviews']
    .map((id) => panelById(panels, id))
    .filter((item) => item.status !== 'unconfigured');

  const visible = menu.products.filter((p) => !p.is_hidden).length;
  const unavailable = menu.products.filter((p) => p.is_available === 0).length;
  const pictured = menu.products.filter((p) => p.image_url).length;

  return (
    <div className="view-stack">
      <header className="page-heading">
        <div><span className="eyebrow">CANLI VERİTABANI</span><h1>Pano</h1></div>
        <div className="page-heading-actions">
          <button type="button" className="secondary-button compact" onClick={esitle} disabled={syncing}>
            {syncing ? 'Eşitleniyor…' : 'Sunucuyla eşitle'}
          </button>
          <span className="live-badge"><i /> {panel ? clock(panel.generatedAt) : 'Bağlı'}</span>
        </div>
      </header>

      {syncError && <div className="alert error">{syncError}</div>}

      <section className="metrics-grid">
        <Metric label="Toplam ürün" value={menu.products.length} note={`${visible} menüde görünür`} />
        <Metric label="Aktif kategori" value={menu.categories.filter((c) => c.is_active !== 0).length} note={`${menu.categories.length} kategori kayıtlı`} />
        <Metric label="Görselli ürün" value={pictured} note={`${menu.products.length - pictured} ürün görselsiz`} />
        <Metric label="Tükendi" value={unavailable} note="Menüde tükendi görünür" />
      </section>

      {!panel && <section className="panel-card"><p className="empty-text">Pano verileri alınıyor…</p></section>}

      {stats.status === 'ok'
        ? <SiteStats data={stats.data} fetchedAt={stats.fetchedAt} />
        : panel && <StatsFallback panel={stats} />}

      {panel && rest.length > 0 && (
        <section className="conn-grid">
          {rest.map((item) => (
            <ConnectorCard key={item.id} panel={item}>
              {item.id === 'instagram' && <Instagram data={item.data} />}
            </ConnectorCard>
          ))}
        </section>
      )}

      {panel && <MostViewed panel={viewed} />}

      {panel && <Health panel={health} />}

      <section className="panel-card">
        <div className="section-title"><div><span className="eyebrow">DENETİM KAYDI</span><h2>Son değişiklikler</h2></div></div>
        {stats.status === 'ok' && stats.data.history.length ? (
          <div className="history-list">
            {stats.data.history.map((entry) => (
              <div key={entry.id ?? `${entry.ts}-${entry.entity}`}>
                <i className={`history-icon ${entry.action}`} />
                <div>
                  <strong>{entry.detail || `${entry.entity} ${entry.action}`}</strong>
                  <small>{logTime(entry)}</small>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="empty-text">Henüz gösterilecek değişiklik kaydı yok.</p>}
      </section>
    </div>
  );
}

function SiteStats({ data, fetchedAt }) {
  const { today, days, endDay, delta, week, month } = data;
  const qrPercent = Math.round(today.qrShare * 100);
  const weekday = WEEKDAYS_LONG[weekdayIndex(endDay)];

  return (
    <>
      <section className="panel-card pano-hero">
        <div>
          <span className="eyebrow">BUGÜN · {weekday.toUpperCase()}</span>
          <strong className="hero-num">{num(today.menu_view)}</strong>
          <span className="hero-label">menü görüntüleme</span>
          {delta ? (
            <span className={`delta ${delta.direction}`}>
              <i aria-hidden="true">{ARROW[delta.direction]}</i>
              %{Math.abs(delta.percent)} · önceki {delta.weekdayLong}: {num(delta.previous)}
            </span>
          ) : (
            <span className="delta flat"><i aria-hidden="true">■</i> karşılaştırmak için yeterli geçmiş yok</span>
          )}
        </div>

        <div className="hero-split">
          <div className="split-head">
            <span>Masada mı, uzaktan mı bakılıyor?</span>
            <span className="split-stamp">{since(fetchedAt)}</span>
          </div>
          <div className="split-bar" role="img" aria-label={`${num(today.qr_scan)} masada, ${num(today.remote)} uzaktan`}>
            <i style={{ width: `${qrPercent}%`, background: SERIES['site-stats'] }} />
            <i style={{ width: `${100 - qrPercent}%`, background: '#9db6d4' }} />
          </div>
          <div className="split-legend">
            <span><i style={{ background: SERIES['site-stats'] }} />Masada (QR) <b>{num(today.qr_scan)}</b></span>
            <span><i style={{ background: '#9db6d4' }} />Uzaktan <b>{num(today.remote)}</b></span>
            {week && <span>Bu hafta <b>{num(week.menu_view)}</b></span>}
            {month && <span>Bu ay <b>{num(month.menu_view)}</b></span>}
          </div>
          <p className="split-note">
            QR taraması masadaki misafiri, kalan görüntülemeler gelmeden önce menüye bakanları gösterir.
            Uzaktan bakan oranının artması, gelmeden karar veren misafirin arttığı anlamına gelir.
          </p>
        </div>
      </section>

      <PeriodRhythm days={days} firstDay={data.firstDay ?? null} />
    </>
  );
}

function StatsFallback({ panel }) {
  return (
    <section className="panel-card">
      <div className="section-title"><div><span className="eyebrow">SON 30 GÜN</span><h2>Site hareketliliği</h2></div></div>
      <p className="empty-text">
        {panel.status === 'unconfigured' ? panel.message : `Veri alınamadı: ${panel.error}`}
      </p>
    </section>
  );
}

function Instagram({ data }) {
  if (!data) return null;
  const { followers, followerChange, followerHistory, insights, mediaCount, token } = data;
  return (
    <>
      <strong className="conn-num">{num(followers)}</strong>
      <span className="conn-sub">takipçi</span>
      <span className="conn-sub">
        {followerChange === null
          ? `${num(mediaCount)} gönderi · trend için gün birikiyor`
          : `${followerChange >= 0 ? '+' : ''}${num(followerChange)} son ${followerHistory.length} günde`}
        {insights?.reach ? ` · erişim ${num(insights.reach)}` : ''}
      </span>
      {token?.warning && <p className="conn-note">{token.warning}</p>}
      {!token?.warning && token?.daysLeft !== null && token?.daysLeft < 7 && (
        <p className="conn-note"><strong>Token {token.daysLeft} gün sonra doluyor</strong> ve otomatik yenilenemedi.</p>
      )}
    </>
  );
}

const PENCERELER = [['week', '7 gün'], ['month', '30 gün']];

/**
 * En çok bakılan ürünler.
 *
 * İki pencere de konektörle birlikte gelir; çipler arasında geçiş ağa çıkmaz.
 * Bar en yüksek değere oranlanır — mutlak sayı değil sıralamanın nasıl
 * dağıldığı okunsun diye (ilk ürün ikincinin iki katı mı, kıl payı mı).
 */
function MostViewed({ panel }) {
  const [pencere, setPencere] = useState('week');
  const liste = panel.data?.[pencere] || [];
  const enYuksek = liste[0]?.views || 0;

  return (
    <section className="panel-card">
      <div className="section-title">
        <div><span className="eyebrow">MİSAFİR İLGİSİ</span><h2>En çok bakılan ürünler</h2></div>
        {panel.status === 'ok' && (
          <div className="chips">
            {PENCERELER.map(([id, etiket]) => (
              <button
                type="button" key={id}
                className={pencere === id ? 'active' : ''}
                onClick={() => setPencere(id)}
              >{etiket}</button>
            ))}
          </div>
        )}
      </div>

      {panel.status !== 'ok' ? (
        <p className="empty-text">
          {panel.status === 'unconfigured' ? panel.message : `Veri alınamadı: ${panel.error}`}
        </p>
      ) : !liste.length ? (
        <p className="empty-text">
          {pencere === 'week'
            ? 'Son 7 günde ürün detayı açılmamış.'
            : 'Henüz yeterli veri yok — misafirler ürün detaylarını açtıkça burası dolar.'}
        </p>
      ) : (
        <>
          <div className="viewed-list">
            {liste.map((urun, index) => (
              <div className="viewed-row" key={urun.id}>
                <span className="viewed-rank">{String(index + 1).padStart(2, '0')}</span>
                <span className="viewed-name">{urun.name}</span>
                <span className="viewed-bar" aria-hidden="true">
                  <i style={{
                    width: `${enYuksek ? Math.round((urun.views / enYuksek) * 100) : 0}%`,
                    background: SERIES['product-views'],
                  }} />
                </span>
                <b className="viewed-count">{num(urun.views)}</b>
              </div>
            ))}
          </div>
          <p className="split-note">
            Bu liste ne satıldığını değil, misafirin neyi merak ettiğini gösterir — panoda
            sipariş verisi yok. Aynı cihaz aynı ürünü 6 saat içinde tekrar açarsa bir kez sayılır.
            Görselsiz bir ürünün listede hiç görünmemesi çoğu zaman ilgisizlik değil, fotoğraf eksikliğidir.
          </p>
        </>
      )}
    </section>
  );
}

function Health({ panel }) {
  const data = panel.data;
  const cert = data?.certificate;
  const certClass = !cert ? 'bad' : cert.daysLeft < 14 ? 'bad' : cert.daysLeft < 45 ? 'warn' : '';

  return (
    <section className="panel-card">
      <div className="section-title"><div><span className="eyebrow">ERİŞİLEBİLİRLİK</span><h2>Site sağlığı</h2></div></div>
      {panel.status !== 'ok' || !data ? (
        <p className="empty-text">
          {panel.status === 'unconfigured' ? panel.message : `Kontrol edilemedi: ${panel.error}`}
        </p>
      ) : (
        <div className="health-row">
          <div><span>Ana sayfa</span><b><i className={`pip ${data.site.ok ? '' : 'bad'}`} />{data.site.status || '—'} · {data.site.ms} ms</b></div>
          <div><span>Menü API</span><b><i className={`pip ${data.api.ok ? '' : 'bad'}`} />{data.api.status || '—'} · {data.api.ms} ms</b></div>
          <div><span>TLS sertifikası</span><b><i className={`pip ${certClass}`} />{cert ? `${cert.daysLeft} gün kaldı` : 'okunamadı'}</b></div>
          <div><span>Son kontrol</span><b>{clock(data.checkedAt)}</b></div>
        </div>
      )}
    </section>
  );
}
