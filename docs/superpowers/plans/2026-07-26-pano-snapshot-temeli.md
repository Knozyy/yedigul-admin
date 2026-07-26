# Pano Anlık Görüntü Temeli — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ölçütlerin geçmişini varlık başına saklayan bir anlık görüntü temeli kurmak ve bugünden itibaren ürün fiyatlarını toplamaya başlamak.

**Architecture:** Canlı sunucu (`Yedigül`) `pano_snapshots` tablosunu `entity` sütunuyla tutar ve ölçüt kaydına (registry) göre doğrular — otorite odur. Panel (`Yediguladmin`) kendi yerel `node:sqlite` önbelleğinde birikim yapar, panel her açıldığında birikimi arka planda sunucuya iter, elle basılan senkron düğmesiyle de sunucudan çeker.

**Tech Stack:** Node 25 · ESM · Express 5 · `better-sqlite3` (Yedigül) · `node:sqlite` (Yediguladmin) · `node:test`

## Global Constraints

- İki ayrı depo: `C:\Users\kanad\Desktop\Projeler\Yedigül` (sunucu) ve `C:\Users\kanad\Desktop\Projeler\Yediguladmin` (panel). Her görev tek depoda çalışır.
- Tüm kod ESM (`import`/`export`). CommonJS yok.
- Kod yorumları **Türkçe**, dosya adları **ASCII**.
- `entity` biçimi: `^[A-Za-z0-9_.-]{1,80}$` — ürün id'si sunucuda zaten `^[A-Za-z0-9_-]{1,64}$` ile sınırlı.
- `POST /admin/snapshots` en çok **2000** kayıt; `GET` en çok **5000** satır, aralıksız varsayılan **son 90 gün**.
- Snapshot verisi **asla budanmaz**.
- Yediguladmin testleri `npm test` ile çalışır (`--disable-warning=ExperimentalWarning` script'te zaten var).
- Yedigül testleri `server/` dizininden `node --test test/*.test.js` ile çalışır.
- Yedigül'de `server/db.js` ve `server/routes/admin.js` üzerinde **commit edilmemiş** değişiklikler var (mevcut `pano_snapshots` + uçlar, 7 testi geçiyor). Bu plan onların üzerine kurar.

## Dosya Yapısı

**Yedigül (sunucu)**
| Dosya | Sorumluluk |
|---|---|
| `server/snapshot-metrics.js` (yeni) | Ölçüt kaydı ve doğrulama kuralları — tek doğruluk kaynağı |
| `server/db.js` (değişir) | `entity` sütunu, birincil anahtar, indeks, migration |
| `server/routes/admin.js` (değişir) | `POST`/`GET /snapshots` — registry'yi kullanır |
| `server/test/admin-snapshots.test.js` (değişir) | Uçların testleri |

**Yediguladmin (panel)**
| Dosya | Sorumluluk |
|---|---|
| `server/cache.js` (değişir) | `entity` destekli yerel depo + migration |
| `server/remote-client.js` (değişir) | `write()` — uzak sunucuya POST |
| `server/snapshots/prices.js` (yeni) | Menü yanıtından fiyat kayıtları üretir (saf fonksiyon) |
| `server/snapshots/sync.js` (yeni) | Toplama, itme, çekme, arka plan senkronu |
| `server/app.js` (değişir) | Arka plan push + `/local-api/panel/sync` ucu |
| `src/views/Pano.jsx`, `src/App.jsx` (değişir) | "Sunucuyla eşitle" düğmesi |
| `server/test/snapshots.test.js` (yeni) | Panel tarafı testleri |

---

## Task 1: Sunucu şeması — entity sütunu ve migration

**Depo:** `Yedigül`

**Files:**
- Modify: `server/db.js` (`pano_snapshots` tanımı, ~satır 58-68)
- Test: `server/test/admin-snapshots.test.js`

**Interfaces:**
- Consumes: yok (ilk görev)
- Produces: `pano_snapshots(day TEXT, metric TEXT, entity TEXT DEFAULT '', value REAL)`, `PRIMARY KEY (day, metric, entity)`

- [ ] **Step 1: Write the failing test**

`server/test/admin-snapshots.test.js` içindeki `'pano_snapshots tablosu oluşur'` testini şununla değiştir:

```js
test('pano_snapshots tablosu entity sütunuyla oluşur', () => {
  const db = openDb(':memory:');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  assert.ok(tables.includes('pano_snapshots'));

  const cols = db.prepare('PRAGMA table_info(pano_snapshots)').all();
  const entity = cols.find((c) => c.name === 'entity');
  assert.ok(entity, 'entity sütunu olmalı');
  assert.equal(entity.pk, 3, 'entity birincil anahtarın 3. parçası olmalı');
  assert.equal(cols.find((c) => c.name === 'day').pk, 1);
  assert.equal(cols.find((c) => c.name === 'metric').pk, 2);
});

test('eski şemadaki satırlar migration ile korunur', () => {
  const db = openDb(':memory:');
  // Eski hâli taklit et: entity'siz tablo + bir satır
  db.exec(`
    DROP TABLE pano_snapshots;
    CREATE TABLE pano_snapshots (
      day TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL,
      PRIMARY KEY (day, metric)
    );
    INSERT INTO pano_snapshots (day, metric, value) VALUES ('2026-07-01', 'ig.followers', 4000);
  `);
  migratePanoSnapshots(db);

  const rows = db.prepare('SELECT day, metric, entity, value FROM pano_snapshots').all();
  assert.deepEqual(rows, [{ day: '2026-07-01', metric: 'ig.followers', entity: '', value: 4000 }]);
});
```

Dosyanın en üstündeki import satırını şuna çevir:

```js
import { openDb, localDay, migratePanoSnapshots } from '../db.js';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/admin-snapshots.test.js`
Expected: FAIL — `migratePanoSnapshots is not a function` ve `entity sütunu olmalı`.

- [ ] **Step 3: Write minimal implementation**

`server/db.js` içindeki `pano_snapshots` bloğunu şununla değiştir:

```sql
    -- Pano anlık görüntüleri: Instagram takipçi sayısı, Google puanı, ürün
    -- fiyatı gibi API'nin yalnızca "şu an"ını verdiği, geçmişi ALINAMAYAN
    -- ölçütler. Panelden gönderilir; burada tutulmasının sebebi tek bir geçmiş
    -- olması ve db-backup.sh'ın data.db ile birlikte yedeklemesi.
    -- entity: varlık başına ölçütler için (ör. ürün fiyatı). '' = global ölçüt.
    CREATE TABLE IF NOT EXISTS pano_snapshots (
      day    TEXT NOT NULL,
      metric TEXT NOT NULL,
      entity TEXT NOT NULL DEFAULT '',
      value  REAL NOT NULL,
      PRIMARY KEY (day, metric, entity)
    );
    CREATE INDEX IF NOT EXISTS idx_pano_snapshots_seri
      ON pano_snapshots(metric, entity, day);
```

`openDb` içinde, mevcut `products` migration bloğunun yanına migration çağrısını ekle (tablo `exec` edildikten sonra):

```js
  migratePanoSnapshots(db);
```

Ve dosyaya şu dışa aktarılan fonksiyonu ekle:

```js
/**
 * pano_snapshots'a entity sütununu ekler.
 *
 * ALTER TABLE birincil anahtarı genişletemez, CREATE TABLE IF NOT EXISTS de
 * mevcut tabloyu değiştirmez. Bu yüzden tablo yeniden kurulur: satırlar
 * entity='' ile kopyalanır, sonra eskisi düşürülür. Kopyalayarak yapılır —
 * DROP ile veri atılmaz.
 */
export function migratePanoSnapshots(db) {
  const cols = db.prepare('PRAGMA table_info(pano_snapshots)').all().map((c) => c.name);
  if (cols.includes('entity')) return;

  db.exec(`
    CREATE TABLE pano_snapshots_yeni (
      day    TEXT NOT NULL,
      metric TEXT NOT NULL,
      entity TEXT NOT NULL DEFAULT '',
      value  REAL NOT NULL,
      PRIMARY KEY (day, metric, entity)
    );
    INSERT INTO pano_snapshots_yeni (day, metric, entity, value)
      SELECT day, metric, '', value FROM pano_snapshots;
    DROP TABLE pano_snapshots;
    ALTER TABLE pano_snapshots_yeni RENAME TO pano_snapshots;
    CREATE INDEX IF NOT EXISTS idx_pano_snapshots_seri
      ON pano_snapshots(metric, entity, day);
  `);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/admin-snapshots.test.js`
Expected: Şema ve migration testleri PASS. Diğer testler hâlâ geçmeli (uçlar henüz entity bilmiyor ama `entity` DEFAULT `''` olduğu için eski `INSERT` çalışır).

- [ ] **Step 5: Commit**

```bash
git add server/db.js server/test/admin-snapshots.test.js
git commit -m "feat(db): add entity column to pano_snapshots with migration"
```

---

## Task 2: Ölçüt kaydı (registry)

**Depo:** `Yedigül`

**Files:**
- Create: `server/snapshot-metrics.js`
- Test: `server/test/snapshot-metrics.test.js`

**Interfaces:**
- Consumes: yok
- Produces:
  - `METRIC_REGISTRY: Record<string, { entity: 'yok' | 'zorunlu' }>`
  - `isKnownMetric(metric: string): boolean`
  - `isValidEntity(metric: string, entity: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `server/test/snapshot-metrics.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { METRIC_REGISTRY, isKnownMetric, isValidEntity } from '../snapshot-metrics.js';

test('kayıtlı ölçütler tanınır, uydurma olan tanınmaz', () => {
  assert.ok(isKnownMetric('ig.followers'));
  assert.ok(isKnownMetric('menu.price'));
  assert.ok(isKnownMetric('menu.setPrice'), 'ürün seti işi için yeri ayrılmalı');
  assert.equal(isKnownMetric('uydurma.olcut'), false);
  assert.equal(isKnownMetric(''), false);
});

test('entity yok kuralı: boş olmalı', () => {
  assert.ok(isValidEntity('ig.followers', ''));
  assert.equal(isValidEntity('ig.followers', '42'), false, 'global ölçüte entity verilemez');
});

test('entity zorunlu kuralı: dolu ve biçime uygun olmalı', () => {
  assert.ok(isValidEntity('menu.price', 'levrek'));
  assert.ok(isValidEntity('menu.price', 'levrek-0'), 'varyant biçimi');
  assert.equal(isValidEntity('menu.price', ''), false, 'boş entity reddedilmeli');
});

test('entity biçim kısıtı uygulanır', () => {
  assert.equal(isValidEntity('menu.price', 'a'.repeat(81)), false, '80 karakteri aşamaz');
  assert.ok(isValidEntity('menu.price', 'a'.repeat(80)));
  // Ürün id'si sunucuda 64 karakterle sınırlı; varyant eki ile birlikte sığar.
  assert.ok(isValidEntity('menu.price', `${'u'.repeat(64)}-7`));
  assert.equal(isValidEntity('menu.price', 'boşluk var'), false);
  assert.equal(isValidEntity('menu.price', 'yol/gibi'), false);
});

test('bilinmeyen ölçüt için entity doğrulaması her zaman false', () => {
  assert.equal(isValidEntity('uydurma.olcut', ''), false);
});

test('kayıt beklenen ölçütleri içerir', () => {
  assert.deepEqual(Object.keys(METRIC_REGISTRY).sort(), [
    'ig.followers', 'ig.reach', 'menu.price', 'menu.setPrice',
    'reviews.count', 'reviews.rating',
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/snapshot-metrics.test.js`
Expected: FAIL — `Cannot find module '../snapshot-metrics.js'`

- [ ] **Step 3: Write minimal implementation**

Create `server/snapshot-metrics.js`:

```js
/**
 * Ölçüt kaydı — anlık görüntü deposunun tek doğruluk kaynağı.
 *
 * Sabit bir liste yerine kural taşıyan bir kayıt kullanılır çünkü ürün fiyatı
 * VARLIK BAŞINA bir seridir: 100 ürün 100 ayrı seri demektir, tek tek
 * sayılamaz. Bunun yerine ölçüt "entity ister mi" diye tanımlanır.
 *
 * Panel ayrı bir depo olduğu için bu kaydı paylaşamaz; doğrulamanın otoritesi
 * burasıdır. Panel yalnızca gönderir, reddedileni yanıttan öğrenir.
 */
export const METRIC_REGISTRY = {
  'ig.followers': { entity: 'yok' },
  'ig.reach': { entity: 'yok' },
  'reviews.rating': { entity: 'yok' },
  'reviews.count': { entity: 'yok' },
  // Ürün başına günlük fiyat. entity = ürün id'si, varyantlıda "<id>-<sıra>".
  'menu.price': { entity: 'zorunlu' },
  // Fix menü / masa senaryosu satış fiyatı. Yeri ayrıldı; henüz kimse yazmıyor.
  'menu.setPrice': { entity: 'zorunlu' },
};

// Ürün id'si sunucuda ^[A-Za-z0-9_-]{1,64}$ ile sınırlı; varyant eki ile
// birlikte 80 karakter fazlasıyla yeter.
const ENTITY_RE = /^[A-Za-z0-9_.-]{1,80}$/;

export function isKnownMetric(metric) {
  return Object.hasOwn(METRIC_REGISTRY, metric);
}

export function isValidEntity(metric, entity) {
  const rule = METRIC_REGISTRY[metric];
  if (!rule) return false;
  if (rule.entity === 'yok') return entity === '';
  return ENTITY_RE.test(entity);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/snapshot-metrics.test.js`
Expected: PASS (6 test)

- [ ] **Step 5: Commit**

```bash
git add server/snapshot-metrics.js server/test/snapshot-metrics.test.js
git commit -m "feat(server): add snapshot metric registry"
```

---

## Task 3: POST /snapshots — entity ve registry desteği

**Depo:** `Yedigül`

**Files:**
- Modify: `server/routes/admin.js` (`METRICS` sabiti ve `router.post('/snapshots')`)
- Test: `server/test/admin-snapshots.test.js`

**Interfaces:**
- Consumes: `isKnownMetric`, `isValidEntity` (Task 2)
- Produces: `POST /admin/snapshots` → `{ written: number, skipped: number, unknown: string[] }`

- [ ] **Step 1: Write the failing test**

`server/test/admin-snapshots.test.js` içindeki `post` yardımcısının altına şu testleri ekle ve mevcut `'bilinmeyen ölçüt ve bozuk kayıt atlanır...'` testinin `assert.deepEqual(await res.json(), { written: 1, skipped: 3 })` satırını şuna çevir:

```js
  const body = await res.json();
  assert.equal(body.written, 1);
  assert.equal(body.skipped, 3);
  assert.deepEqual(body.unknown, ['uydurma.olcut']);
```

Yeni testler:

```js
test('entity ile yazılır; aynı gün farklı entity çakışmaz', async () => {
  const res = await post([
    { day: '2026-07-25', metric: 'menu.price', entity: 'levrek', value: 850 },
    { day: '2026-07-25', metric: 'menu.price', entity: 'cipura', value: 780 },
    { day: '2026-07-25', metric: 'menu.price', entity: 'levrek-0', value: 850 },
  ]);
  assert.equal((await res.json()).written, 3);

  const read = await fetch(`${base}/api/admin/snapshots?metric=menu.price&from=2026-07-25&to=2026-07-25`, { headers: h() });
  const rows = (await read.json()).rows;
  assert.equal(rows.length, 3, 'üç varlık üç ayrı satır');
  assert.deepEqual(rows.map((r) => r.entity).sort(), ['cipura', 'levrek', 'levrek-0']);
});

test('entity kuralı çiğnenirse kayıt atlanır', async () => {
  const res = await post([
    { day: '2026-07-25', metric: 'menu.price', value: 100 },                      // entity eksik
    { day: '2026-07-25', metric: 'ig.followers', entity: 'levrek', value: 100 },  // olmaması gereken entity
    { day: '2026-07-25', metric: 'menu.price', entity: 'boşluk var', value: 100 },// geçersiz biçim
    { day: '2026-07-25', metric: 'menu.price', entity: 'a'.repeat(81), value: 1 },// çok uzun
  ]);
  const body = await res.json();
  assert.equal(body.written, 0);
  assert.equal(body.skipped, 4);
  assert.deepEqual(body.unknown, [], 'bunlar bilinmeyen ölçüt değil, kural ihlali');
});

test('global ölçüt entity olmadan yazılmaya devam eder', async () => {
  const res = await post([{ day: '2026-07-25', metric: 'ig.reach', value: 12000 }]);
  assert.equal((await res.json()).written, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/admin-snapshots.test.js`
Expected: FAIL — `entity` yazılmıyor, `unknown` alanı yanıtta yok.

- [ ] **Step 3: Write minimal implementation**

`server/routes/admin.js` içindeki `const METRICS = new Set([...])` bloğunu **tamamen sil**. Dosyanın en üstündeki import'ların yanına ekle:

```js
import { isKnownMetric, isValidEntity } from '../snapshot-metrics.js';
```

`router.post('/snapshots')` gövdesini şununla değiştir:

```js
  router.post('/snapshots', (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'Gönderilecek kayıt yok.' });
    if (items.length > 2000) return res.status(413).json({ error: 'Tek seferde en çok 2000 kayıt.' });

    const today = localDay();
    const write = db.prepare(
      `INSERT INTO pano_snapshots (day, metric, entity, value) VALUES (?, ?, ?, ?)
       ON CONFLICT(day, metric, entity) DO UPDATE SET value = excluded.value`
    );

    let yazilan = 0;
    const bilinmeyen = new Set();
    const run = db.transaction((rows) => {
      for (const row of rows) {
        const day = String(row?.day || '');
        const metric = String(row?.metric || '');
        const entity = String(row?.entity ?? '');
        const value = Number(row?.value);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
        // Gelecek tarih kabul edilmez: saati yanlış kurulmuş bir istemci
        // seriyi ileri taşıyıp grafiği kalıcı olarak bozabilirdi.
        if (day > today) continue;
        if (!isKnownMetric(metric)) {
          // Panel ayrı depo; ayrışma olursa sessiz kalmasın diye adı bildirilir.
          if (bilinmeyen.size < 10) bilinmeyen.add(metric);
          continue;
        }
        if (!isValidEntity(metric, entity)) continue;
        if (!Number.isFinite(value)) continue;
        write.run(day, metric, entity, value);
        yazilan += 1;
      }
    });
    run(items);

    res.json({ written: yazilan, skipped: items.length - yazilan, unknown: [...bilinmeyen] });
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/admin-snapshots.test.js`
Expected: Yeni POST testleri PASS. `GET` testleri hâlâ eski biçimi beklediği için 1-2 tanesi kırmızı kalabilir — Task 4 düzeltir.

- [ ] **Step 5: Commit**

```bash
git add server/routes/admin.js server/test/admin-snapshots.test.js
git commit -m "feat(admin): validate snapshots via registry with entity support"
```

---

## Task 4: GET /snapshots — entity filtresi ve gün aralığı

**Depo:** `Yedigül`

**Files:**
- Modify: `server/routes/admin.js` (`router.get('/snapshots')`)
- Test: `server/test/admin-snapshots.test.js`

**Interfaces:**
- Consumes: `isKnownMetric` (Task 2), Task 3'ün yazdığı satırlar
- Produces: `GET /admin/snapshots?metric=&entity=&from=&to=&limit=` → `{ metric, from, to, rows: Array<{day, entity, value}> }`

- [ ] **Step 1: Write the failing test**

Mevcut `'anlık görüntü yazılır ve geri okunur'` testindeki `assert.deepEqual(data.rows, [...])` bloğunu şununla değiştir (artık `entity` de dönüyor):

```js
  assert.deepEqual(data.rows, [
    { day: '2026-07-20', entity: '', value: 4100 },
    { day: '2026-07-21', entity: '', value: 4118 },
  ], 'eskiden yeniye sıralı dönmeli');
```

Yeni testler ekle:

```js
test('gün aralığıyla okunur', async () => {
  await post([
    { day: '2026-01-05', metric: 'ig.reach', value: 100 },
    { day: '2026-03-05', metric: 'ig.reach', value: 200 },
    { day: '2026-06-05', metric: 'ig.reach', value: 300 },
  ]);

  const read = await fetch(`${base}/api/admin/snapshots?metric=ig.reach&from=2026-02-01&to=2026-04-01`, { headers: h() });
  const data = await read.json();
  assert.deepEqual(data.rows.map((r) => r.day), ['2026-03-05'], 'yalnız aralıktakiler');
  assert.equal(data.from, '2026-02-01');
  assert.equal(data.to, '2026-04-01');
});

test('entity verilirse yalnız o varlık, verilmezse hepsi döner', async () => {
  await post([
    { day: '2026-07-24', metric: 'menu.price', entity: 'levrek', value: 800 },
    { day: '2026-07-24', metric: 'menu.price', entity: 'cipura', value: 700 },
  ]);
  const aralik = 'from=2026-07-24&to=2026-07-24';

  const tek = await fetch(`${base}/api/admin/snapshots?metric=menu.price&entity=levrek&${aralik}`, { headers: h() });
  assert.deepEqual((await tek.json()).rows, [{ day: '2026-07-24', entity: 'levrek', value: 800 }]);

  const hepsi = await fetch(`${base}/api/admin/snapshots?metric=menu.price&${aralik}`, { headers: h() });
  assert.equal((await hepsi.json()).rows.length, 2);
});

test('aralık verilmezse son 90 gün kullanılır', async () => {
  const eski = localDay(new Date(Date.now() - 200 * 86400000));
  const yakin = localDay(new Date(Date.now() - 5 * 86400000));
  await post([
    { day: eski, metric: 'reviews.count', value: 10 },
    { day: yakin, metric: 'reviews.count', value: 20 },
  ]);

  const read = await fetch(`${base}/api/admin/snapshots?metric=reviews.count`, { headers: h() });
  const days = (await read.json()).rows.map((r) => r.day);
  assert.ok(days.includes(yakin), '5 gün öncesi görünmeli');
  assert.equal(days.includes(eski), false, '200 gün öncesi varsayılan pencerede olmamalı');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/admin-snapshots.test.js`
Expected: FAIL — `from`/`to` yok sayılıyor, `entity` yanıtta yok.

- [ ] **Step 3: Write minimal implementation**

`router.get('/snapshots')` gövdesini şununla değiştir:

```js
  router.get('/snapshots', (req, res) => {
    const metric = String(req.query.metric || '');
    if (!isKnownMetric(metric)) return res.status(400).json({ error: 'Bilinmeyen ölçüt.' });

    const GUN = /^\d{4}-\d{2}-\d{2}$/;
    const to = GUN.test(String(req.query.to || '')) ? String(req.query.to) : localDay();
    // Aralık verilmezse son 90 gün; yıllık analiz from/to ile açıkça ister.
    const from = GUN.test(String(req.query.from || ''))
      ? String(req.query.from)
      : localDay(new Date(Date.now() - 89 * 86400000));
    const limit = Math.min(Math.max(Number(req.query.limit) || 5000, 1), 5000);

    // entity parametresi hiç verilmemişse o ölçütün TÜM varlıkları döner
    // (ör. bir günün bütün ürün fiyatları).
    const entityVerildi = req.query.entity !== undefined;
    const rows = entityVerildi
      ? db
          .prepare(
            `SELECT day, entity, value FROM pano_snapshots
             WHERE metric = ? AND entity = ? AND day BETWEEN ? AND ?
             ORDER BY day ASC LIMIT ?`
          )
          .all(metric, String(req.query.entity), from, to, limit)
      : db
          .prepare(
            `SELECT day, entity, value FROM pano_snapshots
             WHERE metric = ? AND day BETWEEN ? AND ?
             ORDER BY day ASC, entity ASC LIMIT ?`
          )
          .all(metric, from, to, limit);

    res.json({ metric, from, to, rows });
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/*.test.js`
Expected: TÜM testler PASS (86 + yeni testler).

- [ ] **Step 5: Commit**

```bash
git add server/routes/admin.js server/test/admin-snapshots.test.js
git commit -m "feat(admin): read snapshots by entity and day range"
```

---

## Task 5: Panel önbelleği — entity desteği

**Depo:** `Yediguladmin`

**Files:**
- Modify: `server/cache.js`
- Test: `server/test/snapshots.test.js` (yeni)

**Interfaces:**
- Consumes: yok
- Produces:
  - `PanoCache.snapshot(metric, value, day = localDay(), entity = '')`
  - `PanoCache.history(metric, limit = 30, entity = '')` → `[{day, value}]`
  - `PanoCache.allSnapshots(sinceDays = 90)` → `[{day, metric, entity, value}]`
  - `PanoCache.hasMetricOnDay(metric, day)` → `boolean`

- [ ] **Step 1: Write the failing test**

Create `server/test/snapshots.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PanoCache, localDay } from '../cache.js';

test('entity ile yazılan kayıtlar birbirini ezmez', () => {
  const cache = new PanoCache('');
  cache.snapshot('menu.price', 850, '2026-07-25', 'levrek');
  cache.snapshot('menu.price', 780, '2026-07-25', 'cipura');
  cache.snapshot('ig.followers', 4100, '2026-07-25');

  assert.deepEqual(cache.history('menu.price', 30, 'levrek'), [{ day: '2026-07-25', value: 850 }]);
  assert.deepEqual(cache.history('menu.price', 30, 'cipura'), [{ day: '2026-07-25', value: 780 }]);
  assert.deepEqual(cache.history('ig.followers', 30), [{ day: '2026-07-25', value: 4100 }]);
});

test('aynı gün + entity tekrar yazılırsa üzerine yazar', () => {
  const cache = new PanoCache('');
  cache.snapshot('menu.price', 850, '2026-07-25', 'levrek');
  cache.snapshot('menu.price', 900, '2026-07-25', 'levrek');
  assert.deepEqual(cache.history('menu.price', 30, 'levrek'), [{ day: '2026-07-25', value: 900 }]);
});

test('allSnapshots gönderime hazır düz liste verir', () => {
  const cache = new PanoCache('');
  const bugun = localDay();
  cache.snapshot('ig.followers', 4100, bugun);
  cache.snapshot('menu.price', 850, bugun, 'levrek');

  const items = cache.allSnapshots(90);
  assert.equal(items.length, 2);
  for (const item of items) {
    assert.deepEqual(Object.keys(item).sort(), ['day', 'entity', 'metric', 'value']);
  }
  assert.ok(items.some((i) => i.metric === 'menu.price' && i.entity === 'levrek' && i.value === 850));
  assert.ok(items.some((i) => i.metric === 'ig.followers' && i.entity === ''));
});

test('allSnapshots penceresi dışındaki günleri getirmez', () => {
  const cache = new PanoCache('');
  const eski = localDay(new Date(Date.now() - 200 * 86400000));
  cache.snapshot('ig.followers', 1, eski);
  cache.snapshot('ig.followers', 2, localDay());

  assert.equal(cache.allSnapshots(90).length, 1);
  assert.equal(cache.allSnapshots(365).length, 2);
});

test('hasMetricOnDay günlük toplamanın tekrarını engeller', () => {
  const cache = new PanoCache('');
  assert.equal(cache.hasMetricOnDay('menu.price', '2026-07-25'), false);
  cache.snapshot('menu.price', 850, '2026-07-25', 'levrek');
  assert.equal(cache.hasMetricOnDay('menu.price', '2026-07-25'), true);
  assert.equal(cache.hasMetricOnDay('menu.price', '2026-07-26'), false);
});

test('eski entity siz şema migration ile korunur', () => {
  const cache = new PanoCache('');
  cache.db.exec(`
    DROP TABLE snapshots;
    CREATE TABLE snapshots (
      day TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL,
      PRIMARY KEY (day, metric)
    );
    INSERT INTO snapshots (day, metric, value) VALUES ('2026-07-01', 'ig.followers', 4000);
  `);
  cache.migrateSnapshots();

  assert.deepEqual(cache.history('ig.followers', 30), [{ day: '2026-07-01', value: 4000 }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `cache.allSnapshots is not a function`

- [ ] **Step 3: Write minimal implementation**

`server/cache.js` içinde `snapshots` tablo tanımını şununla değiştir:

```sql
      CREATE TABLE IF NOT EXISTS snapshots (
        day    TEXT NOT NULL,
        metric TEXT NOT NULL,
        entity TEXT NOT NULL DEFAULT '',
        value  REAL NOT NULL,
        PRIMARY KEY (day, metric, entity)
      );
```

Yapıcının sonuna, mevcut `connector_cache` migration'ının yanına ekle:

```js
    this.migrateSnapshots();
```

Sonra `snapshot` ve `history` metotlarını değiştir ve yenilerini ekle:

```js
  /**
   * snapshots'a entity sütununu ekler. ALTER TABLE birincil anahtarı
   * genişletemediği için tablo kopyalanarak yeniden kurulur.
   */
  migrateSnapshots() {
    const cols = this.db.prepare('PRAGMA table_info(snapshots)').all().map((c) => c.name);
    if (cols.includes('entity')) return;
    this.db.exec(`
      CREATE TABLE snapshots_yeni (
        day    TEXT NOT NULL,
        metric TEXT NOT NULL,
        entity TEXT NOT NULL DEFAULT '',
        value  REAL NOT NULL,
        PRIMARY KEY (day, metric, entity)
      );
      INSERT INTO snapshots_yeni (day, metric, entity, value)
        SELECT day, metric, '', value FROM snapshots;
      DROP TABLE snapshots;
      ALTER TABLE snapshots_yeni RENAME TO snapshots;
    `);
  }

  /** Gün + ölçüt + varlık başına tek kayıt; tekrar yazılırsa son değer kalır. */
  snapshot(metric, value, day = localDay(), entity = '') {
    if (!Number.isFinite(value)) return;
    this.db
      .prepare(
        `INSERT INTO snapshots (day, metric, entity, value) VALUES (?, ?, ?, ?)
         ON CONFLICT(day, metric, entity) DO UPDATE SET value = excluded.value`,
      )
      .run(day, metric, entity, value);
  }

  history(metric, limit = 30, entity = '') {
    return this.db
      .prepare(
        `SELECT day, value FROM snapshots
         WHERE metric = ? AND entity = ? ORDER BY day DESC LIMIT ?`,
      )
      .all(metric, entity, limit)
      .reverse();
  }

  /** Sunucuya gönderilecek düz liste. Budama yok; pencere yalnız gönderim içindir. */
  allSnapshots(sinceDays = 90) {
    const esik = localDay(new Date(Date.now() - (sinceDays - 1) * 86400000));
    return this.db
      .prepare('SELECT day, metric, entity, value FROM snapshots WHERE day >= ? ORDER BY day ASC')
      .all(esik);
  }

  /** O güne ait kayıt var mı — günlük fiyat toplamasını bir kereye indirir. */
  hasMetricOnDay(metric, day) {
    const row = this.db
      .prepare('SELECT 1 AS v FROM snapshots WHERE metric = ? AND day = ? LIMIT 1')
      .get(metric, day);
    return Boolean(row);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — yeni 6 test dahil tüm panel testleri.

- [ ] **Step 5: Commit**

```bash
git add server/cache.js server/test/snapshots.test.js
git commit -m "feat(cache): add entity support and bulk snapshot readers"
```

---

## Task 6: Fiyat kayıtlarını üreten saf fonksiyon

**Depo:** `Yediguladmin`

**Files:**
- Create: `server/snapshots/prices.js`
- Test: `server/test/snapshots.test.js` (genişletilir)

**Interfaces:**
- Consumes: yok (saf fonksiyon)
- Produces: `priceSnapshots(menu: {products: object[]}, day: string)` → `Array<{day, metric: 'menu.price', entity, value}>`

- [ ] **Step 1: Write the failing test**

`server/test/snapshots.test.js` dosyasının en üstündeki import'lara ekle:

```js
import { priceSnapshots } from '../snapshots/prices.js';
```

Ve şu testleri ekle:

```js
test('tekil fiyatlı ürün ürün id sini entity olarak kullanır', () => {
  const menu = { products: [{ id: 'levrek', price: 850, variants: [] }] };
  assert.deepEqual(priceSnapshots(menu, '2026-07-25'), [
    { day: '2026-07-25', metric: 'menu.price', entity: 'levrek', value: 850 },
  ]);
});

test('varyantlı ürün her varyant için ayrı satır üretir', () => {
  const menu = {
    products: [{
      id: 'raki', price: null,
      variants: [{ name_tr: 'Tek', price: 250 }, { name_tr: 'Duble', price: 400 }],
    }],
  };
  assert.deepEqual(priceSnapshots(menu, '2026-07-25'), [
    { day: '2026-07-25', metric: 'menu.price', entity: 'raki-0', value: 250 },
    { day: '2026-07-25', metric: 'menu.price', entity: 'raki-1', value: 400 },
  ]);
});

test('tekil fiyat varyantlara üstün gelir; ürün iki seriye bölünmez', () => {
  const menu = {
    products: [{ id: 'levrek', price: 850, variants: [{ name_tr: 'Porsiyon', price: 850 }] }],
  };
  const items = priceSnapshots(menu, '2026-07-25');
  assert.equal(items.length, 1);
  assert.equal(items[0].entity, 'levrek');
});

test('gizli, fiyatsız ve id siz ürünler atlanır', () => {
  const menu = {
    products: [
      { id: 'gizli', price: 100, is_hidden: 1, variants: [] },
      { id: 'gunun', price: null, is_market_price: 1, variants: [] },
      { id: '', price: 100, variants: [] },
    ],
  };
  assert.deepEqual(priceSnapshots(menu, '2026-07-25'), []);
});

test('boş veya bozuk menü çökmez', () => {
  assert.deepEqual(priceSnapshots(null, '2026-07-25'), []);
  assert.deepEqual(priceSnapshots({}, '2026-07-25'), []);
  assert.deepEqual(priceSnapshots({ products: [] }, '2026-07-25'), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../snapshots/prices.js'`

- [ ] **Step 3: Write minimal implementation**

Create `server/snapshots/prices.js`:

```js
/**
 * Menü yanıtından günlük fiyat anlık görüntüleri üretir.
 *
 * Fiyat geçmişini hiçbir API vermez: canlı veritabanı yalnızca GÜNCEL fiyatı
 * tutar. Biriktirmezsek "zam yapalım mı" sorusunun dayanağı hiç oluşmaz.
 *
 * Saf fonksiyon — ağ ve veritabanı bilmez, bu yüzden tek başına test edilir.
 */
export function priceSnapshots(menu, day) {
  const items = [];
  for (const product of menu?.products || []) {
    const id = String(product?.id || '');
    if (!id) continue;
    if (product.is_hidden) continue;

    // Öncelik kesin: tekil fiyat varsa varyantlar yazılmaz, aksi hâlde aynı
    // ürün iki ayrı seriye bölünürdü.
    const price = Number(product.price);
    if (Number.isFinite(price)) {
      items.push({ day, metric: 'menu.price', entity: id, value: price });
      continue;
    }

    const variants = Array.isArray(product.variants) ? product.variants : [];
    variants.forEach((variant, index) => {
      const value = Number(variant?.price);
      // entity varyant SIRASINI taşır. Varyantlar yeniden sıralanırsa seri
      // kayar; adı kullanmak çeviriyle değiştiği için daha kırılgan olurdu.
      if (Number.isFinite(value)) {
        items.push({ day, metric: 'menu.price', entity: `${id}-${index}`, value });
      }
    });
  }
  return items;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/snapshots/prices.js server/test/snapshots.test.js
git commit -m "feat(snapshots): derive daily price snapshots from menu"
```

---

## Task 7: Uzak sunucuya yazma — remoteClient.write

**Depo:** `Yediguladmin`

**Files:**
- Modify: `server/remote-client.js`
- Test: `server/test/snapshots.test.js` (genişletilir)

**Interfaces:**
- Consumes: yok
- Produces: `RemoteClient.write(path: string, body: object, token: string)` → çözümlenen JSON; hata durumunda `Error` (`.status` alanlı)

- [ ] **Step 1: Write the failing test**

`server/test/snapshots.test.js` import'larına ekle:

```js
import { RemoteClient } from '../remote-client.js';
import { loadConfig } from '../config.js';
```

Testler:

```js
const cfg = loadConfig({ SSH_ENABLED: '0' });

test('write gövdeyi JSON olarak POST eder ve token taşır', async () => {
  let gorulen = null;
  const client = new RemoteClient(cfg, async (url, options) => {
    gorulen = { url, options };
    return new Response(JSON.stringify({ written: 2, skipped: 0, unknown: [] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  });

  const sonuc = await client.write('/snapshots', { items: [{ day: '2026-07-25' }] }, 'tok');
  assert.deepEqual(sonuc, { written: 2, skipped: 0, unknown: [] });
  assert.equal(gorulen.options.method, 'POST');
  assert.equal(gorulen.options.headers.authorization, 'Bearer tok');
  assert.equal(gorulen.options.headers['content-type'], 'application/json');
  assert.ok(gorulen.url.endsWith('/snapshots'));
  assert.deepEqual(JSON.parse(gorulen.options.body), { items: [{ day: '2026-07-25' }] });
});

test('write hata durumunda sunucunun mesajını taşıyan hata fırlatır', async () => {
  const client = new RemoteClient(cfg, async () =>
    new Response(JSON.stringify({ error: 'Tek seferde en çok 2000 kayıt.' }), {
      status: 413, headers: { 'content-type': 'application/json' },
    }));

  await assert.rejects(() => client.write('/snapshots', { items: [] }, 'tok'), (error) => {
    assert.equal(error.status, 413);
    assert.match(error.message, /2000/);
    return true;
  });
});

test('write ağ hatasında 503 ile anlaşılır mesaj verir', async () => {
  const client = new RemoteClient(cfg, async () => { throw new Error('ECONNREFUSED'); });
  await assert.rejects(() => client.write('/snapshots', {}, 'tok'), (error) => {
    assert.equal(error.status, 503);
    return true;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `client.write is not a function`

- [ ] **Step 3: Write minimal implementation**

`server/remote-client.js` içinde `read` metodunun hemen altına ekle:

```js
  /**
   * Yönetim API'sine JSON yazar. read()'in POST kardeşi — konektörlerin ve
   * senkronun elinde bir Express isteği yok, o yüzden proxy() kullanılamaz.
   */
  async write(path, body, token) {
    const url = joinUrl(this.config.remoteAdminBaseUrl, `${this.config.remoteAdminPath}${path}`);
    let response;
    try {
      response = await this.fetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        redirect: 'manual',
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      throw Object.assign(
        new Error('Sunucudaki özel admin servisi yanıt vermiyor.'),
        { status: 503, cause: error },
      );
    }
    if (!response.ok) {
      throw Object.assign(new Error(await parseError(response)), { status: response.status });
    }
    return response.json();
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/remote-client.js server/test/snapshots.test.js
git commit -m "feat(remote-client): add write() for posting JSON upstream"
```

---

## Task 8: Senkron mantığı — topla, it, çek

**Depo:** `Yediguladmin`

**Files:**
- Create: `server/snapshots/sync.js`
- Test: `server/test/snapshots.test.js` (genişletilir)

**Interfaces:**
- Consumes: `priceSnapshots` (Task 6), `RemoteClient.write` (Task 7), `PanoCache.allSnapshots`/`hasMetricOnDay`/`snapshot` (Task 5)
- Produces:
  - `PULL_METRICS: string[]`
  - `collectPrices({ remoteClient, remoteToken, cache, force })` → `Promise<number>` (yazılan kayıt sayısı)
  - `pushSnapshots({ remoteClient, remoteToken, cache, sinceDays })` → `Promise<{written, skipped, unknown}>`
  - `pullSnapshots({ remoteClient, remoteToken, cache })` → `Promise<number>`
  - `syncInBackground(ctx)` → `void` (beklenmez, hata yutulur)

- [ ] **Step 1: Write the failing test**

`server/test/snapshots.test.js` import'larına ekle:

```js
import { collectPrices, pullSnapshots, pushSnapshots, PULL_METRICS } from '../snapshots/sync.js';
```

Testler:

```js
/** remoteClient taklidi: read ve write çağrılarını kaydeder. */
function sahteIstemci({ menu = { products: [] }, rows = [], writeSonuc = { written: 0, skipped: 0, unknown: [] } } = {}) {
  const cagrilar = { read: [], write: [] };
  return {
    cagrilar,
    async read(path) {
      cagrilar.read.push(path);
      if (path === '/menu') return menu;
      return { rows };
    },
    async write(path, body) {
      cagrilar.write.push({ path, body });
      return writeSonuc;
    },
  };
}

test('collectPrices menüyü çeker ve fiyatları yerele yazar', async () => {
  const cache = new PanoCache('');
  const client = sahteIstemci({ menu: { products: [{ id: 'levrek', price: 850, variants: [] }] } });

  const yazilan = await collectPrices({ remoteClient: client, remoteToken: 't', cache });
  assert.equal(yazilan, 1);
  assert.deepEqual(cache.history('menu.price', 30, 'levrek'), [{ day: localDay(), value: 850 }]);
  assert.deepEqual(client.cagrilar.read, ['/menu']);
});

test('collectPrices aynı gün ikinci kez menüyü çekmez', async () => {
  const cache = new PanoCache('');
  const client = sahteIstemci({ menu: { products: [{ id: 'levrek', price: 850, variants: [] }] } });

  await collectPrices({ remoteClient: client, remoteToken: 't', cache });
  const ikinci = await collectPrices({ remoteClient: client, remoteToken: 't', cache });

  assert.equal(ikinci, 0);
  assert.equal(client.cagrilar.read.length, 1, 'menü günde bir kez çekilmeli');
});

test('collectPrices force ile her zaman taze çeker', async () => {
  const cache = new PanoCache('');
  const client = sahteIstemci({ menu: { products: [{ id: 'levrek', price: 900, variants: [] }] } });

  await collectPrices({ remoteClient: client, remoteToken: 't', cache });
  await collectPrices({ remoteClient: client, remoteToken: 't', cache, force: true });

  assert.equal(client.cagrilar.read.length, 2);
  assert.deepEqual(cache.history('menu.price', 30, 'levrek'), [{ day: localDay(), value: 900 }]);
});

test('pushSnapshots yereldeki kayıtları tek çağrıda gönderir', async () => {
  const cache = new PanoCache('');
  cache.snapshot('ig.followers', 4100, localDay());
  cache.snapshot('menu.price', 850, localDay(), 'levrek');
  const client = sahteIstemci({ writeSonuc: { written: 2, skipped: 0, unknown: [] } });

  const sonuc = await pushSnapshots({ remoteClient: client, remoteToken: 't', cache });
  assert.equal(sonuc.written, 2);
  assert.equal(client.cagrilar.write.length, 1, 'tek POST');
  assert.equal(client.cagrilar.write[0].path, '/snapshots');
  assert.equal(client.cagrilar.write[0].body.items.length, 2);
});

test('pushSnapshots gönderecek bir şey yoksa ağa çıkmaz', async () => {
  const client = sahteIstemci();
  const sonuc = await pushSnapshots({ remoteClient: client, remoteToken: 't', cache: new PanoCache('') });
  assert.equal(sonuc.written, 0);
  assert.equal(client.cagrilar.write.length, 0);
});

test('pullSnapshots sunucudaki günleri yerele yazar', async () => {
  const cache = new PanoCache('');
  const client = sahteIstemci({ rows: [{ day: '2026-07-20', entity: '', value: 4000 }] });

  const cekilen = await pullSnapshots({ remoteClient: client, remoteToken: 't', cache });
  assert.equal(cekilen, PULL_METRICS.length, 'her ölçüt için bir satır çekildi');
  assert.deepEqual(cache.history('ig.followers', 30), [{ day: '2026-07-20', value: 4000 }]);
  assert.equal(client.cagrilar.read.length, PULL_METRICS.length);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../snapshots/sync.js'`

- [ ] **Step 3: Write minimal implementation**

Create `server/snapshots/sync.js`:

```js
import { localDay } from '../cache.js';
import { priceSnapshots } from './prices.js';

/**
 * Sunucudan geri çekilecek ölçütler.
 *
 * Sunucu doğrulamanın otoritesidir (ayrı depo, kayıt paylaşılamaz); bu liste
 * yalnızca "neyi çekelim" sorusunu yanıtlar. Sunucunun tanımadığı bir ad
 * buraya girerse GET 400 döner ve senkron hata verir — sessiz kalmaz.
 */
export const PULL_METRICS = ['ig.followers', 'ig.reach', 'reviews.rating', 'reviews.count', 'menu.price'];

/**
 * Güncel menüyü çekip ürün fiyatlarını yerele yazar.
 *
 * Ölçüt günlük çözünürlükte olduğu için menü günde bir kez çekilir; panel her
 * açıldığında tünelden menü indirmek boşuna trafik olurdu. force, kullanıcı
 * fiyat değiştirip hemen senkrona bastığında gerekir.
 */
export async function collectPrices({ remoteClient, remoteToken, cache, force = false }) {
  const day = localDay();
  if (!force && cache.hasMetricOnDay('menu.price', day)) return 0;

  const menu = await remoteClient.read('/menu', remoteToken);
  const items = priceSnapshots(menu, day);
  for (const item of items) cache.snapshot(item.metric, item.value, item.day, item.entity);
  return items.length;
}

/** Yereldeki birikimi tek çağrıda sunucuya iter. Upsert olduğu için tekrar zararsız. */
export async function pushSnapshots({ remoteClient, remoteToken, cache, sinceDays = 90 }) {
  const items = cache.allSnapshots(sinceDays);
  if (!items.length) return { written: 0, skipped: 0, unknown: [] };

  const sonuc = await remoteClient.write('/snapshots', { items }, remoteToken);
  if (sonuc?.unknown?.length) {
    // Panel ve sunucu ayrı depolarda; ölçüt adları ayrışırsa burada görünür.
    console.warn('[snapshot] sunucu bilinmeyen ölçüt bildirdi:', sonuc.unknown.join(', '));
  }
  return sonuc;
}

/** Sunucudaki geçmişi yerele indirir — iki bilgisayarın günleri burada birleşir. */
export async function pullSnapshots({ remoteClient, remoteToken, cache }) {
  let cekilen = 0;
  for (const metric of PULL_METRICS) {
    const data = await remoteClient.read(`/snapshots?metric=${encodeURIComponent(metric)}`, remoteToken);
    for (const row of data?.rows || []) {
      cache.snapshot(metric, Number(row.value), String(row.day), String(row.entity ?? ''));
      cekilen += 1;
    }
  }
  return cekilen;
}

/**
 * Pano açılışındaki otomatik senkron. Ateşle-unut: yanıt BEKLENMEZ.
 *
 * Altı kaynaklı panoda senkron gecikmesi panoyu geciktirmemeli; hata da
 * panoyu karartmamalı. Upsert olduğu için bir tur kaçan senkron kendini
 * sonraki açılışta düzeltir.
 */
export function syncInBackground(ctx) {
  (async () => {
    await collectPrices(ctx);
    await pushSnapshots(ctx);
  })().catch((error) => {
    console.warn('[snapshot] arka plan senkronu başarısız:', error.message);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/snapshots/sync.js server/test/snapshots.test.js
git commit -m "feat(snapshots): add collect, push and pull sync logic"
```

---

## Task 9: Panel ucu — otomatik push ve /panel/sync

**Depo:** `Yediguladmin`

**Files:**
- Modify: `server/app.js` (import'lar, `/local-api/panel` handler ~satır 118-132, yeni rota)
- Test: `server/test/snapshots.test.js` (genişletilir)

**Interfaces:**
- Consumes: `syncInBackground`, `collectPrices`, `pushSnapshots`, `pullSnapshots` (Task 8)
- Produces: `POST /local-api/panel/sync` → `{ collected: number, pushed: number, pulled: number }`

- [ ] **Step 1: Write the failing test**

`server/test/snapshots.test.js` import'larına ekle:

```js
import { createApp } from '../app.js';
```

Testler:

```js
/** Oturum açmış bir panel uygulaması kurar; çerez ve CSRF anahtarını döndürür. */
async function panelKur({ remoteClient, cache }) {
  const tunnel = { status: () => ({ state: 'off' }), start: async () => {}, stop: async () => {} };
  const app = createApp({ config: cfg, tunnel, cache, remoteClient, connectors: [] });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const boot = await fetch(`${base}/local-api/bootstrap`);
  const cookie = boot.headers.get('set-cookie').split(';')[0];
  const { csrf } = await boot.json();
  await fetch(`${base}/local-api/session/login`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': csrf, origin: base },
    body: JSON.stringify({ password: 'test-panel' }),
  });
  return { base, cookie, csrf, close: () => server.close() };
}

test('panel/sync toplar, iter ve çeker', async () => {
  const cache = new PanoCache('');
  const client = sahteIstemci({
    menu: { products: [{ id: 'levrek', price: 850, variants: [] }] },
    rows: [{ day: '2026-07-20', entity: '', value: 4000 }],
    writeSonuc: { written: 1, skipped: 0, unknown: [] },
  });
  client.login = async () => 'uzak-token';

  const panel = await panelKur({ remoteClient: client, cache });
  const res = await fetch(`${panel.base}/local-api/panel/sync`, {
    method: 'POST',
    headers: { cookie: panel.cookie, 'x-csrf-token': panel.csrf, origin: panel.base },
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.collected, 1);
  assert.equal(body.pulled, PULL_METRICS.length);
  assert.ok(client.cagrilar.write.length >= 1);
  panel.close();
});

test('panel/sync oturumsuz 401 döner', async () => {
  const client = sahteIstemci();
  const tunnel = { status: () => ({ state: 'off' }), start: async () => {}, stop: async () => {} };
  const app = createApp({ config: cfg, tunnel, cache: new PanoCache(''), remoteClient: client, connectors: [] });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const boot = await fetch(`${base}/local-api/bootstrap`);
  const cookie = boot.headers.get('set-cookie').split(';')[0];
  const { csrf } = await boot.json();

  const res = await fetch(`${base}/local-api/panel/sync`, {
    method: 'POST',
    headers: { cookie, 'x-csrf-token': csrf, origin: base },
  });
  assert.equal(res.status, 401);
  server.close();
});

test('arka plan senkronu düşse bile pano yanıtı 200 kalır', async () => {
  const client = sahteIstemci();
  client.login = async () => 'uzak-token';
  client.read = async () => { throw new Error('tünel düştü'); };
  client.write = async () => { throw new Error('tünel düştü'); };

  const panel = await panelKur({ remoteClient: client, cache: new PanoCache('') });
  const res = await fetch(`${panel.base}/local-api/panel`, { headers: { cookie: panel.cookie } });

  assert.equal(res.status, 200, 'senkron hatası panoyu karartmamalı');
  assert.ok(Array.isArray((await res.json()).panels));
  panel.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `/local-api/panel/sync` için 404.

- [ ] **Step 3: Write minimal implementation**

`server/app.js` import'larına ekle:

```js
import { collectPrices, pullSnapshots, pushSnapshots, syncInBackground } from './snapshots/sync.js';
```

`/local-api/panel` handler'ında `res.json({...})` çağrısından **önce** ekle:

```js
    // Anlık görüntüleri arka planda sunucuya it. Yanıt beklenmez: senkron
    // panoyu geciktirmemeli, hatası da panoyu karartmamalı.
    if (session.remoteToken && cache) {
      syncInBackground({ remoteClient, remoteToken: session.remoteToken, cache });
    }
```

Ve `/local-api/tunnel/connect` rotasının hemen üstüne yeni rotayı ekle:

```js
  // Elle senkron: kullanıcı bastığında hem taze fiyat toplanır hem sunucuyla
  // iki yönlü eşitlenir. Arka plan senkronunun aksine hata GİZLENMEZ —
  // kullanıcı bir düğmeye bastıysa sonucunu görmeli.
  app.post('/local-api/panel/sync', csrf, async (req, res) => {
    const session = req.localSession;
    if (!session.remoteToken) return res.status(401).json({ error: 'Yönetim oturumu gerekli.' });
    if (!cache) return res.status(503).json({ error: 'Pano önbelleği kapalı.' });

    const ctx = { remoteClient, remoteToken: session.remoteToken, cache };
    try {
      const collected = await collectPrices({ ...ctx, force: true });
      const pushed = await pushSnapshots(ctx);
      const pulled = await pullSnapshots(ctx);
      res.json({ collected, pushed: pushed.written ?? 0, pulled });
    } catch (error) {
      res.status(errorStatus(error, 502)).json({ error: error.message });
    }
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — tüm panel testleri.

- [ ] **Step 5: Commit**

```bash
git add server/app.js server/test/snapshots.test.js
git commit -m "feat(app): auto-push snapshots and add manual sync endpoint"
```

---

## Task 10: "Sunucuyla eşitle" düğmesi

**Depo:** `Yediguladmin`

**Files:**
- Modify: `src/views/Pano.jsx` (`page-heading` bloğu, ~satır 30-33)
- Modify: `src/App.jsx` (satır 101 — `<Pano ... />`)

**Interfaces:**
- Consumes: `POST /local-api/panel/sync` (Task 9), `api.post` (mevcut)
- Produces: yok (arayüz uç noktası)

- [ ] **Step 1: Düğmeyi ekle**

`src/views/Pano.jsx` en üstteki import'lara ekle:

```js
import { useState } from 'react';
import { api } from '../lib/api.js';
```

Bileşen imzasını değiştir:

```js
export default function Pano({ menu, panel, onSynced }) {
```

Fonksiyon gövdesinin başına, `const panels = ...` satırından hemen sonra ekle:

```js
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');

  async function esitle() {
    setSyncing(true);
    setSyncError('');
    try {
      await api.post('/panel/sync');
      await onSynced?.();
    } catch (error) {
      // Elle basılan işlem: arka plan senkronunun aksine hata gizlenmez.
      setSyncError(error.message);
    } finally {
      setSyncing(false);
    }
  }
```

`page-heading` bloğunu şununla değiştir:

```jsx
      <header className="page-heading">
        <div><span className="eyebrow">CANLI VERİTABANI</span><h1>Pano</h1></div>
        <div className="page-heading-actions">
          {syncError && <span className="form-error">{syncError}</span>}
          <button type="button" className="ghost-button" onClick={esitle} disabled={syncing}>
            {syncing ? 'Eşitleniyor…' : 'Sunucuyla eşitle'}
          </button>
          <span className="live-badge"><i /> {panel ? clock(panel.generatedAt) : 'Bağlı'}</span>
        </div>
      </header>
```

- [ ] **Step 2: Pano'ya tazeleme geri çağrısını bağla**

`src/App.jsx` satır 101'i şununla değiştir:

```jsx
    pano: <Pano menu={menu} panel={panel} onSynced={reloadPanel} />,
```

- [ ] **Step 3: Stil ekle**

`src/styles.css` dosyasının sonuna ekle:

```css
.page-heading-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
```

- [ ] **Step 4: Lint ve derlemeyi doğrula**

Run: `npm run lint && npm run build`
Expected: Uyarı yok, derleme başarılı.

- [ ] **Step 5: Uygulamayı çalıştırıp düğmeyi gör**

Run: `npm run dev`
Beklenen: `http://127.0.0.1:4310` → Pano ekranında sağ üstte "Sunucuyla eşitle" düğmesi. Bağlıyken basıldığında kısa süre "Eşitleniyor…" yazar, ardından pano tazelenir. Bağlı değilken hata mesajı görünür.

- [ ] **Step 6: Commit**

```bash
git add src/views/Pano.jsx src/App.jsx src/styles.css
git commit -m "feat(ui): add server sync button to dashboard"
```

---

## Task 11: Uçtan uca doğrulama

**Depo:** her ikisi

**Files:** yok (yalnız doğrulama)

**Interfaces:**
- Consumes: Task 1-10'un tamamı

- [ ] **Step 1: Sunucu test paketini çalıştır**

Run: `cd C:/Users/kanad/Desktop/Projeler/Yedigül/server && node --test test/*.test.js`
Expected: Tüm testler PASS (86 mevcut + Task 1-4'ün eklediği ~12 test), `fail 0`.

- [ ] **Step 2: Panel test paketini çalıştır**

Run: `cd C:/Users/kanad/Desktop/Projeler/Yediguladmin && npm test`
Expected: Tüm testler PASS, `fail 0`.

- [ ] **Step 3: Panel lint'ini çalıştır**

Run: `cd C:/Users/kanad/Desktop/Projeler/Yediguladmin && npm run lint`
Expected: Uyarı yok.

- [ ] **Step 4: Sahte uzak sunucuyla elle doğrula**

İki ayrı terminalde:

```bash
# 1. terminal — sahte canlı sunucu
cd C:/Users/kanad/Desktop/Projeler/Yediguladmin
node server/test/fixtures/mock-remote.js

# 2. terminal — panel
cd C:/Users/kanad/Desktop/Projeler/Yediguladmin
npm run dev
```

`http://127.0.0.1:4310` → şifre `test-panel` ile gir → Pano → "Sunucuyla eşitle".

Beklenen: düğme hatasız tamamlanır. Sahte sunucu `/api/admin/menu` isteğini loglar. Yerel `pano.db` dosyasında `menu.price` kaydı oluşur:

```bash
node --disable-warning=ExperimentalWarning -e "
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync(process.env.PANO_DB_PATH||'./data/pano.db');
console.log(db.prepare('SELECT day,metric,entity,value FROM snapshots WHERE metric=?').all('menu.price'));
"
```

Beklenen çıktı: `levrek` için bir satır, değer `850`.

> Not: sahte sunucuda `/api/admin/snapshots` ucu yok, bu yüzden push adımı 502 verir ve arka planda loglanır — bu beklenen davranıştır. Gerçek Yedigül sunucusuna karşı çalışırken push da başarılı olur.

- [ ] **Step 5: Yedigül değişikliklerini gözden geçirip commit'le**

Yedigül deposunda Task 1-4 zaten commit'lendi. Çalışma ağacının temiz olduğunu doğrula:

```bash
cd C:/Users/kanad/Desktop/Projeler/Yedigül && git status --short
```

Expected: `server/db.js`, `server/routes/admin.js`, `server/snapshot-metrics.js`, `server/test/*` için bekleyen değişiklik yok.
