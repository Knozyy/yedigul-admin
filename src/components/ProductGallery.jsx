import { useRef, useState } from 'react';
import { MAX_IMAGES } from '../lib/product-model.js';

function absoluteImageUrl(url, publicMenuUrl) {
  return new URL(url, publicMenuUrl).href;
}

export default function ProductGallery({ product, request, publicMenuUrl, onChange }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const images = Array.isArray(product?.images) ? product.images : [];

  async function upload(event) {
    const files = Array.from(event.target.files || []);
    if (inputRef.current) inputRef.current.value = '';
    if (!files.length) return;
    if (images.length + files.length > MAX_IMAGES) {
      setError(`Toplam en çok ${MAX_IMAGES} görsel olabilir.`);
      return;
    }

    setBusy(true);
    setError('');
    let updated = product;
    try {
      for (const file of files) {
        const data = new FormData();
        data.append('image', file);
        updated = await request('post', `/admin/products/${product.id}/images`, data);
      }
      onChange(updated);
    } catch (uploadError) {
      setError(uploadError.message);
      if (updated !== product) onChange(updated);
    } finally {
      setBusy(false);
    }
  }

  async function saveOrder(next) {
    setBusy(true);
    setError('');
    try {
      onChange(await request('put', `/admin/products/${product.id}/images`, { images: next }));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  function move(index, offset) {
    const target = index + offset;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    saveOrder(next);
  }

  function remove(index) {
    if (!window.confirm('Bu görsel üründen ve sunucudan kalıcı olarak silinsin mi?')) return;
    saveOrder(images.filter((_, imageIndex) => imageIndex !== index));
  }

  return (
    <div className="gallery-editor">
      <div className="gallery-heading">
        <div><strong>Ürün galerisi</strong><small>İlk görsel kapaktır. En çok {MAX_IMAGES} görsel.</small></div>
        <span>{images.length}/{MAX_IMAGES}</span>
      </div>
      <div className="gallery-grid">
        {images.map((url, index) => (
          <article className={index === 0 ? 'gallery-item cover' : 'gallery-item'} key={url}>
            <img src={absoluteImageUrl(url, publicMenuUrl)} alt={`${product.name_tr} görsel ${index + 1}`} />
            {index === 0 && <span className="cover-badge">Kapak</span>}
            <div className="gallery-actions">
              <button type="button" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label="Görseli sola taşı">←</button>
              <button type="button" disabled={busy || index === images.length - 1} onClick={() => move(index, 1)} aria-label="Görseli sağa taşı">→</button>
              {index !== 0 && <button type="button" disabled={busy} onClick={() => saveOrder([url, ...images.filter((_, i) => i !== index)])}>Kapak</button>}
              <button type="button" className="remove" disabled={busy} onClick={() => remove(index)}>Sil</button>
            </div>
          </article>
        ))}
        {images.length < MAX_IMAGES && (
          <label className={`gallery-add${busy ? ' disabled' : ''}`}>
            <span>＋</span><strong>{busy ? 'Yükleniyor…' : 'Görsel ekle'}</strong><small>JPEG, PNG, WebP</small>
            <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={upload} />
          </label>
        )}
      </div>
      {error && <div className="alert error">{error}</div>}
    </div>
  );
}
