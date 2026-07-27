/**
 * Hafta ritmi hesapları — saf fonksiyonlar, hem sunucuda hem arayüzde
 * hem de testte aynen kullanılır.
 *
 * DİKKAT: Yedigül backend'i stats_daily'yi yalnızca olay olan günler için
 * yazar (`INSERT ... ON CONFLICT DO UPDATE`), yani hiç ziyaret almayan gün
 * dizide HİÇ YOKTUR. Ham diziyi doğrudan takvime dizersek günler kayar ve
 * salı verisi cuma sütununda görünür. fillDays() bu boşlukları sıfırla
 * doldurup 30 günü garanti eder.
 */

export const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const WEEKDAYS_LONG = [
  'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi', 'pazar',
];
export const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export function parseDay(iso) {
  return new Date(`${iso}T00:00:00`);
}

export function toIso(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function shiftDay(iso, delta) {
  const date = parseDay(iso);
  date.setDate(date.getDate() + delta);
  return toIso(date);
}

/** Pazartesi = 0 … Pazar = 6 (JS'in pazar=0 düzeninden çevrilir). */
export function weekdayIndex(iso) {
  return (parseDay(iso).getDay() + 6) % 7;
}

export function isWeekend(iso) {
  return weekdayIndex(iso) > 4;
}

/**
 * Seyrek gelen diziyi, endDay ile biten tam `count` günlük diziye çevirir.
 * Eksik günler sıfırlanır.
 */
export function fillDays(days = [], endDay, count = 30) {
  const byDay = new Map(days.map((entry) => [entry.day, entry]));
  const filled = [];
  for (let i = count - 1; i >= 0; i--) {
    const day = shiftDay(endDay, -i);
    const found = byDay.get(day);
    filled.push({
      day,
      menu_view: Number(found?.menu_view) || 0,
      qr_scan: Number(found?.qr_scan) || 0,
    });
  }
  return filled;
}

/**
 * Doldurulmuş diziyi pazartesi başlangıçlı haftalık satırlara böler.
 * Baştaki ve sondaki eksik hücreler null'dır.
 */
export function toWeekGrid(filled) {
  if (!filled.length) return [];
  const lead = weekdayIndex(filled[0].day);
  const slots = [...Array(lead).fill(null), ...filled];
  while (slots.length % 7) slots.push(null);

  const rows = [];
  for (let i = 0; i < slots.length; i += 7) rows.push(slots.slice(i, i + 7));
  return rows;
}

/**
 * Yoğunluk ölçeği (0 = veri yok, 1-5 = kademe).
 *
 * Neden en yüksek değere oranlamıyoruz: hafta sonu hafta içinin 2-3 katı
 * olduğu için ölçeğin tepesini hep hafta sonu belirler ve bütün hafta içi
 * günleri tek bir görünmez tona ezilir — tam da bu ızgaranın çözmesi
 * gereken sorun. Onun yerine değerler kendi dağılımına göre beşe bölünür
 * (quantile): her kademeye yakın sayıda gün düşer, hafta içi günler
 * birbirinden ayrışır, hafta sonu yine en üst kademelerde kalır.
 */
export function makeIntensity(values) {
  const positive = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (!positive.length) return () => 0;

  const at = (p) => positive[Math.min(positive.length - 1, Math.floor(p * positive.length))];
  const breaks = [at(0.2), at(0.4), at(0.6), at(0.8)];

  return (value) => {
    if (value <= 0) return 0;
    let level = 1;
    for (const threshold of breaks) if (value > threshold) level += 1;
    return level;
  };
}

/**
 * Panonun asıl sorusu: "bu cumartesi geçen cumartesiye göre nasıl?"
 * Dünle değil, bir hafta öncesinin AYNI günüyle karşılaştırır.
 */
export function weekdayDelta(filled, metric = 'menu_view') {
  if (filled.length < 8) return null;
  const current = filled[filled.length - 1];
  const previous = filled[filled.length - 8];
  if (!previous || previous[metric] === 0) return null;
  const change = (current[metric] - previous[metric]) / previous[metric];
  return {
    day: current.day,
    weekday: WEEKDAYS[weekdayIndex(current.day)],
    weekdayLong: WEEKDAYS_LONG[weekdayIndex(current.day)],
    current: current[metric],
    previous: previous[metric],
    percent: Math.round(change * 100),
    direction: change === 0 ? 'flat' : change > 0 ? 'up' : 'down',
  };
}

export function formatDayLabel(iso) {
  const date = parseDay(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/**
 * Seriyi haftanın gününe göre yediye böler. Her grup kendi içinde tarih
 * sırasında kalır — "bu cumartesi geçen cumartesiye göre" sorusu bu diziden
 * okunur.
 */
export function groupByWeekday(days = []) {
  const groups = WEEKDAYS.map((label, index) => ({ index, label, days: [] }));
  for (const entry of days) {
    if (!entry?.day) continue;
    groups[weekdayIndex(entry.day)].days.push(entry);
  }
  return groups;
}

/**
 * Gün başına değişim: o günün aralıktaki SON İKİ tekrarı karşılaştırılır.
 *
 * weekdayDelta()'dan farkı, bunun serinin son gününe değil her günün kendi
 * geçmişine bakması. İkisi de duruyor: kahraman satırı öbürünü kullanıyor.
 *
 * Tek tekrar varsa ya da önceki sıfırsa null — sonsuz yüzde üretilmez.
 */
export function weekdayDeltas(days = [], metric = 'menu_view') {
  return groupByWeekday(days).map((group) => {
    const seri = group.days;
    const current = seri[seri.length - 1] || null;
    const previous = seri[seri.length - 2] || null;

    let delta = null;
    if (current && previous && previous[metric] > 0) {
      const change = (current[metric] - previous[metric]) / previous[metric];
      delta = {
        percent: Math.round(change * 100),
        direction: change === 0 ? 'flat' : change > 0 ? 'up' : 'down',
      };
    }
    return { ...group, current, previous, delta };
  });
}
