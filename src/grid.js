/* =========================================================================
 *  炎翼の紋章 —— grid.js
 *  マップ・移動範囲（ダイクストラ）・攻撃範囲・経路復元
 * ========================================================================= */
(function (global) {
  'use strict';
  const FE = (global.FE = global.FE || {});
  const { TERRAIN } = FE.data;
  const R = FE.rules;
  const key = FE.util.key;

  class Board {
    constructor(rows) {
      this.rows = rows;
      this.h = rows.length;
      this.w = rows[0].length;
    }
    inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
    charAt(x, y) { return this.rows[y][x]; }
    terrainAt(x, y) { return TERRAIN[this.rows[y][x]] || TERRAIN['.']; }
    /** 地形補正（守備・回避）。戦闘計算にそのまま渡せる形 */
    modsAt(x, y) {
      const t = this.terrainAt(x, y);
      return { def: t.def || 0, avo: t.avo || 0, name: t.name, id: t.id, heal: t.heal || 0 };
    }
    costAt(x, y, mtype) {
      const t = this.terrainAt(x, y);
      const c = t.cost[mtype];
      return c == null ? 1 : c;
    }
    passable(x, y, mtype) { return this.costAt(x, y, mtype) < 99; }
    /** 玉座・城門など「制圧」対象か */
    isSeizable(x, y) { return this.terrainAt(x, y).id === 'throne'; }
    forEachTile(fn) {
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) fn(x, y);
    }
  }

  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  /**
   * 移動可能範囲をダイクストラで求める。
   *  - 敵ユニットのマスは通過も停止も不可
   *  - 味方ユニットのマスは通過できるが停止はできない
   * 返り値: Map<"x,y", { x, y, cost, prev }>（停止できるマスのみ stop:true）
   */
  function movementRange(board, unit, units, opts) {
    const mtype = R.moveTypeOf(unit);
    const max = (opts && opts.move != null) ? opts.move : R.moveOf(unit);
    const occupied = new Map();
    for (const u of units) {
      if (u.hp > 0 && u !== unit) occupied.set(key(u.x, u.y), u);
    }
    const dist = new Map();
    const start = { x: unit.x, y: unit.y, cost: 0, prev: null, stop: true };
    dist.set(key(unit.x, unit.y), start);

    // 移動力の上限が小さいので単純な優先度つきリストで十分
    const queue = [start];
    while (queue.length) {
      let bi = 0;
      for (let i = 1; i < queue.length; i++) if (queue[i].cost < queue[bi].cost) bi = i;
      const cur = queue.splice(bi, 1)[0];
      if (cur.cost > (dist.get(key(cur.x, cur.y)) || cur).cost) continue;
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!board.inside(nx, ny)) continue;
        const blocker = occupied.get(key(nx, ny));
        if (blocker && blocker.team !== unit.team) continue;         // 敵は通り抜けられない
        const step = board.costAt(nx, ny, mtype);
        if (step >= 99) continue;
        const nc = cur.cost + step;
        if (nc > max) continue;
        const k = key(nx, ny);
        const known = dist.get(k);
        if (known && known.cost <= nc) continue;
        const node = { x: nx, y: ny, cost: nc, prev: cur, stop: !blocker };
        dist.set(k, node);
        queue.push(node);
      }
    }
    return dist;
  }

  /** movementRange の結果から、実際に停止できるマスの配列 */
  function stopTiles(range) {
    const out = [];
    for (const node of range.values()) if (node.stop) out.push(node);
    return out;
  }

  /** (x,y) から距離 ranges にあるマス */
  function tilesAtRanges(board, x, y, ranges) {
    const out = [];
    const maxR = Math.max.apply(null, ranges);
    for (let dy = -maxR; dy <= maxR; dy++) {
      for (let dx = -maxR; dx <= maxR; dx++) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (!ranges.includes(d)) continue;
        const nx = x + dx, ny = y + dy;
        if (board.inside(nx, ny)) out.push({ x: nx, y: ny });
      }
    }
    return out;
  }

  /** 移動範囲＋武器射程 から作る「攻撃可能マス」の集合（Set of "x,y"） */
  function threatSet(board, range, ranges) {
    const set = new Set();
    if (!ranges.length) return set;
    for (const node of range.values()) {
      if (!node.stop && node.cost !== 0) continue;
      for (const t of tilesAtRanges(board, node.x, node.y, ranges)) set.add(key(t.x, t.y));
    }
    return set;
  }

  /** 敵全体の脅威範囲（危険地帯表示用） */
  function dangerZone(board, units, side) {
    const set = new Set();
    for (const u of units) {
      if (u.hp <= 0 || u.team !== side) continue;
      const ranges = R.attackRanges(u);
      if (!ranges.length) continue;
      const range = movementRange(board, u, units);
      for (const k of threatSet(board, range, ranges)) set.add(k);
    }
    return set;
  }

  /** 目的地までの経路（開始マスを含む配列） */
  function pathTo(range, x, y) {
    let node = range.get(key(x, y));
    if (!node) return null;
    const path = [];
    while (node) { path.unshift({ x: node.x, y: node.y }); node = node.prev; }
    return path;
  }

  FE.grid = { Board, movementRange, stopTiles, tilesAtRanges, threatSet, dangerZone, pathTo, DIRS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
