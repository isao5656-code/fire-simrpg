/* =========================================================================
 *  炎翼の紋章 —— core.js
 *  名前空間・乱数・汎用ユーティリティ
 * ========================================================================= */
(function (global) {
  'use strict';

  const FE = (global.FE = global.FE || {});

  /* ---- 乱数（シード指定可能：テストで決定的に再現できる） ---------------- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Rng {
    constructor(seed) {
      this.reseed(seed == null ? (Date.now() & 0xffffffff) : seed);
    }
    reseed(seed) {
      this.seed = seed >>> 0;
      this._next = mulberry32(this.seed);
      return this;
    }
    /** 0〜99 の整数 */
    roll() {
      return Math.floor(this._next() * 100);
    }
    /** 0〜n-1 の整数 */
    int(n) {
      return Math.floor(this._next() * n);
    }
    /** percent% の確率で true */
    chance(percent) {
      return this.roll() < percent;
    }
    /** 命中判定用の 2RN（2回振って平均）。高命中がより当たる本家準拠の挙動 */
    roll2() {
      return (this.roll() + this.roll()) / 2;
    }
    pick(list) {
      return list[this.int(list.length)];
    }
  }

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const key = (x, y) => x + ',' + y;

  FE.Rng = Rng;
  FE.util = { clamp, manhattan, key, mulberry32 };
})(typeof globalThis !== 'undefined' ? globalThis : this);
