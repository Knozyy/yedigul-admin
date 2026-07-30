import { useCallback, useEffect, useRef, useState } from 'react';
import WeekRhythm from './WeekRhythm.jsx';
import { PRESETS, coverageNote, rangeLength, resolvePreset } from '../../shared/period.js';
import { api } from '../lib/api.js';

const bugun = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * Dönem seçici + grafik.
 *
 * Varsayılan "Son 4 hafta" AĞA ÇIKMAZ: konektörün zaten getirdiği 30 günlük
 * seriden son 28 gün kesilir. Diğer dönemler ayrı istek yapar ve sonuç
 * konektör önbelleğine YAZILMAZ — seçim kullanıcıya özel ve anlıktır,
 * paylaşılan önbelleği kirletmemeli.
 */
export default function PeriodRhythm({ days, firstDay }) {
  const [preset, setPreset] = useState('son4hafta');
  const [ozel, setOzel] = useState({ from: '', to: '' });
  const [uzak, setUzak] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState('');
  const istekSirasi = useRef(0);

  const varsayilan = preset === 'son4hafta';
  const aralik = preset === 'ozel'
    ? (ozel.from && ozel.to ? { ...ozel } : null)
    : resolvePreset(preset, bugun());

  async function sec(id) {
    // Önceki aralık isteği daha sonra dönerse yeni seçimi ezmemeli.
    istekSirasi.current += 1;
    setPreset(id);
    setBusy(false);
    setHata('');
    if (id === 'son4hafta' || id === 'ozel') { setUzak(null); return; }
    await getir(resolvePreset(id, bugun()));
  }

  const getir = useCallback(async (hedef) => {
    if (!hedef?.from || !hedef?.to) return;
    if (hedef.from > hedef.to) {
      istekSirasi.current += 1;
      setBusy(false);
      setUzak(null);
      setHata('Başlangıç, bitişten sonra olamaz.');
      return;
    }

    const buIstek = ++istekSirasi.current;
    setBusy(true); setHata('');
    try {
      const data = await api.get(`/admin/stats?from=${hedef.from}&to=${hedef.to}`);
      if (buIstek !== istekSirasi.current) return;
      setUzak(data.days || []);
    } catch (error) {
      if (buIstek !== istekSirasi.current) return;
      setHata(error.message);
      setUzak(null);
    } finally {
      if (buIstek === istekSirasi.current) setBusy(false);
    }
  }, []);

  // Özel aralıkta tarih değişince eski seri ekranda kalmaz. İki tarih de
  // hazır olduğunda kısa bir gecikmeyle yeni aralık otomatik olarak çekilir.
  useEffect(() => {
    if (preset !== 'ozel') return undefined;

    istekSirasi.current += 1;
    setUzak(null);
    setHata('');

    if (!ozel.from || !ozel.to) {
      setBusy(false);
      return undefined;
    }
    if (ozel.from > ozel.to) {
      setBusy(false);
      setHata('Başlangıç, bitişten sonra olamaz.');
      return undefined;
    }

    setBusy(true);
    const timer = setTimeout(() => getir({ ...ozel }), 300);
    return () => clearTimeout(timer);
  }, [getir, ozel.from, ozel.to, preset]);

  // Varsayılanda konektörün serisinden son 28 gün; gerisinde uzak yanıt.
  const seri = varsayilan ? days.slice(-28) : (uzak || []);
  const kapsam = aralik
    ? coverageNote(firstDay, aralik.from, aralik.to)
    : { state: 'full', message: '', from: null };
  const gorunen = kapsam.state === 'none' ? [] : seri.filter((d) => !kapsam.from || d.day >= kapsam.from);

  return (
    <section className="panel-card">
      <div className="section-title">
        <div>
          <span className="eyebrow">DÖNEM</span>
          <h2>Gün ritmi</h2>
        </div>
        <div className="chips">
          {PRESETS.map(({ id, label }) => (
            <button
              type="button" key={id}
              className={preset === id ? 'active' : ''}
              disabled={busy}
              onClick={() => sec(id)}
            >{label}</button>
          ))}
        </div>
      </div>

      {preset === 'ozel' && (
        <div className="period-custom">
          <label className="field"><span>Başlangıç</span>
            <input type="date" value={ozel.from} max={bugun()}
              onChange={(e) => setOzel((o) => ({ ...o, from: e.target.value }))} /></label>
          <label className="field"><span>Bitiş</span>
            <input type="date" value={ozel.to} max={bugun()}
              onChange={(e) => setOzel((o) => ({ ...o, to: e.target.value }))} /></label>
          <button type="button" className="secondary-button compact"
            disabled={busy || !ozel.from || !ozel.to}
            onClick={() => getir(ozel)}>{busy ? 'Yenileniyor…' : 'Yenile'}</button>
        </div>
      )}

      <p className="form-hint period-chart-hint">
        {!aralik
          ? 'Tarihleri seçtiğinizde grafik otomatik yenilenir.'
          : rangeLength(aralik.from, aralik.to) <= 70
            ? 'Her nokta bir günün menü görüntülemesini gösterir; çizgi ve çubuk görünümü arasında geçiş yapabilirsiniz.'
            : 'Uzun aralıklar okunabilirlik için haftalık toplamlar halinde gösterilir.'}
      </p>

      {hata && <div className="alert error">{hata}</div>}

      {kapsam.state === 'none' ? (
        <p className="empty-text">{kapsam.message}</p>
      ) : busy ? (
        <p className="empty-text">Seçilen tarih aralığı yükleniyor…</p>
      ) : preset === 'ozel' && !uzak ? (
        <p className="empty-text">Grafiği görmek için başlangıç ve bitiş tarihi seçin.</p>
      ) : (
        <>
          <WeekRhythm
            days={gorunen}
            periodLabel={PRESETS.find((item) => item.id === preset)?.label || 'Seçili dönem'}
          />
          {kapsam.state === 'partial' && <p className="split-note">{kapsam.message}</p>}
        </>
      )}
    </section>
  );
}
