# Kategori Sürükle-Bırak Sıralama — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kategorileri listede sürükleyerek sıralayabilmek; sıra bırakılır bırakılmaz atomik olarak kaydedilsin.

**Architecture:** Yedigül'e tüm sırayı tek transaction'da yazan bir toplu uç eklenir (`PUT /categories/order`, tam permütasyon şartı). Panel tarayıcının yerleşik sürükleme API'sini kullanır — yeni bağımlılık yok; sürükleme yalnız `≡` tutamacından başlar, böylece satıra tıklayınca düzenleme kutusu açılmaya devam eder.

**Tech Stack:** Node 25 · ESM · Express 5 · better-sqlite3 (Yedigül) · React 19 · `node:test`

## Global Constraints

- İki depo: `C:\Users\kanad\Desktop\Projeler\Yedigül` (sunucu), `C:\Users\kanad\Desktop\Projeler\Yediguladmin` (panel).
- Tüm kod ESM. Yorumlar **Türkçe**, dosya adları **ASCII**.
- **Yeni üretim bağımlılığı eklenmez** — sürükleme kütüphanesi yok.
- `sort` sütunu benzersiz DEĞİL; yarım liste yazmak çakışma yaratır. Permütasyon doğrulaması zorunlu.
- Yedigül testleri: `server/` dizininden `node --test test/*.test.js` (şu an 99/99).
- Panel testleri: `npm test` (şu an 62/62). Lint: `npm run lint`.

## Dosya Yapısı

| Dosya | Sorumluluk |
|---|---|
| `Yedigül/server/routes/admin.js` (değişir) | `PUT /categories/order` |
| `Yedigül/server/test/admin-categories.test.js` (değişir) | Ucun testleri |
| `Yediguladmin/src/lib/reorder.js` (yeni) | `tasi()` saf fonksiyonu |
| `Yediguladmin/server/test/reorder.test.js` (yeni) | `tasi()` testleri |
| `Yediguladmin/src/views/Categories.jsx` (değişir) | Sürükleme arayüzü |
| `Yediguladmin/src/styles.css` (değişir) | Sürükleme geri bildirimi |

---

## Task 1: Toplu sıralama ucu

**Depo:** `Yedigül`

**Files:**
- Modify: `server/routes/admin.js` (kategori rotalarının yanına)
- Test: `server/test/admin-categories.test.js`

**Interfaces:**
- Produces: `PUT /api/admin/categories/order` — gövde `{ ids: string[] }`, yanıt `{ ok: true, count: number }`

- [ ] **Step 1: Write the failing test**

`server/test/admin-categories.test.js` dosyasının sonuna ekle (mevcut `base`, `h()` yardımcıları kullanılır — dosyanın kendi kurulumuna bak, farklıysa ona uydur):

```js
test('kategoriler toplu olarak yeniden sıralanır', async () => {
  const before = await fetch(`${base}/api/admin/menu`, { headers: h() });
  const ids = (await before.json()).categories.map((c) => c.id);
  const yeni = [...ids].reverse();

  const res = await fetch(`${base}/api/admin/categories/order`, {
    method: 'PUT', headers: h(), body: JSON.stringify({ ids: yeni }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, count: yeni.length });

  const after = await fetch(`${base}/api/admin/menu`, { headers: h() });
  const sonra = (await after.json()).categories;
  assert.deepEqual(sonra.map((c) => c.id), yeni, 'GET /menu yeni sırayı vermeli');
  assert.deepEqual(sonra.map((c) => c.sort), yeni.map((_, i) => i), 'sort 0dan ardışık olmalı');
});

test('eksik id ile sıralama reddedilir ve hiçbir şey değişmez', async () => {
  const before = await fetch(`${base}/api/admin/menu`, { headers: h() });
  const ids = (await before.json()).categories.map((c) => c.id);

  const res = await fetch(`${base}/api/admin/categories/order`, {
    method: 'PUT', headers: h(), body: JSON.stringify({ ids: ids.slice(1) }),
  });
  assert.equal(res.status, 400);

  const after = await fetch(`${base}/api/admin/menu`, { headers: h() });
  assert.deepEqual((await after.json()).categories.map((c) => c.id), ids, 'sıra bozulmamalı');
});

test('tekrarlı, bilinmeyen veya boş id listesi reddedilir', async () => {
  const before = await fetch(`${base}/api/admin/menu`, { headers: h() });
  const ids = (await before.json()).categories.map((c) => c.id);

  const gonder = (body) => fetch(`${base}/api/admin/categories/order`, {
    method: 'PUT', headers: h(), body: JSON.stringify(body),
  });

  // Tekrarlı: uzunluk doğru ama bir kategori iki kez, biri hiç yok
  const tekrarli = [...ids]; tekrarli[1] = tekrarli[0];
  assert.equal((await gonder({ ids: tekrarli })).status, 400);

  // Bilinmeyen id
  const uydurma = [...ids]; uydurma[0] = 'olmayan-kategori';
  assert.equal((await gonder({ ids: uydurma })).status, 400);

  assert.equal((await gonder({ ids: [] })).status, 400);
  assert.equal((await gonder({})).status, 400);
});

test('sıralama denetim kaydına yazılır', async () => {
  const before = await fetch(`${base}/api/admin/menu`, { headers: h() });
  const ids = (await before.json()).categories.map((c) => c.id);

  await fetch(`${base}/api/admin/categories/order`, {
    method: 'PUT', headers: h(), body: JSON.stringify({ ids: [...ids].reverse() }),
  });

  const log = await fetch(`${base}/api/admin/history`, { headers: h() });
  const entries = (await log.json()).entries;
  assert.ok(entries.some((e) => e.entity === 'category' && /sıra/i.test(e.detail)),
    'denetim kaydında sıralama girişi olmalı');
});

test('sıralama oturumsuz yapılamaz', async () => {
  const res = await fetch(`${base}/api/admin/categories/order`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: ['fish'] }),
  });
  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/admin-categories.test.js`
Expected: FAIL — uç yok, 404 döner (HTML'e yönlendirilir).

- [ ] **Step 3: Write minimal implementation**

`server/routes/admin.js` içinde `router.delete('/categories/:id', ...)` rotasının hemen ardına ekle:

```js
  /**
   * Kategori sırasını toplu yazar.
   *
   * Tek tek PATCH yerine tek uç: sıra yarım uygulanamaz. `sort` sütunu
   * benzersiz DEĞİL — eksik bir liste iki kategoriye aynı değeri verir ve
   * ORDER BY sort ikisi arasında rastgele karar verir, sıra her yüklemede
   * değişir. Bu yüzden liste TAM PERMÜTASYON olmak zorunda.
   */
  router.put('/categories/order', (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : null;
    if (!ids || !ids.length) return res.status(400).json({ error: 'ids listesi gerekli.' });

    const mevcut = db.prepare('SELECT id FROM categories').all().map((row) => row.id);
    const benzersiz = new Set(ids);
    if (benzersiz.size !== ids.length) {
      return res.status(400).json({ error: 'Listede tekrar eden kategori var.' });
    }
    if (ids.length !== mevcut.length || mevcut.some((id) => !benzersiz.has(id))) {
      return res.status(400).json({ error: 'Liste tüm kategorileri tam olarak içermeli.' });
    }

    const write = db.prepare('UPDATE categories SET sort = ? WHERE id = ?');
    db.transaction((sirali) => {
      sirali.forEach((id, index) => write.run(index, id));
    })(ids);

    logChange(db, {
      action: 'update', entity: 'category',
      detail: `Kategori sırası değiştirildi (${ids.length} kategori)`,
    });
    res.json({ ok: true, count: ids.length });
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/*.test.js`
Expected: Tüm testler PASS (99 + yeni 5).

- [ ] **Step 5: Commit**

```bash
git add server/routes/admin.js server/test/admin-categories.test.js
git commit -m "feat(admin): add atomic bulk category reorder endpoint"
```

---

## Task 2: `tasi()` saf fonksiyonu

**Depo:** `Yediguladmin`

**Files:**
- Create: `src/lib/reorder.js`
- Test: `server/test/reorder.test.js`

**Interfaces:**
- Produces: `tasi(liste: T[], kaynak: number, hedef: number): T[]` — yeni dizi döner, girdiyi değiştirmez

- [ ] **Step 1: Write the failing test**

Create `server/test/reorder.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tasi } from '../../src/lib/reorder.js';

const L = ['a', 'b', 'c', 'd'];

test('aşağı taşır', () => {
  assert.deepEqual(tasi(L, 0, 2), ['b', 'c', 'a', 'd']);
});

test('yukarı taşır', () => {
  assert.deepEqual(tasi(L, 3, 1), ['a', 'd', 'b', 'c']);
});

test('aynı yere bırakınca dizi değişmez', () => {
  assert.deepEqual(tasi(L, 2, 2), L);
});

test('uç indeksler: başa ve sona taşıma', () => {
  assert.deepEqual(tasi(L, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(tasi(L, 0, 3), ['b', 'c', 'd', 'a']);
});

test('girdiyi değiştirmez', () => {
  const kopya = [...L];
  tasi(L, 0, 3);
  assert.deepEqual(L, kopya, 'kaynak dizi bozulmamalı');
});

test('geçersiz indekste diziyi olduğu gibi döndürür', () => {
  assert.deepEqual(tasi(L, -1, 2), L);
  assert.deepEqual(tasi(L, 0, 99), L);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/lib/reorder.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/reorder.js`:

```js
/**
 * Bir elemanı listede başka bir konuma taşır ve YENİ dizi döndürür.
 *
 * Saf tutulmasının sebebi: sürükle-bırak arayüzü tarayıcı olaylarına bağlı,
 * doğrudan test edilmesi zor. Sıralama mantığı burada ayrı durunca uç
 * durumlar (başa/sona taşıma, aynı yere bırakma) tek başına sınanabilir.
 */
export function tasi(liste, kaynak, hedef) {
  const son = liste.length - 1;
  if (kaynak < 0 || hedef < 0 || kaynak > son || hedef > son) return liste;
  if (kaynak === hedef) return liste;

  const kopya = [...liste];
  const [tasinan] = kopya.splice(kaynak, 1);
  kopya.splice(hedef, 0, tasinan);
  return kopya;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (62 + 6)

- [ ] **Step 5: Commit**

```bash
git add src/lib/reorder.js server/test/reorder.test.js
git commit -m "feat(lib): add pure list reorder helper"
```

---

## Task 3: Sürükleme arayüzü

**Depo:** `Yediguladmin`

**Files:**
- Modify: `src/views/Categories.jsx` (satır 44-52 arası, liste bölümü)
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `tasi()` (Task 2), `PUT /admin/categories/order` (Task 1), mevcut `request` ve `onReload` prop'ları

- [ ] **Step 1: Sürükleme durumunu ve kaydetmeyi ekle**

`src/views/Categories.jsx` en üstteki import'lara ekle:

```js
import { tasi } from '../lib/reorder.js';
```

`Categories` bileşeninin gövdesinde, `const [editing, setEditing] = useState(undefined);` satırının altına ekle:

```js
  // Sürükleme yalnız ≡ tutamacından başlar: tarayıcı sürüklemeyi tıklamadan
  // ayırt etmez, satırın tamamı draggable olsaydı düzenleme kutusu açılmazdı.
  const [surukleAktif, setSurukleAktif] = useState(false);
  const [kaynak, setKaynak] = useState(null);
  const [siralama, setSiralama] = useState(null); // iyimser sıra; null = sunucudaki
  const [hata, setHata] = useState('');

  const kategoriler = siralama || menu.categories;

  async function birak(hedefIndeks) {
    setSurukleAktif(false);
    if (kaynak === null || kaynak === hedefIndeks) { setKaynak(null); return; }

    const oncekiSira = kategoriler;
    const yeni = tasi(kategoriler, kaynak, hedefIndeks);
    setKaynak(null);
    setSiralama(yeni);   // iyimser: arayüz hemen yeni sırayı gösterir
    setHata('');

    try {
      await request('put', '/admin/categories/order', { ids: yeni.map((c) => c.id) });
      await onReload();
      setSiralama(null); // sunucudaki sıra artık doğru; ona geri dön
    } catch (error) {
      setSiralama(oncekiSira);
      setHata(error.message);
    }
  }
```

- [ ] **Step 2: Liste işaretlemesini sürüklenebilir yap**

`<section className="data-list category-list">…</section>` bloğunu şununla değiştir:

```jsx
    {hata && <div className="alert error">{hata}</div>}
    <section className="data-list category-list">{kategoriler.map((category, index) => {
      const count = menu.products.filter((p) => p.category_id === category.id).length;
      const missingLanguages = missingCategoryTranslationCodes(category);
      return <div
        className={`category-drag${kaynak === index ? ' dragging' : ''}`}
        key={category.id}
        draggable={surukleAktif}
        onDragStart={() => setKaynak(index)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => birak(index)}
        onDragEnd={() => { setSurukleAktif(false); setKaynak(null); }}
      >
        <span
          className="drag-mark"
          title="Sıralamak için sürükleyin"
          onPointerDown={() => setSurukleAktif(true)}
        >≡</span>
        <button className="category-row" onClick={() => setEditing(category)}>
          <span className="category-index">{String(index).padStart(2, '0')}</span>
          <span className="product-main">
            <strong>{category.name_tr}</strong>
            <small>{category.name_en} · {count} ürün{missingLanguages.length ? ` · ${missingLanguages.map((code) => `${code.toUpperCase()} eksik`).join(', ')}` : ''}</small>
          </span>
          {category.is_active === 0 && <i className="inactive-badge">Pasif</i>}
          <span className="edit-circle">›</span>
        </button>
      </div>;
    })}</section>
```

> Not: `category-index` artık `category.sort` yerine dizideki `index`'i gösterir — sürükleme sırasında sunucudaki `sort` henüz güncellenmemiş olur, listedeki gerçek konumu göstermek doğrusudur.

- [ ] **Step 3: Stil ekle**

`src/styles.css` içinde `.category-row` kuralının yanına ekle:

```css
.category-drag { display: flex; align-items: stretch; }
.category-drag .category-row { flex: 1; }
.category-drag .drag-mark { display: grid; place-items: center; padding: 0 4px; cursor: grab; user-select: none; color: var(--muted); }
.category-drag .drag-mark:active { cursor: grabbing; }
.category-drag.dragging { opacity: .45; }
```

`.drag-mark` mevcut `.category-row` içindeydi; oradaki eski tanımı bozmamak için bu kurallar `.category-drag` altında kapsanmıştır.

- [ ] **Step 4: Lint ve derle**

Run: `npm run lint && npm run build`
Expected: Uyarı yok, derleme başarılı.

- [ ] **Step 5: Commit**

```bash
git add src/views/Categories.jsx src/styles.css
git commit -m "feat(ui): reorder categories by dragging the handle"
```

---

## Task 4: Doğrulama

**Files:** yok (yalnız doğrulama)

- [ ] **Step 1: Her iki test paketi**

Run: `cd C:/Users/kanad/Desktop/Projeler/Yedigül/server && node --test test/*.test.js`
Expected: `fail 0`

Run: `cd C:/Users/kanad/Desktop/Projeler/Yediguladmin && npm test`
Expected: `fail 0`

- [ ] **Step 2: Uçtan uca — gerçek sunucuya karşı**

Gerçek Yedigül sunucusunu bellek içinde çalıştırıp panelin gönderdiği isteği
uygula; sıranın hem yazıldığını hem `GET /menu`'de yansıdığını, hatalı listenin
reddedildiğini doğrula. (Önceki iş için yazılan `e2e-snapshot.mjs` deseni.)

- [ ] **Step 3: Tarayıcıda elle dene**

```bash
node server/test/fixtures/mock-remote.js   # 1. terminal
npm run dev                                # 2. terminal
```

`http://127.0.0.1:4310` → şifre `test-panel` → Kategoriler.

Beklenen: `≡` tutamacından sürükleyince satır soluklaşır, başka satırın üzerine
bırakınca sıra değişir. Satır gövdesine tıklamak hâlâ düzenleme kutusunu açar.

> Not: `mock-remote.js`'te `/categories/order` ucu yok — bırakınca hata çıkar ve
> sıra eski hâline döner. Bu **beklenen** davranış ve tam da geri alma yolunu
> kanıtlar. Mock'a uç eklemek istersen ekle; gerçek sunucuda sorunsuz çalışır.
