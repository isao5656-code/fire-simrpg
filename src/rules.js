/* =========================================================================
 *  炎翼の紋章 —— rules.js
 *  ユニット生成・戦闘計算・成長・経験値（副作用のない純粋ロジック）
 * ========================================================================= */
(function (global) {
  'use strict';
  const FE = (global.FE = global.FE || {});
  const { WEAPONS, ITEMS, CLASSES } = FE.data;
  const clamp = FE.util.clamp;

  const STAT_KEYS = ['hp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res'];
  const STAT_LABEL = { hp: 'ＨＰ', str: '力', mag: '魔力', skl: '技', spd: '速さ', lck: '幸運', def: '守備', res: '魔防' };
  const STAT_CAP = { hp: 60, str: 26, mag: 26, skl: 26, spd: 26, lck: 30, def: 24, res: 24 };
  const MAX_LEVEL = 20;

  /* ---- 三すくみ --------------------------------------------------------- */
  const TRIANGLE = { sword: 'axe', axe: 'lance', lance: 'sword' };          // 攻撃側 → 有利な相手
  const ANIMA = { fire: 'wind', wind: 'thunder', thunder: 'fire' };

  /** 攻撃側武器 a が防御側武器 b に対して持つ相性。1=有利 / -1=不利 / 0=互角 */
  function triangleBonus(a, b) {
    if (!a || !b) return 0;
    if (TRIANGLE[a.kind] && TRIANGLE[a.kind] === b.kind) return 1;
    if (TRIANGLE[b.kind] && TRIANGLE[b.kind] === a.kind) return -1;
    if (a.anima && b.anima) {
      if (ANIMA[a.anima] === b.anima) return 1;
      if (ANIMA[b.anima] === a.anima) return -1;
    }
    return 0;
  }

  /* ---- ユニット生成 ----------------------------------------------------- */
  let uidSeq = 0;
  function resetUid() { uidSeq = 0; }

  function makeItem(key) {
    const def = ITEMS[key];
    return { key, uses: def.uses };
  }

  function makePlayerUnit(charDef) {
    const stats = Object.assign({}, charDef.base);
    return {
      uid: 'p' + (++uidSeq),
      id: charDef.id,
      name: charDef.name,
      title: charDef.title,
      bio: charDef.bio,
      cls: charDef.cls,
      team: 'player',
      lv: charDef.lv,
      exp: 0,
      stats,
      growth: Object.assign({}, charDef.growth),
      hp: stats.hp,
      weapons: charDef.weapons.slice(),
      equipped: 0,
      items: charDef.items.map(makeItem),
      x: 0, y: 0,
      acted: false
    };
  }

  /** 敵は「兵種の基礎値 + 成長率 ×(Lv-1)」で自動生成する */
  function makeEnemyUnit(entry) {
    const cls = CLASSES[entry.cls];
    const stats = {};
    for (const k of STAT_KEYS) {
      const gain = Math.floor((cls.growth[k] || 0) * (entry.lv - 1) / 100);
      stats[k] = clamp((cls.base[k] || 0) + gain + ((entry.bonus && entry.bonus[k]) || 0), 0, STAT_CAP[k]);
    }
    return {
      uid: 'e' + (++uidSeq),
      id: entry.cls,
      name: entry.name || cls.name,
      cls: entry.cls,
      team: 'enemy',
      lv: entry.lv,
      exp: 0,
      stats,
      hp: stats.hp,
      weapons: entry.weapons.slice(),
      equipped: 0,
      items: [],
      x: entry.x, y: entry.y,
      acted: false,
      ai: entry.ai || 'aggro',
      boss: !!entry.boss,
      drop: entry.drop || null,
      quote: entry.quote || null,
      aggroed: entry.ai === 'charge'
    };
  }

  /* ---- 参照ヘルパ ------------------------------------------------------- */
  const classOf = (u) => CLASSES[u.cls];
  const moveTypeOf = (u) => CLASSES[u.cls].mtype;
  const moveOf = (u) => CLASSES[u.cls].move;
  const weaponOf = (u) => (u.weapons.length ? WEAPONS[u.weapons[u.equipped]] : null);
  const weaponKeyOf = (u) => (u.weapons.length ? u.weapons[u.equipped] : null);
  const isAlive = (u) => u.hp > 0;

  function canReachWith(w, dist) { return !!w && dist >= w.min && dist <= w.max; }

  /** その兵種が扱える武器か（拾った武器を誰でも振り回せないようにする） */
  function canUse(u, weaponKey) {
    const w = WEAPONS[weaponKey];
    return !!w && CLASSES[u.cls].weapons.indexOf(w.kind) >= 0;
  }

  /** 距離 dist の相手に届く攻撃用武器のうち、最も威力の高いものの index */
  function bestWeaponIndex(u, dist) {
    let best = -1, score = -Infinity;
    u.weapons.forEach((key, i) => {
      const w = WEAPONS[key];
      if (w.staff || !canUse(u, key) || !canReachWith(w, dist)) return;
      const s = w.mt * 2 + w.hit / 10;
      if (s > score) { score = s; best = i; }
    });
    return best;
  }

  function staffIndex(u) {
    return u.weapons.findIndex((k) => WEAPONS[k].staff && canUse(u, k));
  }

  /** ユニットが取り得る攻撃射程の集合（全所持武器の和） */
  function attackRanges(u) {
    const set = new Set();
    for (const key of u.weapons) {
      const w = WEAPONS[key];
      if (w.staff || !canUse(u, key)) continue;
      for (let r = w.min; r <= w.max; r++) set.add(r);
    }
    return [...set].sort((a, b) => a - b);
  }

  function staffRanges(u) {
    const set = new Set();
    for (const key of u.weapons) {
      const w = WEAPONS[key];
      if (!w.staff || !canUse(u, key)) continue;
      for (let r = w.min; r <= w.max; r++) set.add(r);
    }
    return [...set].sort((a, b) => a - b);
  }

  /* ---- 戦闘パラメータ --------------------------------------------------- */
  /**
   * 一方向ぶんの戦闘値を求める。
   * me   : { unit, weapon, terrain:{def,avo} }
   * foe  : 同上（相性・特効判定に使う）
   */
  function combatStats(me, foe) {
    const u = me.unit, w = me.weapon;
    const s = u.stats;
    const tri = triangleBonus(w, foe && foe.weapon);
    const eff = w && w.effective && foe && w.effective.includes(moveTypeOf(foe.unit)) ? 2 : 1;
    const mightStat = w && w.magic ? s.mag : s.str;
    const atk = w ? mightStat + w.mt * eff + tri : 0;
    const burden = w ? Math.max(0, w.wt - s.str) : 0;
    const as = s.spd - burden;                                   // 攻撃速度
    const hit = w ? s.skl * 2 + Math.floor(s.lck / 2) + w.hit + tri * 15 : 0;
    const avo = as * 2 + s.lck + (me.terrain ? me.terrain.avo : 0);
    const crt = w ? Math.floor(s.skl / 2) + w.crit : 0;
    const ddg = s.lck;
    return { atk, as, hit, avo, crt, ddg, eff: eff > 1, tri };
  }

  /** 攻撃側 → 防御側 の見込み（命中率・ダメージ・必殺率・追撃） */
  function strikePlan(att, def) {
    const a = combatStats(att, def);
    const d = combatStats(def, att);
    const guard = att.weapon && att.weapon.magic ? def.unit.stats.res : def.unit.stats.def;
    const terr = def.terrain ? def.terrain.def : 0;
    const dmg = Math.max(0, a.atk - guard - terr);
    return {
      atk: a.atk,
      dmg,
      hit: clamp(a.hit - d.avo, 0, 100),
      crit: clamp(a.crt - d.ddg, 0, 100),
      as: a.as,
      doubles: a.as - d.as >= 4,
      effective: a.eff,
      tri: a.tri
    };
  }

  /**
   * 戦闘予測。dist は攻撃時の間合い。
   * 返り値の player 側 = 攻撃側、enemy 側 = 反撃側。
   */
  function forecast(att, def, dist) {
    const plan = strikePlan(att, def);
    const canCounter = !!def.weapon && !def.weapon.staff && canReachWith(def.weapon, dist);
    const counter = canCounter ? strikePlan(def, att) : null;
    return {
      attacker: plan,
      counter,
      dist,
      attackerHpAfter: att.unit.hp,
      defenderHpAfter: def.unit.hp
    };
  }

  /* ---- 命中判定・戦闘の解決 --------------------------------------------- */
  /**
   * 1回の斬り結び。rng.roll2() の 2RN 方式（表示命中率どおりに当たりやすい）。
   * 返り値: { type:'hit'|'crit'|'miss', dmg }
   */
  function rollStrike(plan, rng) {
    if (rng.roll2() >= plan.hit) return { type: 'miss', dmg: 0 };
    const crit = plan.crit > 0 && rng.chance(plan.crit);
    return { type: crit ? 'crit' : 'hit', dmg: crit ? plan.dmg * 3 : plan.dmg };
  }

  /**
   * 戦闘を最後まで解決し、演出用のイベント列を返す（HP は呼び出し側で反映済み）。
   * events: [{ from, to, type, dmg, hpAfter }]
   */
  function resolveCombat(att, def, dist, rng) {
    const events = [];
    const A = att.unit, D = def.unit;
    const aPlan = strikePlan(att, def);
    const canCounter = !!def.weapon && !def.weapon.staff && canReachWith(def.weapon, dist);
    const dPlan = canCounter ? strikePlan(def, att) : null;

    const order = [{ side: 'a' }, { side: 'd' }];
    if (aPlan.doubles) order.push({ side: 'a' });
    else if (dPlan && dPlan.doubles) order.push({ side: 'd' });

    for (const step of order) {
      if (A.hp <= 0 || D.hp <= 0) break;
      if (step.side === 'a') {
        const r = rollStrike(aPlan, rng);
        D.hp = Math.max(0, D.hp - r.dmg);
        events.push({ from: A, to: D, type: r.type, dmg: r.dmg, hpAfter: D.hp });
      } else {
        if (!dPlan) continue;
        const r = rollStrike(dPlan, rng);
        A.hp = Math.max(0, A.hp - r.dmg);
        events.push({ from: D, to: A, type: r.type, dmg: r.dmg, hpAfter: A.hp });
      }
    }
    return events;
  }

  /* ---- 経験値・レベルアップ --------------------------------------------- */
  function hitExp(u, foe) {
    return clamp(Math.round((31 + foe.lv - u.lv) / 3), 1, 60);
  }
  function killExp(u, foe) {
    const base = hitExp(u, foe) + 20 + Math.max(0, foe.lv - u.lv) * 2;
    return clamp(base + (foe.boss ? 40 : 0), 10, 100);
  }
  function staffExp(u, healed) {
    return clamp(8 + Math.floor(healed / 2), 8, 40);
  }

  /**
   * 経験値を加算。100 ごとにレベルアップし、成長判定を行う。
   * 返り値: [{ lv, gains:{stat:1,...} }, ...]
   */
  function gainExp(u, amount, rng) {
    if (u.team !== 'player' || u.lv >= MAX_LEVEL) return [];
    const ups = [];
    u.exp += amount;
    while (u.exp >= 100 && u.lv < MAX_LEVEL) {
      u.exp -= 100;
      u.lv++;
      const gains = {};
      for (const k of STAT_KEYS) {
        const rate = u.growth[k] || 0;
        if (u.stats[k] < STAT_CAP[k] && rng.chance(rate)) {
          u.stats[k]++;
          gains[k] = 1;
        }
      }
      if (gains.hp) u.hp++;
      ups.push({ lv: u.lv, gains });
    }
    if (u.lv >= MAX_LEVEL) u.exp = 0;
    return ups;
  }

  /* ---- 回復・道具 ------------------------------------------------------- */
  function healAmount(unit, staff) {
    return staff.heal + unit.stats.mag;
  }
  function applyHeal(target, amount) {
    const before = target.hp;
    target.hp = Math.min(target.stats.hp, target.hp + amount);
    return target.hp - before;
  }
  /** 道具を使う。回復量（またはステータス上昇なら 0）を返す */
  function useItem(unit, slot) {
    const inv = unit.items[slot];
    if (!inv) return null;
    const def = ITEMS[inv.key];
    let result;
    if (def.heal) {
      result = { kind: 'heal', value: applyHeal(unit, def.heal) };
    } else {
      unit.stats[def.stat] = Math.min(STAT_CAP[def.stat], unit.stats[def.stat] + def.up);
      if (def.stat === 'hp') unit.hp += def.up;
      result = { kind: 'stat', stat: def.stat, value: def.up };
    }
    inv.uses--;
    if (inv.uses <= 0) unit.items.splice(slot, 1);
    return result;
  }

  FE.rules = {
    STAT_KEYS, STAT_LABEL, STAT_CAP, MAX_LEVEL,
    triangleBonus, resetUid, makeItem, makePlayerUnit, makeEnemyUnit,
    classOf, moveTypeOf, moveOf, weaponOf, weaponKeyOf, isAlive,
    canReachWith, canUse, bestWeaponIndex, staffIndex, attackRanges, staffRanges,
    combatStats, strikePlan, forecast, rollStrike, resolveCombat,
    hitExp, killExp, staffExp, gainExp,
    healAmount, applyHeal, useItem
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
