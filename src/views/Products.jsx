import { useMemo, useState } from 'react';
import Modal from '../components/Modal.jsx';
import ProductGallery from '../components/ProductGallery.jsx';
import TranslateButton from '../components/TranslateButton.jsx';
import { tasi } from '../lib/reorder.js';
import {
  MAX_IMAGES,
  MAX_VARIANTS,
  buildProductPayload,
  listToText,
  priceLabel,
  truthy,
} from '../lib/product-model.js';
import { missingProductTranslationCodes, productMatchesQuery } from '../lib/i18n.js';

const EMPTY_VARIANT = { name_tr: '', name_en: '', name_ar: '', name_ru: '', price: '' };
const BLANK = {
  category_id: '', name_tr: '', name_en: '', name_ar: '', name_ru: '',
  desc_tr: '', desc_en: '', desc_ar: '', desc_ru: '',
  ing_tr: '', ing_en: '', ing_ar: '', ing_ru: '',
  alg_tr: '', alg_en: '', alg_ar: '', alg_ru: '',
  price: '', kcal: '', portion: '', sort: 0, diet: [], variants: [],
  is_market_price: false, is_available: true, is_hidden: false, popular: false, chef: false,
};

function formValue(product, categories) {
  if (!product) return { ...BLANK, category_id: categories[0]?.id || '', diet: [], variants: [] };
  return {
    ...BLANK,
    ...product,
    price: product.price ?? '',
    kcal: product.kcal ?? '',
    portion: product.portion ?? '',
    diet: Array.isArray(product.diet) ? [...product.diet] : [],
    variants: (product.variants || []).map((variant) => ({
      name_tr: variant.name_tr || '', name_en: variant.name_en || '',
      name_ar: variant.name_ar || '', name_ru: variant.name_ru || '',
      price: variant.price ?? '',
    })),
    ing_tr: listToText(product.ing_tr), ing_en: listToText(product.ing_en),
    ing_ar: listToText(product.ing_ar), ing_ru: listToText(product.ing_ru),
    alg_tr: listToText(product.alg_tr), alg_en: listToText(product.alg_en),
    alg_ar: listToText(product.alg_ar), alg_ru: listToText(product.alg_ru),
    is_market_price: truthy(product.is_market_price), is_available: truthy(product.is_available),
    is_hidden: truthy(product.is_hidden), popular: truthy(product.popular), chef: truthy(product.chef),
  };
}

/** Blok başlığı + sağında Çevir. VariantEditor'daki .editor-heading deseni. */
function BlockHeading({ title, hint, group, form, patch }) {
  return (
    <div className="editor-heading">
      <div><h3>{title}</h3>{hint && <p className="form-hint">{hint}</p>}</div>
      <TranslateButton group={group} source={form[`${group}_tr`]} onDone={patch} />
    </div>
  );
}

function TranslationFields({ form, set, patch }) {
  return (
    <>
      <div className="language-block">
        <BlockHeading
          title="Ürün adları" group="name" form={form} patch={patch}
          hint="Arapça veya Rusça boşsa menü İngilizceyi, o da boşsa Türkçeyi gösterir."
        />
        <div className="form-grid two">
          <label className="field"><span>Türkçe *</span><input lang="tr" value={form.name_tr} onChange={(event) => set('name_tr', event.target.value)} required /></label>
          <label className="field"><span>İngilizce *</span><input lang="en" value={form.name_en} onChange={(event) => set('name_en', event.target.value)} required /></label>
          <label className="field"><span>Arapça</span><input lang="ar" dir="rtl" value={form.name_ar} onChange={(event) => set('name_ar', event.target.value)} /></label>
          <label className="field"><span>Rusça</span><input lang="ru" value={form.name_ru} onChange={(event) => set('name_ru', event.target.value)} /></label>
        </div>
      </div>
      <div className="language-block">
        <BlockHeading title="Açıklamalar" group="desc" form={form} patch={patch} />
        <div className="form-grid two">
          <label className="field"><span>Türkçe</span><textarea lang="tr" value={form.desc_tr} onChange={(event) => set('desc_tr', event.target.value)} /></label>
          <label className="field"><span>İngilizce</span><textarea lang="en" value={form.desc_en} onChange={(event) => set('desc_en', event.target.value)} /></label>
          <label className="field"><span>Arapça</span><textarea lang="ar" dir="rtl" value={form.desc_ar} onChange={(event) => set('desc_ar', event.target.value)} /></label>
          <label className="field"><span>Rusça</span><textarea lang="ru" value={form.desc_ru} onChange={(event) => set('desc_ru', event.target.value)} /></label>
        </div>
      </div>
    </>
  );
}

// İçindekiler ile alerjenler AYRI bloklar: ikisi ayrı çeviri grubu, her birinin
// kendi düğmesi olmalı. Blok başına 8 yerine 4 alan da daha okunur.
function ContentFields({ form, set, patch }) {
  const AYIRICI = 'Birden fazla değeri virgülle veya yeni satırla ayırın.';
  return (
    <>
      <div className="language-block">
        <BlockHeading title="İçindekiler" group="ing" form={form} patch={patch} hint={AYIRICI} />
        <div className="form-grid two">
          <label className="field"><span>Türkçe</span><textarea lang="tr" value={form.ing_tr} onChange={(event) => set('ing_tr', event.target.value)} /></label>
          <label className="field"><span>İngilizce</span><textarea lang="en" value={form.ing_en} onChange={(event) => set('ing_en', event.target.value)} /></label>
          <label className="field"><span>Arapça</span><textarea lang="ar" dir="rtl" value={form.ing_ar} onChange={(event) => set('ing_ar', event.target.value)} /></label>
          <label className="field"><span>Rusça</span><textarea lang="ru" value={form.ing_ru} onChange={(event) => set('ing_ru', event.target.value)} /></label>
        </div>
      </div>
      <div className="language-block">
        <BlockHeading title="Alerjenler" group="alg" form={form} patch={patch} hint={AYIRICI} />
        <div className="form-grid two">
          <label className="field"><span>Türkçe</span><textarea lang="tr" value={form.alg_tr} onChange={(event) => set('alg_tr', event.target.value)} /></label>
          <label className="field"><span>İngilizce</span><textarea lang="en" value={form.alg_en} onChange={(event) => set('alg_en', event.target.value)} /></label>
          <label className="field"><span>Arapça</span><textarea lang="ar" dir="rtl" value={form.alg_ar} onChange={(event) => set('alg_ar', event.target.value)} /></label>
          <label className="field"><span>Rusça</span><textarea lang="ru" value={form.alg_ru} onChange={(event) => set('alg_ru', event.target.value)} /></label>
        </div>
      </div>
    </>
  );
}

function VariantEditor({ variants, setVariants }) {
  const update = (index, key, value) => setVariants((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  return (
    <div className="language-block">
      <div className="editor-heading">
        <div><h3>Fiyat seçenekleri</h3><p className="form-hint">Şişe, porsiyon veya boyut seçenekleri. Girilirse tek fiyat kullanılmaz.</p></div>
        <button className="secondary-button compact" type="button" disabled={variants.length >= MAX_VARIANTS} onClick={() => setVariants((rows) => [...rows, { ...EMPTY_VARIANT }])}>+ Seçenek</button>
      </div>
      <div className="variant-list">
        {variants.map((variant, index) => (
          <div className="variant-row" key={index}>
            <div className="form-grid variant-grid">
              <label className="field"><span>Ad (TR)</span><input lang="tr" value={variant.name_tr} onChange={(event) => update(index, 'name_tr', event.target.value)} /></label>
              <label className="field"><span>Ad (EN)</span><input lang="en" value={variant.name_en} onChange={(event) => update(index, 'name_en', event.target.value)} /></label>
              <label className="field"><span>Ad (AR)</span><input lang="ar" dir="rtl" value={variant.name_ar} onChange={(event) => update(index, 'name_ar', event.target.value)} /></label>
              <label className="field"><span>Ad (RU)</span><input lang="ru" value={variant.name_ru} onChange={(event) => update(index, 'name_ru', event.target.value)} /></label>
              <label className="field"><span>Fiyat (TL)</span><input type="number" min="0" step="0.01" value={variant.price} onChange={(event) => update(index, 'price', event.target.value)} /></label>
              <button type="button" className="danger-button compact" onClick={() => setVariants((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Kaldır</button>
            </div>
          </div>
        ))}
        {!variants.length && <p className="empty-inline">Bu ürün tek fiyat kullanıyor.</p>}
      </div>
    </div>
  );
}

function ProductForm({ product, categories, onClose, onSave, onDelete, request, publicMenuUrl, onGalleryChange }) {
  const [form, setForm] = useState(() => formValue(product, categories));
  const [pendingImages, setPendingImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Çeviri üç alanı birden doldurur; set() tek anahtarlık hâli.
  const patch = (values) => setForm((old) => ({ ...old, ...values }));
  const set = (key, value) => patch({ [key]: value });

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await onSave(buildProductPayload(form, product), pendingImages);
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!product || !window.confirm(`“${product.name_tr}” kalıcı olarak silinsin mi?`)) return;
    setBusy(true); setError('');
    try { await onDelete(product.id); onClose(); } catch (deleteError) { setError(deleteError.message); setBusy(false); }
  }

  function toggleDiet(tag) {
    setForm((old) => ({ ...old, diet: old.diet.includes(tag) ? old.diet.filter((item) => item !== tag) : [...old.diet, tag] }));
  }

  function changeMarketPrice(checked) {
    setForm((old) => ({
      ...old,
      is_market_price: checked,
      price: checked && !truthy(product?.is_market_price) ? '' : old.price,
    }));
  }

  return (
    <form onSubmit={submit} className="form-stack">
      {error && <div className="alert error">{error}</div>}
      <div className="form-grid two">
        <label className="field"><span>Kategori *</span><select value={form.category_id} onChange={(event) => set('category_id', event.target.value)} required>{categories.map((category) => <option key={category.id} value={category.id}>{category.name_tr}</option>)}</select></label>
        <label className="field"><span>Menü sırası</span><input type="number" value={form.sort} onChange={(event) => set('sort', event.target.value)} /></label>
      </div>

      <TranslationFields form={form} set={set} patch={patch} />
      <ContentFields form={form} set={set} patch={patch} />

      <div className="form-grid three">
        <label className="field"><span>{form.is_market_price ? 'Günün fiyatı (TL)' : 'Fiyat (TL)'}</span><input type="number" min="0" step="0.01" disabled={!form.is_market_price && form.variants.length > 0} value={form.price} onChange={(event) => set('price', event.target.value)} /><small>{form.is_market_price ? 'Boşsa menüde “Piyasa Fiyatı” görünür.' : form.variants.length ? 'Seçenek fiyatları kullanılıyor.' : ''}</small></label>
        <label className="field"><span>Kalori (kcal)</span><input type="number" min="0" value={form.kcal} onChange={(event) => set('kcal', event.target.value)} /></label>
        <label className="field"><span>Porsiyon</span><input value={form.portion} onChange={(event) => set('portion', event.target.value)} placeholder="250 g" /></label>
      </div>

      <div className="toggle-grid">
        <label className="check-card"><input type="checkbox" checked={form.is_market_price} onChange={(event) => changeMarketPrice(event.target.checked)} /><span>Piyasa fiyatı</span></label>
        <label className="check-card"><input type="checkbox" checked={form.is_available} onChange={(event) => set('is_available', event.target.checked)} /><span>Stokta</span></label>
        <label className="check-card"><input type="checkbox" checked={form.is_hidden} onChange={(event) => set('is_hidden', event.target.checked)} /><span>Menüde gizli</span></label>
        <label className="check-card"><input type="checkbox" checked={form.popular} onChange={(event) => set('popular', event.target.checked)} /><span>Popüler</span></label>
        <label className="check-card"><input type="checkbox" checked={form.chef} onChange={(event) => set('chef', event.target.checked)} /><span>Şef önerisi</span></label>
        <label className="check-card"><input type="checkbox" checked={form.diet.includes('gf')} onChange={() => toggleDiet('gf')} /><span>Glutensiz</span></label>
        <label className="check-card"><input type="checkbox" checked={form.diet.includes('veg')} onChange={() => toggleDiet('veg')} /><span>Vejetaryen</span></label>
      </div>

      {!form.is_market_price && <VariantEditor variants={form.variants} setVariants={(value) => setForm((old) => ({ ...old, variants: typeof value === 'function' ? value(old.variants) : value }))} />}

      {product ? (
        <ProductGallery product={product} request={request} publicMenuUrl={publicMenuUrl} onChange={onGalleryChange} />
      ) : (
        <div className="image-field">
          <div className="image-placeholder">Yeni ürün</div>
          <label className="field grow"><span>İlk görseller</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => setPendingImages(Array.from(event.target.files || []).slice(0, MAX_IMAGES))} /><small>{pendingImages.length ? `${pendingImages.length} görsel seçildi.` : `En çok ${MAX_IMAGES} görsel; ürün kaydedildikten sonra yüklenir.`}</small></label>
        </div>
      )}

      <div className="form-actions">
        {product && <button className="danger-button" type="button" disabled={busy} onClick={remove}>Ürünü sil</button>}
        <span className="spacer" />
        <button className="secondary-button" type="button" onClick={onClose}>Vazgeç</button>
        <button className="primary-button" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
      </div>
    </form>
  );
}

export default function Products({ menu, onReload, request, publicMenuUrl }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [missingOnly, setMissingOnly] = useState(false);
  const [editing, setEditing] = useState(undefined);
  const categoriesById = useMemo(() => Object.fromEntries(menu.categories.map((item) => [item.id, item])), [menu.categories]);
  const filtered = useMemo(() => menu.products.filter((product) => {
    if (category !== 'all' && product.category_id !== category) return false;
    if (missingOnly && missingProductTranslationCodes(product).length === 0) return false;
    return productMatchesQuery(product, query);
  }), [menu.products, category, missingOnly, query]);

  // Sürükleme yalnız tek kategori seçiliyken ve süzgeçler kapalıyken açılır.
  // Filtrelenmiş listede taşımak anlamsız: görünen 5 üründen birini oynatınca
  // görünmeyen 60 ürünün sırası belirsiz kalırdı.
  const siralanabilir = category !== 'all' && !missingOnly && !query.trim();

  const [surukleAktif, setSurukleAktif] = useState(false);
  const [kaynak, setKaynak] = useState(null);
  const [siralama, setSiralama] = useState(null); // iyimser sıra; null = sunucudaki
  const [hata, setHata] = useState('');

  const liste = (siralanabilir && siralama) || filtered;

  async function birak(hedefIndeks) {
    setSurukleAktif(false);
    if (kaynak === null || kaynak === hedefIndeks) { setKaynak(null); return; }

    const oncekiSira = liste;
    const yeni = tasi(liste, kaynak, hedefIndeks);
    setKaynak(null);
    setSiralama(yeni);
    setHata('');

    try {
      await request('put', '/admin/products/order', {
        category_id: category, ids: yeni.map((p) => p.id),
      });
      await onReload();
      setSiralama(null);
    } catch (error) {
      setSiralama(oncekiSira);
      setHata(error.message);
    }
  }

  async function save(payload, pendingImages) {
    let saved = editing
      ? await request('patch', `/admin/products/${editing.id}`, payload)
      : await request('post', '/admin/products', payload);
    if (!editing) setEditing(saved);
    try {
      for (const file of pendingImages) {
        const data = new FormData(); data.append('image', file);
        saved = await request('post', `/admin/products/${saved.id}/images`, data);
        setEditing(saved);
      }
      return saved;
    } finally {
      await onReload();
    }
  }

  async function remove(id) { await request('del', `/admin/products/${id}`); await onReload(); }
  async function galleryChanged(product) { setEditing(product); await onReload(); }

  return (
    <div className="view-stack">
      <header className="page-heading"><div><span className="eyebrow">MENÜ İÇERİĞİ</span><h1>Ürünler</h1></div><button className="primary-button" onClick={() => setEditing(null)}>+ Yeni ürün</button></header>
      <div className="toolbar"><label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ürün ara…" /></label><span className="result-count">{filtered.length} ürün</span></div>
      <div className="chips"><button className={missingOnly ? 'active' : ''} onClick={() => setMissingOnly((value) => !value)}>Çeviri eksiği</button><button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>Tümü</button>{menu.categories.map((item) => <button key={item.id} className={category === item.id ? 'active' : ''} onClick={() => setCategory(item.id)}>{item.name_tr}</button>)}</div>
      {hata && <div className="alert error">{hata}</div>}
      {!siralanabilir && <p className="empty-text">Sıralamak için tek bir kategori seçin ve aramayı temizleyin.</p>}
      <section className="data-list">
        {liste.map((product, index) => {
          const imageUrl = product.image_url ? new URL(product.image_url, publicMenuUrl).href : '';
          const missingLanguages = missingProductTranslationCodes(product);
          const row = <button className="product-row" key={product.id} onClick={() => setEditing(product)}>
            {imageUrl ? <img src={imageUrl} alt="" /> : <span className="thumb-placeholder">Y</span>}
            <span className="product-main"><strong>{product.name_tr}</strong><small>{categoriesById[product.category_id]?.name_tr || product.category_id} · {priceLabel(product)}</small></span>
            <span className="row-badges">{missingLanguages.map((code) => <i className="warn" key={code}>{code.toUpperCase()} eksik</i>)}{product.is_hidden ? <i>Gizli</i> : null}{product.is_available === 0 ? <i className="warn">Tükendi</i> : null}{product.popular ? <i className="gold">Popüler</i> : null}{product.variants?.length ? <i>{product.variants.length} seçenek</i> : null}</span>
            <span className="edit-circle">›</span>
          </button>;
          if (!siralanabilir) return row;
          return <div
            className={`category-drag${kaynak === index ? ' dragging' : ''}`}
            key={product.id}
            draggable={surukleAktif}
            onDragStart={() => setKaynak(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => birak(index)}
            onDragEnd={() => { setSurukleAktif(false); setKaynak(null); }}
          >
            <span className="drag-mark" title="Sıralamak için sürükleyin" onPointerDown={() => setSurukleAktif(true)}>≡</span>
            {row}
          </div>;
        })}
        {!liste.length && <p className="empty-text">Bu filtreye uyan ürün yok.</p>}
      </section>
      {editing !== undefined && <Modal wide title={editing ? 'Ürünü düzenle' : 'Yeni ürün'} onClose={() => setEditing(undefined)}><ProductForm key={editing?.id || 'new'} product={editing} categories={menu.categories} onClose={() => setEditing(undefined)} onSave={save} onDelete={remove} request={request} publicMenuUrl={publicMenuUrl} onGalleryChange={galleryChanged} /></Modal>}
    </div>
  );
}
