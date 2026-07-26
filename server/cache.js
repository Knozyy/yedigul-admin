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
        value  REAL NOT NULL,
        PRIMARY KEY (day, metric)
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

  /** Gün başına tek kayıt; aynı gün tekrar yazılırsa son değer kalır. */
  snapshot(metric, value, day = localDay()) {
    if (!Number.isFinite(value)) return;
    this.db
      .prepare(
        `INSERT INTO snapshots (day, metric, value) VALUES (?, ?, ?)
         ON CONFLICT(day, metric) DO UPDATE SET value = excluded.value`,
      )
      .run(day, metric, value);
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

  history(metric, limit = 30) {
    return this.db
      .prepare('SELECT day, value FROM snapshots WHERE metric = ? ORDER BY day DESC LIMIT ?')
      .all(metric, limit)
      .reverse();
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
