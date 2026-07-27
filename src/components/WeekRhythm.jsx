import { bucketDays, pickForm } from '../../shared/period.js';
import { formatDayLabel, isWeekend, weekdayDeltas } from '../../shared/rhythm.js';
import { num } from '../lib/format.js';

const ARROW = { up: '▲', down: '▼', flat: '■' };

/**
 * Dönem kartının grafiği. Biçimi KULLANICI SEÇMEZ, gün sayısı belirler:
 * kısa aralıkta haftanın günleri yan yana (asıl soru "bu cumartesi geçen
 * cumartesiye göre nasıl"), uzun aralıkta kronolojik çubuk.
 *
 * Önceki ısı haritası kaldırıldı: renk büyüklük kodluyordu ve sıfır ziyaretli
 * gün ile pencere dışı gün birbirine karışıyordu. Artık yükseklik kodluyor.
 */
export default function WeekRhythm({ days, metric = 'menu_view' }) {
  if (!days?.length) return <p className="empty-text">Bu dönemde gösterilecek veri yok.</p>;

  return pickForm(days.length) === 'weekday'
    ? <WeekdayPanels days={days} metric={metric} />
    : <Timeline days={days} metric={metric} />;
}

/** B — haftanın her günü için mini panel, altında son değer ve değişim. */
function WeekdayPanels({ days, metric }) {
  const groups = weekdayDeltas(days, metric);
  const enYuksek = Math.max(1, ...days.map((d) => Number(d[metric]) || 0));

  return (
    <div className="wd-grid">
      {groups.map((group) => (
        <div className="wd-panel" key={group.label}>
          <span className={`wd-name${group.index > 4 ? ' we' : ''}`}>{group.label}</span>

          <div className="wd-bars">
            {group.days.map((entry, index) => {
              const value = Number(entry[metric]) || 0;
              const sonuncu = index === group.days.length - 1;
              return (
                <i
                  key={entry.day}
                  className={sonuncu ? 'son' : ''}
                  style={{ height: `${Math.max(2, Math.round((value / enYuksek) * 100))}%` }}
                  title={`${formatDayLabel(entry.day)} — ${num(value)}`}
                />
              );
            })}
            {!group.days.length && <span className="wd-bos">—</span>}
          </div>

          <b className="wd-value">{group.current ? num(group.current[metric]) : '—'}</b>
          {group.delta ? (
            <small className={`wd-delta ${group.delta.direction}`}>
              {ARROW[group.delta.direction]} %{Math.abs(group.delta.percent)}
            </small>
          ) : (
            <small className="wd-delta flat">&nbsp;</small>
          )}
        </div>
      ))}
    </div>
  );
}

/** C — kronolojik çubuk. Çubuk sayısı eşiği aşarsa haftalık kovaya toplanır. */
function Timeline({ days, metric }) {
  const { unit, buckets } = bucketDays(days);
  const enYuksek = Math.max(1, ...buckets.map((b) => Number(b[metric]) || 0));
  const ilk = buckets[0];
  const son = buckets[buckets.length - 1];

  return (
    <>
      <div className="tl-bars">
        {buckets.map((bucket) => {
          const value = Number(bucket[metric]) || 0;
          // Haftalık kovada "hafta sonu" diye bir şey yok; yalnız günlükte işaretlenir.
          const hs = unit === 'day' && isWeekend(bucket.day);
          const etiket = unit === 'day'
            ? `${formatDayLabel(bucket.day)} — ${num(value)}`
            : `${formatDayLabel(bucket.from)} – ${formatDayLabel(bucket.to)} — ${num(value)}`;
          return (
            <i
              key={bucket.day}
              className={hs ? 'we' : ''}
              style={{ height: `${Math.max(2, Math.round((value / enYuksek) * 100))}%` }}
              title={etiket}
            />
          );
        })}
      </div>
      <div className="tl-axis">
        <span>{formatDayLabel(ilk.from ?? ilk.day)}</span>
        <span className="result-count">
          {unit === 'week' ? `${buckets.length} hafta` : `${buckets.length} gün`}
        </span>
        <span>{formatDayLabel(son.to ?? son.day)}</span>
      </div>
    </>
  );
}
