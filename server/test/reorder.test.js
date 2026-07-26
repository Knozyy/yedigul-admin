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
