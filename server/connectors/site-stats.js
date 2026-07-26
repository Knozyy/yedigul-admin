import { fillDays, weekdayDelta } from '../../shared/rhythm.js';
import { Unconfigured } from './runner.js';

/**
 * Yedigül'ün kendi sayaçları. Dış hesap gerektirmeyen tek gerçek veri
 * kaynağı; pano ilk günden bununla dolu görünür.
 *
 * /api/admin/stats zaten 30 günlük days[] serisini döndürüyor — Yediguladmin
 * bu serinin yalnızca üç toplamını basıyordu, seri kullanılmıyordu.
 */
export const siteStats = {
  id: 'site-stats',
  label: 'Site hareketliliği',
  ttlMs: 2 * 60 * 1000,
  // Üretilen verinin şekli değiştiğinde artır (bkz. cache.read).
  version: 2,

  guard({ remoteToken }) {
    if (!remoteToken) {
      throw new Unconfigured('Yönetim girişi gerekli.', 'Panoya giriş yapın.');
    }
  },

  async load({ remoteClient, remoteToken }) {
    const [stats, history] = await Promise.all([
      remoteClient.read('/stats', remoteToken),
      remoteClient.read('/history?limit=8', remoteToken).catch(() => ({ entries: [] })),
    ]);

    // Pencerenin sonunu sunucunun kendi "bugün"ü belirler; panonun çalıştığı
    // PC farklı saat diliminde olabilir, istemci saatine güvenilmez.
    const endDay = stats?.today?.day;
    if (!endDay) throw new Error('Uzak sunucu geçerli istatistik döndürmedi.');

    const days = fillDays(stats.days || [], endDay, 30);

    // stats.today otoritedir: days[] yalnızca olay olan günleri içerdiği için
    // bugünün satırı henüz yazılmamış olabilir. Seriden okursak bugünü sıfır
    // görürüz. Doldurulmuş serinin son gününü uzak sunucunun kendi
    // "bugün" değeriyle hizalıyoruz.
    const todayRow = days[days.length - 1];
    todayRow.menu_view = Number(stats.today.menu_view) || todayRow.menu_view;
    todayRow.qr_scan = Number(stats.today.qr_scan) || todayRow.qr_scan;

    const totals = days.reduce(
      (acc, d) => ({ menu_view: acc.menu_view + d.menu_view, qr_scan: acc.qr_scan + d.qr_scan }),
      { menu_view: 0, qr_scan: 0 },
    );

    const today = todayRow;
    const remote = Math.max(today.menu_view - today.qr_scan, 0);

    return {
      endDay,
      days,
      today: {
        menu_view: today.menu_view,
        qr_scan: today.qr_scan,
        remote,
        qrShare: today.menu_view ? today.qr_scan / today.menu_view : 0,
      },
      week: stats.week || null,
      month: stats.month || null,
      totals,
      delta: weekdayDelta(days, 'menu_view'),
      history: Array.isArray(history?.entries) ? history.entries.slice(0, 8) : [],
    };
  },

  onLoad(data, { cache }) {
    // Günlük anlık görüntü: ileride "aylar arası" karşılaştırma için,
    // 30 günlük pencere kaydıkça veri kaybolmasın diye.
    cache?.snapshot('site.menu_view', data.today.menu_view, data.endDay);
    cache?.snapshot('site.qr_scan', data.today.qr_scan, data.endDay);
  },
};
