/* =========================================================================
 *  炎翼の紋章 —— ai.js
 *  敵ユニットの思考：起動判定 → 攻撃手の評価 → 接近
 * ========================================================================= */
(function (global) {
  'use strict';
  const FE = (global.FE = global.FE || {});
  const R = FE.rules;
  const G = FE.grid;
  const { WEAPONS } = FE.data;
  const key = FE.util.key;
  const manhattan = FE.util.manhattan;

  /** その場から動かないタイプか */
  function isStationary(u) { return u.ai === 'guard' || u.ai === 'boss'; }

  /** 相手陣営 */
  function foeTeam(unit) { return unit.team === 'player' ? 'enemy' : 'player'; }

  /** 'aggro' の起動判定：自分の脅威範囲に敵対ユニットが入ったら動き出す */
  function shouldWake(board, unit, units) {
    if (unit.aggroed) return true;
    if (unit.ai === 'charge') return true;
    const ranges = R.attackRanges(unit);
    if (!ranges.length) return false;
    const range = G.movementRange(board, unit, units);
    const threat = G.threatSet(board, range, ranges);
    const foe = foeTeam(unit);
    return units.some((u) => u.team === foe && u.hp > 0 && threat.has(key(u.x, u.y)));
  }

  /** 攻撃案 1 件の評価値 */
  function scoreAttack(board, unit, weaponIdx, from, target, units) {
    const saved = unit.equipped;
    unit.equipped = weaponIdx;
    const w = R.weaponOf(unit);
    const dist = Math.abs(from.x - target.x) + Math.abs(from.y - target.y);
    const att = { unit, weapon: w, terrain: board.modsAt(from.x, from.y) };
    const defTerrain = board.modsAt(target.x, target.y);
    const counterIdx = R.bestWeaponIndex(target, dist);
    const defWeapon = counterIdx >= 0 ? WEAPONS[target.weapons[counterIdx]] : R.weaponOf(target);
    const def = { unit: target, weapon: defWeapon, terrain: defTerrain };

    const plan = R.strikePlan(att, def);
    const hits = plan.doubles ? 2 : 1;
    const expected = Math.min(target.hp, (plan.hit / 100) * plan.dmg * hits);
    const lethal = plan.dmg * hits >= target.hp && plan.hit >= 55;

    let risk = 0;
    if (counterIdx >= 0 && R.canReachWith(defWeapon, dist)) {
      const back = R.strikePlan(def, att);
      const bHits = back.doubles ? 2 : 1;
      risk = Math.min(unit.hp, (back.hit / 100) * back.dmg * bHits);
      if (back.dmg * bHits >= unit.hp && back.hit >= 55) risk += 60;
    }
    unit.equipped = saved;

    let score = expected * 3 - risk * 2 + defTerrain.def * -1;
    if (lethal) score += 120;
    if (target.cls === 'cleric' || target.cls === 'mage') score += 12;   // 後衛を狙う
    if (target.id === 'ald') score += 8;
    score += (target.stats.hp - target.hp) * 0.4;                        // 手負いを狙う
    score += board.modsAt(from.x, from.y).def * 1.5;                     // 良い地形から殴る
    return { score, expected, lethal, weaponIdx, from, target, dist };
  }

  /** 到達可能マス × 武器 × 標的 を総当たりして最良の攻撃案を返す */
  function bestAttack(board, unit, units, tiles) {
    const foe = foeTeam(unit);
    const targets = units.filter((u) => u.team === foe && u.hp > 0);
    if (!targets.length) return null;
    let best = null;
    for (const tile of tiles) {
      for (let wi = 0; wi < unit.weapons.length; wi++) {
        const w = WEAPONS[unit.weapons[wi]];
        if (w.staff) continue;
        for (const t of targets) {
          const d = Math.abs(tile.x - t.x) + Math.abs(tile.y - t.y);
          if (!R.canReachWith(w, d)) continue;
          const plan = scoreAttack(board, unit, wi, tile, t, units);
          if (!best || plan.score > best.score) best = plan;
        }
      }
    }
    return best;
  }

  /** 目標群からの距離場（自分の移動タイプでのコスト）を作る */
  function distanceField(board, unit, goals) {
    const mtype = R.moveTypeOf(unit);
    const field = new Map();
    const queue = [];
    for (const g of goals) {
      const k = key(g.x, g.y);
      field.set(k, 0);
      queue.push({ x: g.x, y: g.y, cost: 0 });
    }
    while (queue.length) {
      let bi = 0;
      for (let i = 1; i < queue.length; i++) if (queue[i].cost < queue[bi].cost) bi = i;
      const cur = queue.splice(bi, 1)[0];
      if (cur.cost > field.get(key(cur.x, cur.y))) continue;
      for (const [dx, dy] of G.DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!board.inside(nx, ny)) continue;
        const step = board.costAt(nx, ny, mtype);
        if (step >= 99) continue;
        const nc = cur.cost + step;
        const k = key(nx, ny);
        if (field.has(k) && field.get(k) <= nc) continue;
        field.set(k, nc);
        queue.push({ x: nx, y: ny, cost: nc });
      }
    }
    return field;
  }

  /** 攻撃できないときの接近先。目標に最も近づける停止マスを選ぶ */
  function approachTile(board, unit, units, tiles) {
    const foe = foeTeam(unit);
    const targets = units.filter((u) => u.team === foe && u.hp > 0);
    if (!targets.length) return null;
    const field = distanceField(board, unit, targets);
    let best = null, bestScore = Infinity;
    for (const tile of tiles) {
      const d = field.has(key(tile.x, tile.y))
        ? field.get(key(tile.x, tile.y))
        : 900 + Math.min.apply(null, targets.map((t) => manhattan(tile, t)));
      const score = d * 10 - board.modsAt(tile.x, tile.y).def * 2 - board.modsAt(tile.x, tile.y).avo * 0.05;
      if (score < bestScore) { bestScore = score; best = tile; }
    }
    return best;
  }

  /**
   * 1 体ぶんの行動計画。
   * 返り値: { move:{x,y}, attack:{ target, weaponIdx } | null }
   */
  function plan(board, unit, units) {
    const stationary = isStationary(unit);
    const awake = stationary ? true : shouldWake(board, unit, units);
    if (!awake) return { move: { x: unit.x, y: unit.y }, attack: null, idle: true };

    const range = G.movementRange(board, unit, units);
    const tiles = stationary ? [{ x: unit.x, y: unit.y }] : G.stopTiles(range);
    const atk = bestAttack(board, unit, units, tiles);

    if (atk && atk.score > 0) {
      return {
        move: { x: atk.from.x, y: atk.from.y },
        attack: { target: atk.target, weaponIdx: atk.weaponIdx, dist: atk.dist }
      };
    }
    if (stationary) return { move: { x: unit.x, y: unit.y }, attack: null, idle: true };

    const dest = approachTile(board, unit, units, tiles);
    return { move: dest ? { x: dest.x, y: dest.y } : { x: unit.x, y: unit.y }, attack: null };
  }

  FE.ai = { plan, shouldWake, isStationary, bestAttack, approachTile, distanceField, foeTeam };
})(typeof globalThis !== 'undefined' ? globalThis : this);
