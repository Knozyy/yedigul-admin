import { MONTHS, parseDay, shiftDay, toIso, weekdayIndex } from './rhythm.js';

/**
 * Dönem seçimi: çip → tarih aralığı, aralık → biçim, seri → kova.
 *
 * Hepsi SAF. Sunucu ve arayüz aynı kuralları paylaşsın diye shared/ altında.
 */

/**
 * B (7 gün paneli) 7 sütuna bölündüğü için panel başına ~120px kalıyor;
 * 6px çubuk + 2px boşlukla ~14 çubuk sığıyor. 10 hafta güvenli sınır.
 */
export const B_MAX_GUN = 70;

/** 680px'te 120 çubuk ≈ 5.6px. Daha fazlası iğneye döner, kovalanır. */
export const C_MAX_CUBUK = 120;

export const PRESETS = [
  { id: 'son4hafta', label: 'Son 4 hafta' },
  { id: 'buAy', label: 'Bu ay' },
  { id: 'gecenAy', label: 'Geçen ay' },
  { id: 'buYil', label: 'Bu yıl' },
  { id: 'ozel', label: 'Özel' },
];

const pad = (n) => String(n).padStart(2, '0');

/** Ay sonunu takvimden sorar: 31 Mart'tan bir ay geri 31 Şubat DEĞİLDİR. */
function ayinSonGunu(yil, ay) {
  return new Date(yil, ay + 1, 0).getDate();
}

/** Çipten tarih aralığı. 'ozel' kendi aralığını kullanıcıdan alır → null. */
export function resolvePreset(id, bugun) {
  const d = parseDay(bugun);
  const yil = d.getFullYear();
  const ay = d.getMonth();

  switch (id) {
    case 'son4hafta':
      return { from: shiftDay(bugun, -27), to: bugun };
    case 'buAy':
      return { from: `${yil}-${pad(ay + 1)}-01`, to: bugun };
    case 'gecenAy': {
      const oncekiYil = ay === 0 ? yil - 1 : yil;
      const oncekiAy = ay === 0 ? 11 : ay - 1;
      return {
        from: `${oncekiYil}-${pad(oncekiAy + 1)}-01`,
        to: `${oncekiYil}-${pad(oncekiAy + 1)}-${pad(ayinSonGunu(oncekiYil, oncekiAy))}`,
      };
    }
    case 'buYil':
      return { from: `${yil}-01-01`, to: bugun };
    default:
      return null;
  }
}

/** İki ucu da sayar: 1–31 Temmuz 31 gündür, 30 değil. */
export function rangeLength(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
}

/** Kullanıcı seçmez, gün sayısı belirler. */
export function pickForm(gunSayisi) {
  return gunSayisi <= B_MAX_GUN ? 'weekday' : 'timeline';
}

/**
 * Zaman çizgisi çubukları. Çubuk sayısı eşiği aşarsa haftalık toplanır —
 * yıl seçilince 365 değil 52 çubuk çizilir.
 */
export function bucketDays(days) {
  if (!days?.length) return { unit: 'day', buckets: [] };
  if (days.length <= C_MAX_CUBUK) {
    return { unit: 'day', buckets: days.map((d) => ({ ...d, from: d.day, to: d.day })) };
  }

  const buckets = [];
  let current = null;
  for (const entry of days) {
    // Haftanın pazartesisi kova kimliği. Baştaki yarım hafta kırpılmaz;
    // toplam korunmalı, aksi halde grafik veriyi sessizce yer.
    const hafta = shiftDay(entry.day, -weekdayIndex(entry.day));
    if (!current || current.day !== hafta) {
      current = { day: hafta, from: entry.day, to: entry.day, menu_view: 0, qr_scan: 0 };
      buckets.push(current);
    }
    current.to = entry.day;
    current.menu_view += Number(entry.menu_view) || 0;
    current.qr_scan += Number(entry.qr_scan) || 0;
  }
  return { unit: 'week', buckets };
}

const kisaTarih = (iso) => {
  const d = parseDay(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
const kisaTarihGunAy = (iso) => {
  const d = parseDay(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/**
 * Sayaç belli bir günde başladı; öncesi "sıfır ziyaret" değil "kayıt yok".
 * Sessizce sıfır çizmek işletmeye kötü gidiyormuş gibi görünür.
 *
 * Döner: state 'full' | 'partial' | 'none', kısmi durumda çizime BAŞLANACAK gün.
 */
export function coverageNote(firstDay, from, to) {
  if (!firstDay || firstDay <= from) return { state: 'full', message: '', from };

  if (firstDay > to) {
    return {
      state: 'none',
      message: `Bu dönemde kayıt yok. Sayaç ${kisaTarih(firstDay)}'da başladı.`,
      from,
    };
  }

  return {
    state: 'partial',
    message: `${kisaTarihGunAy(from)} – ${kisaTarihGunAy(shiftDay(firstDay, -1))} arası kayıt yok; sayaç ${kisaTarih(firstDay)}'da başladı.`,
    from: firstDay,
  };
}

export { toIso };
