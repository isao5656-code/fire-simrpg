/* =========================================================================
 *  バランス確認ツール
 *    node tests/balance.js
 *  想定レベルまで平均成長させた自軍と、各章の敵との噛み合わせを一覧表示する。
 * ========================================================================= */
'use strict';
['core', 'data', 'rules', 'grid', 'ai', 'audio', 'game'].forEach((f) => require('../src/' + f + '.js'));
const FE = globalThis.FE;
const R = FE.rules, D = FE.data;

/** 章ごとの想定レベル */
const EXPECTED_LV = [2, 4, 6, 8, 10, 12];

function grownPlayer(charDef, lv) {
  const u = R.makePlayerUnit(charDef);
  const ups = Math.max(0, lv - charDef.lv);
  for (const k of R.STAT_KEYS) {
    u.stats[k] = Math.min(R.STAT_CAP[k], u.stats[k] + Math.round((u.growth[k] || 0) * ups / 100));
  }
  u.lv = lv;
  u.hp = u.stats.hp;
  return u;
}

/** 入手イベントを踏まえた、その章で装備していそうな武器 */
const WEAPON_TIMELINE = {
  ald:      [['ironSword', 0], ['steelSword', 1], ['silverSword', 4]],
  mireille: [['slimLance', 0], ['silverLance', 3]],
  bolus:    [['ironAxe', 0], ['steelAxe', 1]],
  gareth:   [['ironSword', 1], ['steelSword', 2]],
  linne:    [['ironBow', 1], ['steelBow', 3]],
  nova:     [['fire', 2], ['elfire', 5]],
  dorga:    [['steelLance', 3]],
  shade:    [['slimSword', 4], ['silverSword', 5]]
};
function expectedWeapon(u, chapterIndex) {
  const line = WEAPON_TIMELINE[u.id] || [];
  let best = null;
  for (const [w, from] of line) if (chapterIndex >= from) best = w;
  return best || u.weapons.find((w) => !D.WEAPONS[w].staff);
}

function duel(a, aw, b, bw) {
  const A = { unit: a, weapon: D.WEAPONS[aw], terrain: { def: 0, avo: 0 } };
  const B = { unit: b, weapon: D.WEAPONS[bw], terrain: { def: 0, avo: 0 } };
  const p = R.strikePlan(A, B);
  const hits = p.doubles ? 2 : 1;
  return {
    dmg: p.dmg, hits, hit: p.hit, crit: p.crit,
    perRound: p.dmg * hits,
    rounds: p.dmg > 0 ? Math.ceil(b.stats.hp / (p.dmg * hits)) : Infinity
  };
}

console.log('=========== 想定レベルでの噛み合わせ ===========\n');
D.CHAPTERS.forEach((ch, ci) => {
  const lv = EXPECTED_LV[ci];
  const party = D.CHARACTERS.filter((c) => c.joinChapter <= ci)
    .map((c) => grownPlayer(c, Math.max(c.lv, lv)));
  console.log('─── 第' + ch.no + '章 ' + ch.title + '（想定 Lv' + lv + '） ───');

  const foes = ch.enemies.map((e) => R.makeEnemyUnit(e));
  const sample = [foes.find((f) => !f.boss), foes.find((f) => f.boss)].filter(Boolean);
  for (const foe of sample) {
    const fw = foe.weapons[0];
    console.log('  ▼ ' + foe.name + '(Lv' + foe.lv + ' HP' + foe.stats.hp +
      ' 力' + foe.stats.str + ' 魔' + foe.stats.mag + ' 守' + foe.stats.def + ' 魔防' + foe.stats.res +
      ' 速' + foe.stats.spd + ') 武器:' + D.WEAPONS[fw].name);
    for (const p of party) {
      const pw = expectedWeapon(p, ci);
      if (!pw) continue;
      const atk = duel(p, pw, foe, fw);
      const back = duel(foe, fw, p, pw);
      console.log('     ' + p.name.padEnd(5, '　') + ' Lv' + String(p.lv).padStart(2) +
        ' HP' + String(p.stats.hp).padStart(2) +
        ' │ 与 ' + String(atk.perRound).padStart(3) + (atk.hits > 1 ? '(2回)' : '     ') +
        ' 命中' + String(atk.hit).padStart(3) + '%' +
        ' → ' + (atk.rounds === Infinity ? '通らない' : atk.rounds + '回で撃破') +
        ' │ 被 ' + String(back.perRound).padStart(3) + (back.hits > 1 ? '(2回)' : '     ') +
        ' 命中' + String(back.hit).padStart(3) + '%' +
        ' → ' + (back.rounds === Infinity ? '無傷' : back.rounds + '回で死'));
    }
  }
  console.log('');
});
