import { useId, useState } from 'react';
import { bucketDays } from '../../shared/period.js';
import { formatDayLabel } from '../../shared/rhythm.js';
import { num } from '../lib/format.js';

const VIEWBOX = { width: 720, height: 230, x: 16, y: 18, bottom: 16 };

function seriesLabel(bucket, unit) {
  return unit === 'week'
    ? `${formatDayLabel(bucket.from)} – ${formatDayLabel(bucket.to)}`
    : formatDayLabel(bucket.day);
}

function plotPoints(buckets, metric) {
  const values = buckets.map((bucket) => Number(bucket[metric]) || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const drawableWidth = VIEWBOX.width - (VIEWBOX.x * 2);
  const drawableHeight = VIEWBOX.height - VIEWBOX.y - VIEWBOX.bottom;

  return buckets.map((bucket, index) => {
    const x = buckets.length === 1
      ? VIEWBOX.width / 2
      : VIEWBOX.x + (index / (buckets.length - 1)) * drawableWidth;
    const value = values[index];
    const y = span === 0
      ? (value === 0 ? VIEWBOX.height - VIEWBOX.bottom : VIEWBOX.height / 2)
      : VIEWBOX.y + ((max - value) / span) * drawableHeight;
    return { ...bucket, value, x, y };
  });
}

function smoothPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const middle = (previous.x + point.x) / 2;
    return `${path} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

function signed(value) {
  if (value > 0) return `+${num(value)}`;
  return num(value);
}

function direction(value) {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'flat';
}

/**
 * 21st.dev Progress Metric Card yaklaşımının projedeki günlük istatistiklere
 * uyarlanmış hâli. Recharts eklemek yerine küçük SVG çizimi kullanılır; böylece
 * yerel panel yeni bir çalışma zamanı bağımlılığı olmadan aynı etkileşimi sunar.
 */
export default function WeekRhythm({ days, metric = 'menu_view', periodLabel = 'Son 4 hafta' }) {
  const [form, setForm] = useState('line');
  const [activeIndex, setActiveIndex] = useState(null);
  const gradientId = `metric-fill-${useId().replaceAll(':', '')}`;

  if (!days?.length) return <p className="empty-text">Bu dönemde gösterilecek veri yok.</p>;

  const { unit, buckets } = bucketDays(days);
  const points = plotPoints(buckets, metric);
  const values = points.map((point) => point.value);
  const toplam = values.reduce((sum, value) => sum + value, 0);
  const ilk = values[0];
  const son = values.at(-1);
  const onceki = values.at(-2);
  const sonFark = onceki === undefined ? null : son - onceki;
  const yuzde = ilk > 0 ? Math.round(((son - ilk) / ilk) * 100) : null;
  const zirve = Math.max(...values);
  const dusuk = Math.min(...values);
  const ortalama = Math.round(toplam / values.length);
  const line = smoothPath(points);
  const area = `${line} L ${points.at(-1).x} ${VIEWBOX.height} L ${points[0].x} ${VIEWBOX.height} Z`;
  const slot = (VIEWBOX.width - (VIEWBOX.x * 2)) / Math.max(1, points.length);
  const barWidth = Math.min(28, Math.max(4, slot * 0.62));
  const barMax = Math.max(1, ...values);
  const visualPoints = points.map((point) => {
    if (form === 'line') return { ...point, plotY: point.y };
    const height = Math.max(3, (point.value / barMax) * (VIEWBOX.height - VIEWBOX.y - VIEWBOX.bottom));
    return { ...point, plotY: VIEWBOX.height - VIEWBOX.bottom - height };
  });
  const active = activeIndex === null ? null : visualPoints[activeIndex];
  const barHitWidth = Math.max(barWidth, slot * 0.86);
  const lineHitWidth = points.length > 1
    ? (points[1].x - points[0].x) * 1.02
    : VIEWBOX.width - (VIEWBOX.x * 2);
  const tooltipLeft = active
    ? `clamp(52px, ${(active.x / VIEWBOX.width) * 100}%, calc(100% - 52px))`
    : '50%';
  const birim = unit === 'week' ? 'hafta' : 'gün';

  return (
    <div className="progress-metric">
      <div className="progress-metric-top">
        <div className="progress-metric-total">
          <div className="progress-metric-label">
            <span>Toplam görüntüleme</span>
            <div className="progress-view-toggle" role="group" aria-label="Grafik görünümü">
              <button
                type="button"
                className={form === 'line' ? 'active' : ''}
                aria-pressed={form === 'line'}
                title="Çizgi grafik"
                onClick={() => setForm('line')}
              >
                <svg viewBox="0 0 18 18" aria-hidden="true">
                  <path d="M2.5 13.5 6.3 9.2l3 2.4 6.2-7" />
                  <path d="M2.5 3v11.5H16" />
                </svg>
                <span className="sr-only">Çizgi grafik</span>
              </button>
              <button
                type="button"
                className={form === 'bar' ? 'active' : ''}
                aria-pressed={form === 'bar'}
                title="Çubuk grafik"
                onClick={() => setForm('bar')}
              >
                <svg viewBox="0 0 18 18" aria-hidden="true">
                  <path d="M3 14.5V9h3v5.5M8 14.5V4h3v10.5M13 14.5V7h3v7.5" />
                  <path d="M2 14.5h15" />
                </svg>
                <span className="sr-only">Çubuk grafik</span>
              </button>
            </div>
          </div>
          <strong>{num(toplam)}</strong>
        </div>
        <div className="progress-metric-trend">
          {yuzde === null ? (
            <b className="flat">Karşılaştırma yok</b>
          ) : (
            <b className={direction(yuzde)}>
              <span aria-hidden="true">{yuzde >= 0 ? '↑' : '↓'}</span> %{Math.abs(yuzde)}
            </b>
          )}
          <span>{periodLabel}</span>
        </div>
      </div>

      <div className="progress-plot">
        <svg
          className="progress-plot-svg"
          viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${periodLabel}: toplam ${num(toplam)} menü görüntüleme`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1d5fb0" stopOpacity=".24" />
              <stop offset="100%" stopColor="#1d5fb0" stopOpacity=".015" />
            </linearGradient>
          </defs>
          {form === 'line' ? (
            <>
              <path className="progress-area" d={area} fill={`url(#${gradientId})`} />
              <path className="progress-line" d={line} />
              {points.length === 1 && <circle className="progress-point only" cx={points[0].x} cy={points[0].y} r="4" />}
            </>
          ) : (
            visualPoints.map((point) => (
              <rect
                key={point.day}
                className="progress-bar"
                x={point.x - (barWidth / 2)}
                y={point.plotY}
                width={barWidth}
                height={VIEWBOX.height - VIEWBOX.bottom - point.plotY}
                rx={Math.min(4, barWidth / 3)}
              />
            ))
          )}
          {active && (
            <>
              <line className="progress-guide" x1={active.x} x2={active.x} y1="4" y2={VIEWBOX.height} />
              <circle className="progress-point" cx={active.x} cy={active.plotY} r="4.5" />
            </>
          )}
        </svg>

        <div className="progress-hit-layer">
          {visualPoints.map((point, index) => (
            <button
              type="button"
              key={point.day}
              className={form === 'bar' ? 'bar-hit' : 'line-hit'}
              aria-label={`${seriesLabel(point, unit)}: ${num(point.value)} görüntüleme`}
              style={form === 'bar'
                ? {
                    left: `${(point.x / VIEWBOX.width) * 100}%`,
                    top: `${(point.plotY / VIEWBOX.height) * 100}%`,
                    width: `${(barHitWidth / VIEWBOX.width) * 100}%`,
                    height: `${((VIEWBOX.height - VIEWBOX.bottom - point.plotY) / VIEWBOX.height) * 100}%`,
                  }
                : {
                    left: `${(point.x / VIEWBOX.width) * 100}%`,
                    top: 0,
                    width: `${(lineHitWidth / VIEWBOX.width) * 100}%`,
                    height: '100%',
                  }}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
            />
          ))}
        </div>

        {active && (
          <div
            className="progress-tooltip"
            style={{ left: tooltipLeft }}
          >
            <b>{num(active.value)}</b>
            <span>{seriesLabel(active, unit)}</span>
          </div>
        )}
      </div>

      <div className="progress-metric-foot">
        <span className={sonFark === null ? 'flat' : direction(sonFark)}>
          {sonFark === null ? 'İlk kayıt' : `${signed(sonFark)} son ${birim}`}
        </span>
        <span className="progress-stat"><b>{num(zirve)}</b> zirve</span>
        <span className="progress-stat"><b>{num(dusuk)}</b> düşük</span>
        <span className="progress-stat"><b>{num(ortalama)}</b> ort.</span>
      </div>
    </div>
  );
}
