import { useState } from 'react';
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

  const varsayilan = preset === 'son4hafta';
  const aralik = preset === 'ozel'
    ? (ozel.from && ozel.to ? { ...ozel } : null)
    : resolvePreset(preset, bugun());

  async function sec(id) {
    setPreset(id);
    setHata('');
    if (id === 'son4hafta' || id === 'ozel') { setUzak(null); return; }
    await getir(resolvePreset(id, bugun()));
  }

  async function getir(hedef) {
    if (!hedef?.from || !hedef?.to) return;
    if (hedef.from > hedef.to) { setHata('Başlangıç, bitişten sonra olamaz.'); return; }
    setBusy(true); setHata('');
    try {
      const data = await api.get(`/admin/stats?from=${hedef.from}&to=${hedef.to}`);
      setUzak(data.days || []);
    } catch (error) {
      setHata(error.message);
      setUzak(null);
    } finally {
      setBusy(false);
    }
  }

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
            onClick={() => getir(ozel)}>{busy ? 'Getiriliyor…' : 'Getir'}</button>
        </div>
      )}

      <p className="form-hint">
        {aralik && rangeLength(aralik.from, aralik.to) <= 70
          ? 'Her gün kendi içinde: çubuklar o günün dönem içindeki tekrarları, yüzde son ikisini karşılaştırır.'
          : 'Aralık uzun olduğu için günler zaman sırasında; hafta sonları altın.'}
      </p>

      {hata && <div className="alert error">{hata}</div>}

      {kapsam.state === 'none' ? (
        <p className="empty-text">{kapsam.message}</p>
      ) : busy ? (
        <p className="empty-text">Getiriliyor…</p>
      ) : preset === 'ozel' && !uzak ? (
        <p className="empty-text">Bir başlangıç ve bitiş tarihi seçip “Getir”e basın.</p>
      ) : (
        <>
          <WeekRhythm days={gorunen} />
          {kapsam.state === 'partial' && <p className="split-note">{kapsam.message}</p>}
        </>
      )}
    </section>
  );
}
