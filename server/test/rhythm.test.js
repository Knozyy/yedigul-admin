import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fillDays,
  isWeekend,
  makeIntensity,
  toWeekGrid,
  weekdayDelta,
  weekdayIndex,
} from '../../shared/rhythm.js';

test('eksik günleri sıfırla doldurur ve tam 30 gün üretir', () => {
  // stats_daily yalnızca olay olan günü yazar: 27 ve 29 Temmuz dizide yok.
  const sparse = [
    { day: '2026-07-26', menu_view: 180, qr_scan: 90 },
    { day: '2026-07-28', menu_view: 60, qr_scan: 20 },
    { day: '2026-07-30', menu_view: 75, qr_scan: 31 },
  ];
  const filled = fillDays(sparse, '2026-07-30', 30);

  assert.equal(filled.length, 30);
  assert.equal(filled.at(-1).day, '2026-07-30');
  assert.equal(filled[0].day, '2026-07-01');

  const byDay = new Map(filled.map((d) => [d.day, d]));
  assert.equal(byDay.get('2026-07-26').menu_view, 180);
  assert.equal(byDay.get('2026-07-27').menu_view, 0, 'boş gün sıfırlanmalı');
  assert.equal(byDay.get('2026-07-29').qr_scan, 0);
});

test('takvim ızgarasında her hücre gerçek haftagününe düşer', () => {
  const filled = fillDays([], '2026-07-25', 30);
  const rows = toWeekGrid(filled);

  assert.equal(rows.length, 5);
  for (const row of rows) assert.equal(row.length, 7);

  // Kritik: sütun indeksi ile gerçek haftagünü birebir örtüşmeli, yoksa
  // salı verisi cuma sütununda görünür.
  for (const row of rows) {
    row.forEach((entry, column) => {
      if (entry) assert.equal(weekdayIndex(entry.day), column, `${entry.day} yanlış sütunda`);
    });
  }

  const flat = rows.flat().filter(Boolean);
  assert.equal(flat.length, 30);
});

test('hafta sonu tespiti cumartesi ve pazarı yakalar', () => {
  assert.equal(isWeekend('2026-07-25'), true, '25 Tem 2026 cumartesi');
  assert.equal(isWeekend('2026-07-26'), true, '26 Tem 2026 pazar');
  assert.equal(isWeekend('2026-07-27'), false, '27 Tem 2026 pazartesi');
});

test('delta dünle değil, geçen haftanın aynı günüyle karşılaştırır', () => {
  const days = fillDays(
    [
      { day: '2026-07-18', menu_view: 200, qr_scan: 0 }, // geçen cumartesi
      { day: '2026-07-24', menu_view: 999, qr_scan: 0 }, // dün (cuma) — yok sayılmalı
      { day: '2026-07-25', menu_view: 250, qr_scan: 0 }, // bugün cumartesi
    ],
    '2026-07-25',
    30,
  );
  const delta = weekdayDelta(days, 'menu_view');

  assert.equal(delta.weekday, 'Cmt');
  assert.equal(delta.previous, 200, 'geçen cumartesi baz alınmalı');
  assert.equal(delta.current, 250);
  assert.equal(delta.percent, 25);
  assert.equal(delta.direction, 'up');
});

test('geçen hafta sıfırsa delta üretmez (sonsuz yüzde yok)', () => {
  const days = fillDays([{ day: '2026-07-25', menu_view: 250, qr_scan: 0 }], '2026-07-25', 30);
  assert.equal(weekdayDelta(days, 'menu_view'), null);
});

test('yoğunluk ölçeği hafta içi farkını ezmez', () => {
  // Gerçekçi dağılım: hafta sonu hafta içinin ~2.5 katı. En yüksek değere
  // oranlayan bir ölçek bütün hafta içini tek tona ezerdi.
  const values = [
    118, 214, 186, 62, 54, 71, 66, 126, 238, 203, 58, 49, 77, 81, 134,
    226, 198, 64, 72, 88, 79, 142, 257, 221, 69, 83, 91, 86, 151, 248,
  ];
  const intensity = makeIntensity(values);

  assert.equal(intensity(0), 0, 'veri olmayan gün boş kalmalı');
  assert.equal(intensity(257), 5, 'en yoğun gün en üst kademe');
  assert.notEqual(intensity(49), intensity(91), 'sakin hafta içi günleri ayrışmalı');

  // Hiçbir kademe diğerlerini yutmamalı: 30 gün beş kademeye dağılsın.
  const counts = new Map();
  for (const value of values) counts.set(intensity(value), (counts.get(intensity(value)) || 0) + 1);
  assert.equal(counts.size, 5, 'beş kademe de kullanılmalı');
  assert.ok(Math.max(...counts.values()) <= 10, 'tek kademe baskın olmamalı');

  // Hafta sonları üst kademelerde kalmalı — ayrıştırma bunu bozmamalı.
  assert.ok(intensity(214) >= 4 && intensity(248) >= 4, 'hafta sonu üst kademede');
});

test('ölçek bozuk dağılımlarda çökmez', () => {
  assert.equal(makeIntensity([])(5), 0, 'veri yoksa hep boş');
  assert.equal(makeIntensity(Array(30).fill(0))(0), 0, 'hepsi sıfırsa hep boş');

  const duz = makeIntensity(Array(30).fill(80));
  assert.equal(duz(80), 1, 'tüm günler eşitse sahte fark üretilmemeli');
});
