import { formatDayLabel, isWeekend, makeIntensity, toWeekGrid, WEEKDAYS } from '../../shared/rhythm.js';

/**
 * Açık tema rampası: lacivert, krem zemin üzerine artan yoğunlukla.
 * Kontrast ölçülerek seçildi — 4. kademeden itibaren zemin koyulaştığı için
 * hücredeki gün sayısı açık renge döner (en düşük 5.5:1).
 */
const RAMP = [
  { bg: 'transparent', fg: 'var(--muted)' },
  { bg: '#e7e7e5', fg: '#0b2239' },
  { bg: '#c0c4c6', fg: '#0b2239' },
  { bg: '#8f98a0', fg: '#0b2239' },
  { bg: '#596876', fg: '#fffdf8' },
  { bg: '#23384c', fg: '#fffdf8' },
];

export default function WeekRhythm({ days, endDay, metric = 'menu_view' }) {
  if (!days?.length) return <p className="empty-text">Gösterilecek veri yok.</p>;

  const rows = toWeekGrid(days);
  const intensity = makeIntensity(days.map((d) => d[metric]));

  return (
    <>
      <div className="rhythm-grid">
        <div />
        {WEEKDAYS.map((label, i) => (
          <div key={label} className={`rhythm-head${i > 4 ? ' we' : ''}`}>{label}</div>
        ))}

        {rows.map((row, rowIndex) => (
          <Row
            key={row.find(Boolean)?.day || `bos-${rowIndex}`}
            row={row}
            rowIndex={rowIndex}
            endDay={endDay}
            metric={metric}
            intensity={intensity}
          />
        ))}
      </div>

      <div className="rhythm-scale">
        <span>az</span>
        {RAMP.slice(1).map((step) => <i key={step.bg} style={{ background: step.bg }} />)}
        <span>çok</span>
      </div>
    </>
  );
}

function Row({ row, rowIndex, endDay, metric, intensity }) {
  return (
    <>
      <div className="rhythm-week">{rowIndex + 1}H</div>
      {row.map((entry, index) => {
        if (!entry) return <div key={`bos-${rowIndex}-${index}`} className="rhythm-cell empty" aria-hidden="true" />;
        const step = RAMP[intensity(entry[metric])];
        const classes = [
          'rhythm-cell',
          isWeekend(entry.day) ? 'we' : '',
          entry.day === endDay ? 'today' : '',
        ].filter(Boolean).join(' ');
        const label = `${formatDayLabel(entry.day)} — ${entry[metric]} görüntüleme`;
        return (
          <div
            key={entry.day}
            className={classes}
            style={{ background: step.bg, color: step.fg }}
            title={label}
          >
            <span aria-hidden="true">{Number(entry.day.slice(-2))}</span>
            <span className="sr-only">{label}</span>
          </div>
        );
      })}
    </>
  );
}
