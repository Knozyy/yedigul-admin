import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Pano önbelleği. better-sqlite3 yerine Node'un yerleşik node:sqlite'ı
 * kullanılır: Windows'ta derleyici (Visual Studio Build Tools) gerektirmez,
 * bağımlılık eklemez.
 *
 * İki iş yapar:
 *  1. Konektör yanıtlarını saklar — kota tüketmemek ve bir kaynak düştüğünde
 *     son bilinen veriyi gösterebilmek için.
 *  2. Günlük anlık görüntü biriktirir — Instagram takipçi sayısı ve Google
 *     puanı gibi API'nin yalnızca "şu an"ını verdiği ölçütlerin trendini
 *     ancak kendimiz biriktirirsek çizebiliriz.
 */
export class PanoCache {
  constructor(dbPath = '') {
    if (dbPath) mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath || ':memory:');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS connector_cache (
        id         TEXT PRIMARY KEY,
        payload    TEXT NOT NULL,
        fetched_at INTEGER NOT NULL,
        version    INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS snapshots (
        day    TEXT NOT NULL,
        metric TEXT NOT NULL,
        entity TEXT NOT NULL DEFAULT '',
        value  REAL NOT NULL,
        PRIMARY KEY (day, metric, entity)
      );
      -- Yenilenen erişim anahtarları. .env'deki değer YALNIZCA tohumdur;
      -- Instagram uzun ömürlü token'ı 60 günde bir yenilenip yerine yenisi
      -- konur ve .env'e dokunulamayacağı için güncel değer burada yaşar.
      CREATE TABLE IF NOT EXISTS tokens (
        name         TEXT PRIMARY KEY,
        value        TEXT NOT NULL,
        expires_at   INTEGER,
        refreshed_at INTEGER NOT NULL
      );
    `);
    // CREATE TABLE IF NOT EXISTS mevcut tabloyu değiştirmez; eski pano.db
    // dosyalarına eksik sütunu veri kaybı olmadan ekle (Yedigül'deki desen).
    const columns = this.db.prepare('PRAGMA table_info(connector_cache)').all().map((c) => c.name);
    if (!columns.includes('version')) {
      this.db.exec('ALTER TABLE connector_cache ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
    }
    this.migrateSnapshots();
  }

  /**
   * snapshots'a entity sütununu ekler. ALTER TABLE birincil anahtarı
   * genişletemediği için tablo kopyalanarak yeniden kurulur — bu verinin
   * geri getirilme yolu yok, DROP ile atılamaz.
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

  /**
   * version uyuşmazsa önbellek yok sayılır. Konektörün ürettiği verinin
   * şekli değiştiğinde (ör. yeni alan eklendiğinde) eski kayıt TTL dolana
   * kadar servis edilmeye devam ederdi; sürüm damgası bunu engeller.
   */
  read(id, version = 1) {
    const row = this.db
      .prepare('SELECT payload, fetched_at, version FROM connector_cache WHERE id = ?')
      .get(id);
    if (!row || row.version !== version) return null;
    try {
      return { data: JSON.parse(row.payload), fetchedAt: row.fetched_at };
    } catch {
      return null;
    }
  }

  write(id, data, fetchedAt = Date.now(), version = 1) {
    this.db
      .prepare(
        `INSERT INTO connector_cache (id, payload, fetched_at, version) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           payload = excluded.payload, fetched_at = excluded.fetched_at, version = excluded.version`,
      )
      .run(id, JSON.stringify(data), fetchedAt, version);
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

  getToken(name) {
    return this.db.prepare('SELECT value, expires_at, refreshed_at FROM tokens WHERE name = ?').get(name) || null;
  }

  setToken(name, value, expiresAt = null, refreshedAt = Date.now()) {
    this.db
      .prepare(
        `INSERT INTO tokens (name, value, expires_at, refreshed_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           value = excluded.value, expires_at = excluded.expires_at, refreshed_at = excluded.refreshed_at`,
      )
      .run(name, value, expiresAt, refreshedAt);
  }

  history(metric, limit = 30, entity = '') {
    return this.db
      .prepare(
        `SELECT day, value FROM snapshots
         WHERE metric = ? AND entity = ? ORDER BY day DESC LIMIT ?`,
      )
      .all(metric, entity, limit)
      .reverse()
      // node:sqlite null-prototype nesne döner; tüketiciler düz nesne bekler.
      .map((row) => ({ ...row }));
  }

  /** Sunucuya gönderilecek düz liste. Budama yok; pencere yalnız gönderim içindir. */
  allSnapshots(sinceDays = 90) {
    const esik = localDay(new Date(Date.now() - (sinceDays - 1) * 86400000));
    return this.db
      .prepare('SELECT day, metric, entity, value FROM snapshots WHERE day >= ? ORDER BY day ASC')
      .all(esik)
      .map((row) => ({ ...row }));
  }

  /** O güne ait kayıt var mı — günlük fiyat toplamasını bir kereye indirir. */
  hasMetricOnDay(metric, day) {
    const row = this.db
      .prepare('SELECT 1 AS v FROM snapshots WHERE metric = ? AND day = ? LIMIT 1')
      .get(metric, day);
    return Boolean(row);
  }

  close() {
    this.db.close();
  }
}

/** Sunucunun yerel gününe göre YYYY-MM-DD (Yedigül backend'iyle aynı mantık). */
export function localDay(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
