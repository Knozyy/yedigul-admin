import assert from 'node:assert/strict';
import test from 'node:test';
import {
  B_MAX_GUN,
  C_MAX_CUBUK,
  PRESETS,
  bucketDays,
  coverageNote,
  pickForm,
  rangeLength,
  resolvePreset,
} from '../../shared/period.js';

const gunler = (from, adet, deger = 1) => {
  const out = [];
  const d = new Date(`${from}T00:00:00`);
  for (let i = 0; i < adet; i++) {
    const p = (n) => String(n).padStart(2, '0');
    out.push({ day: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, menu_view: deger, qr_scan: 0 });
    d.setDate(d.getDate() + 1);
  }
  return out;
};

test('hazır dönemler kayıtlı ve her birinin etiketi var', () => {
  assert.deepEqual(PRESETS.map((p) => p.id), ['son4hafta', 'buAy', 'gecenAy', 'buYil', 'ozel']);
  assert.ok(PRESETS.every((p) => p.label.length > 2));
});

test('son 4 hafta bugün dahil 28 gün verir', () => {
  const { from, to } = resolvePreset('son4hafta', '2026-07-27');
  assert.equal(to, '2026-07-27');
  assert.equal(from, '2026-06-30');
  assert.equal(rangeLength(from, to), 28);
});

test('bu ay ayın 1inden bugüne', () => {
  assert.deepEqual(resolvePreset('buAy', '2026-07-27'), { from: '2026-07-01', to: '2026-07-27' });
});

// Ay sonları elle hesaplanırsa 31 Mart'tan bir ay geri gitmek 31 Şubat üretir.
test('geçen ay ayın son gününü doğru bulur', () => {
  assert.deepEqual(resolvePreset('gecenAy', '2026-07-27'), { from: '2026-06-01', to: '2026-06-30' });
  assert.deepEqual(resolvePreset('gecenAy', '2026-03-31'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(resolvePreset('gecenAy', '2024-03-15'), { from: '2024-02-01', to: '2024-02-29' }, 'artık yıl');
  assert.deepEqual(resolvePreset('gecenAy', '2026-01-10'), { from: '2025-12-01', to: '2025-12-31' }, 'yıl sınırı');
});

test('bu yıl 1 ocaktan bugüne', () => {
  assert.deepEqual(resolvePreset('buYil', '2026-07-27'), { from: '2026-01-01', to: '2026-07-27' });
});

test('özel dönem kendi aralığını çözmez', () => {
  assert.equal(resolvePreset('ozel', '2026-07-27'), null);
});

test('rangeLength iki ucu da sayar', () => {
  assert.equal(rangeLength('2026-07-27', '2026-07-27'), 1);
  assert.equal(rangeLength('2026-07-01', '2026-07-31'), 31);
  assert.equal(rangeLength('2026-01-01', '2026-12-31'), 365);
});

// B, 7 panele bölündüğü için panel başına ~10 çubuktan sonra okunmaz oluyor.
test('biçim gün sayısına göre seçilir', () => {
  assert.equal(pickForm(28), 'weekday');
  assert.equal(pickForm(B_MAX_GUN), 'weekday');
  assert.equal(pickForm(B_MAX_GUN + 1), 'timeline');
  assert.equal(pickForm(365), 'timeline');
});

test('kısa aralık günlük kovada kalır', () => {
  const kova = bucketDays(gunler('2026-07-01', 30, 5));
  assert.equal(kova.unit, 'day');
  assert.equal(kova.buckets.length, 30);
  assert.equal(kova.buckets[0].menu_view, 5);
});

// 365 günlük çubuk 680px'te 1.8px eder; okunmaz.
test('uzun aralık haftalık kovaya toplanır', () => {
  const kova = bucketDays(gunler('2026-01-05', 364, 2));
  assert.equal(kova.unit, 'week');
  assert.equal(kova.buckets.length, 52);
  assert.equal(kova.buckets[0].menu_view, 14, 'haftanın 7 günü toplanır');
});

test('kova eşiği tam sınırda günlük kalır', () => {
  assert.equal(bucketDays(gunler('2026-01-01', C_MAX_CUBUK)).unit, 'day');
  assert.equal(bucketDays(gunler('2026-01-01', C_MAX_CUBUK + 1)).unit, 'week');
});

test('haftalık kova pazartesiden başlar ve eksik haftayı kırpmaz', () => {
  // 2026-01-01 perşembe: ilk kova yarım hafta olur ama kaybolmaz.
  const kova = bucketDays(gunler('2026-01-01', 200, 1));
  assert.equal(kova.unit, 'week');
  const toplam = kova.buckets.reduce((a, b) => a + b.menu_view, 0);
  assert.equal(toplam, 200, 'hiçbir gün düşmemeli');
});

test('boş seri çökmez', () => {
  const kova = bucketDays([]);
  assert.deepEqual(kova.buckets, []);
  assert.equal(kova.unit, 'day');
});

// Sayaç 7 Tem 2026'da başladı. Öncesini sıfır göstermek "iş kötü gitti" diye
// okunur; sessiz kalmak yerine söylemek gerekir.
test('aralık tamamen sayaçtan önceyse veri yok denir', () => {
  const not = coverageNote('2026-07-07', '2026-03-01', '2026-03-31');
  assert.equal(not.state, 'none');
  assert.match(not.message, /7 Tem 2026/);
});

test('aralık kısmen kapsıyorsa kapsanmayan bölüm söylenir', () => {
  const not = coverageNote('2026-07-07', '2026-01-01', '2026-07-27');
  assert.equal(not.state, 'partial');
  assert.match(not.message, /1 Oca/);
  assert.match(not.message, /6 Tem/);
  assert.equal(not.from, '2026-07-07', 'çizim sayacın başladığı günden başlamalı');
});

test('aralık tamamen kapsanıyorsa uyarı olmaz', () => {
  const not = coverageNote('2026-07-07', '2026-07-10', '2026-07-27');
  assert.equal(not.state, 'full');
  assert.equal(not.message, '');
});

test('firstDay bilinmiyorsa uyarı üretilmez', () => {
  assert.equal(coverageNote(null, '2026-01-01', '2026-07-27').state, 'full');
});
