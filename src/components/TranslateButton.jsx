import { useState } from 'react';
import { api, translationEnabled } from '../lib/api.js';
import { translationPatch } from '../../shared/translate.js';

/**
 * Bir alan grubunun Türkçesini EN/AR/RU'ya çevirip forma yazar.
 *
 * Anahtar yoksa hiç çizilmez — dört tane soluk "beni yapılandır" düğmesi
 * göstermek yerine özellik yokmuş gibi davranır.
 *
 * Hata kendi bloğunun içinde gösterilir; formun üstündeki alan kaydetme
 * hatalarına ait ve ikisini karıştırmak "kaydedilemedi" sanılmasına yol açar.
 */
export default function TranslateButton({ group, source, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (!translationEnabled()) return null;

  const bos = !String(source || '').trim();

  async function cevir() {
    setBusy(true); setError(''); setDone(false);
    try {
      const { values } = await api.post('/translate', { group, source });
      onDone(translationPatch(group, values));
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="translate-slot">
      <button
        type="button" className="secondary-button compact"
        disabled={busy || bos}
        onClick={cevir}
        title="Türkçeden EN, AR, RU üretir; mevcut çeviriler değişir."
      >{busy ? 'Çevriliyor…' : 'Çevir'}</button>
      {done && !error && <small className="form-hint">EN, AR, RU dolduruldu.</small>}
      {error && <small className="daily-row-error">{error}</small>}
    </span>
  );
}
