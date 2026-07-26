import { since } from '../lib/format.js';

/**
 * Krem zemin için ölçülen seri renkleri. Kokpit tonları (koyu tema) burada
 * okunmuyordu — Instagram 2.28:1, Analytics 1.83:1 ile grafik nesneleri için
 * gereken 3:1'in bile altında kalıyordu. Bu tonlar 5.0–6.8 arasında.
 */
export const SERIES = {
  'site-stats': '#1d5fb0',
  health: '#1d5fb0',
  instagram: '#1f7a55',
  analytics: '#8c681e',
  reviews: '#9b3b2e',
};

const TAGS = {
  ok: { className: 'conn-tag ok', text: 'Güncel' },
  unconfigured: { className: 'conn-tag', text: 'Bağlı değil' },
  error: { className: 'conn-tag err', text: 'Hata' },
};

/**
 * Üç durumu da aynı kart çizer. Bir kaynağın düşmesi diğerlerini
 * etkilemediği için pano hiçbir zaman tamamen boş kalmaz.
 */
export default function ConnectorCard({ panel, children }) {
  const tag = TAGS[panel.status] || TAGS.error;
  return (
    <section className="panel-card conn-card">
      <div className="conn-top">
        <span className="conn-name">
          <i className="conn-dot" style={{ background: SERIES[panel.id] || 'var(--muted)' }} />
          {panel.label}
        </span>
        <span className={tag.className}>{tag.text}</span>
      </div>

      <div className="conn-body">
        {panel.status === 'unconfigured' && <p className="conn-note">{panel.message}</p>}

        {panel.status === 'error' && (
          <p className="conn-note">
            <strong>{panel.error}</strong>
            {panel.stale
              ? ` Aşağıdaki bilgiler ${since(panel.fetchedAt)} alınan son kopyadan.`
              : ' Henüz gösterilecek kayıtlı veri yok.'}
          </p>
        )}

        {panel.status === 'ok' && children}
      </div>

      <div className="conn-foot">
        {panel.status === 'unconfigured' ? panel.hint : since(panel.fetchedAt)}
      </div>
    </section>
  );
}
