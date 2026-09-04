/* =========================================================================
 *  自動プレイによる通し検証
 *    node tests/simulate.js [試行回数]
 *  UI を持たないスタブ view でゲーム本体を動かし、
 *  クラッシュの有無・勝率・所要ターン・戦死者数を集計する。
 * ========================================================================= */
'use strict';
['core', 'data', 'rules', 'grid', 'ai', 'audio', 'game'].forEach((f) => require('../src/' + f + '.js'));
const FE = globalThis.FE;
const R = FE.rules, G = FE.grid, AI = FE.ai, D = FE.data;

function stubView() {
  const noop = () => {};
  const async0 = async () => {};
  return {
    result: null,
    showBriefing: async0, buildMap: noop, redraw: noop, log: noop, setTurn: noop,
    focus: noop, floatText: noop, banner: async0, dialog: async0,
    animateMove: async0, animateCombat: async0,
    animateDeath: async function (u) {
      if (process.env.DEBUG_SIM && u.team === 'player') {
        console.log('  [debug] 戦死: ' + u.name + ' Lv' + u.lv + ' at (' + u.x + ',' + u.y + ')');
      }
    },
    showLevelUp: async0, wait: async0, showTitle: noop, showEnding: async0,
    animateDeathLog: null,
    showResult: async function (ch, party, turns) { this.result = { win: true, turns }; },
    showDefeat: async function () { this.result = { win: false }; }
  };
}

/** 敵がどのマスを狙えるか（マス → 狙っている敵の一覧） */
function threatMap(game) {
  const map = new Map();
  for (const e of game.units) {
    if (e.team !== 'enemy' || e.hp <= 0) continue;
    const ranges = R.attackRanges(e);
    if (!ranges.length) continue;
    const range = G.movementRange(game.board, e, game.units);
    for (const k of G.threatSet(game.board, range, ranges)) {
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(e);
    }
  }
  return map;
}

/** そのマスに立ったとき、敵軍から受けそうな合計ダメージ */
function incomingDamage(game, threat, tile, unit) {
  const foes = threat.get(tile.x + ',' + tile.y);
  if (!foes) return 0;
  const terrain = game.board.modsAt(tile.x, tile.y);
  let total = 0;
  for (const e of foes) {
    const wi = R.bestWeaponIndex(e, 1);
    const w = wi >= 0 ? D.WEAPONS[e.weapons[wi]] : null;
    if (!w) continue;
    const plan = R.strikePlan(
      { unit: e, weapon: w, terrain: { def: 0, avo: 0 } },
      { unit: unit, weapon: R.weaponOf(unit), terrain: terrain });
    total += plan.dmg * (plan.doubles ? 2 : 1) * (plan.hit / 100);
  }
  return total;
}

/**
 * 自軍を機械的に動かす。
 * 「殴れるなら殴る／殴れないなら危険地帯を避けて前進」という、
 * 人間のセオリーに近い動きをさせて難易度の目安をとる。
 */
async function playerTurn(game, aggressive) {
  const threat = threatMap(game);
  // 膠着したら「多少の被弾は覚悟して踏み込む」モードに切り替える
  const tolerance = aggressive ? 1.6 : 0.8;
  const riskWeight = aggressive ? 5 : 20;
  let fought = false;
  let guard = 0;
  while (!game.state.over && guard++ < 40) {
    const actor = game.livingPlayers().find((u) => !u.acted);
    if (!actor) return fought;
    const range = G.movementRange(game.board, actor, game.units);
    const tiles = G.stopTiles(range);

    // 0) 手負いなら傷薬を使って下がる
    if (actor.hp < actor.stats.hp * 0.45) {
      const slot = actor.items.findIndex((it) => D.ITEMS[it.key].heal);
      if (slot >= 0) {
        const safe = tiles.slice().sort((a, b) =>
          (incomingDamage(game, threat, a, actor) - incomingDamage(game, threat, b, actor)) ||
          (nearestFoe(game, b) - nearestFoe(game, a)))[0];
        if (safe) { actor.x = safe.x; actor.y = safe.y; }
        R.useItem(actor, slot);
        actor.acted = true;
        continue;
      }
    }

    // 1) 杖持ちは負傷者を回復（安全なマスから）
    const staffR = R.staffRanges(actor);
    if (staffR.length) {
      let spot = null;
      for (const t of tiles.slice().sort((a, b) =>
        incomingDamage(game, threat, a, actor) - incomingDamage(game, threat, b, actor))) {
        const hurt = game.units.find((o) => o.team === 'player' && o.hp > 0 && o !== actor &&
          o.hp < o.stats.hp * 0.85 &&
          staffR.includes(Math.abs(o.x - t.x) + Math.abs(o.y - t.y)));
        if (hurt) { spot = { t: t, hurt: hurt }; break; }
      }
      if (spot) {
        actor.x = spot.t.x; actor.y = spot.t.y;
        actor.equipped = R.staffIndex(actor);
        const healed = R.applyHeal(spot.hurt, R.healAmount(actor, R.weaponOf(actor)));
        R.gainExp(actor, R.staffExp(actor, healed), game.rng);
        actor.acted = true;
        continue;
      }
      // 回復対象がいなければ、安全なマスへ下がって待機
      const safe = tiles.sort((a, b) =>
        (incomingDamage(game, threat, a, actor) - incomingDamage(game, threat, b, actor)) ||
        (nearestFoe(game, a) - nearestFoe(game, b)))[0];
      if (safe) { actor.x = safe.x; actor.y = safe.y; }
      actor.acted = true;
      continue;
    }

    // 2) 制圧が勝利条件ならロードは玉座を目指す
    if (game.chapter.objective.type === 'seize' && actor.id === 'ald' &&
        !game.livingEnemies().some((e) => e.boss)) {
      const throne = tiles.find((t) => game.board.isSeizable(t.x, t.y));
      if (throne) {
        actor.x = throne.x; actor.y = throne.y;
        await game.seize(actor);
        return fought;
      }
      // 届かないなら玉座へ近づく
      const goals = [];
      game.board.forEachTile((x, y) => { if (game.board.isSeizable(x, y)) goals.push({ x: x, y: y }); });
      if (goals.length) {
        const field = AI.distanceField(game.board, actor, goals);
        const step = tiles.slice().sort((a, b) =>
          (field.has(a.x + ',' + a.y) ? field.get(a.x + ',' + a.y) : 999) -
          (field.has(b.x + ',' + b.y) ? field.get(b.x + ',' + b.y) : 999))[0];
        if (step) { actor.x = step.x; actor.y = step.y; }
        actor.acted = true;
        continue;
      }
    }

    // 3) 攻撃できるなら攻撃（踏み込みモードでは損得より前進を優先する）
    const atk = aggressive
      ? bestDamagingAttack(game, actor, tiles)
      : AI.bestAttack(game.board, actor, game.units, tiles);
    const risky = atk && incomingDamage(game, threat, atk.from, actor) >= actor.hp * tolerance;
    if (atk && atk.score > 0 && !risky) {
      actor.x = atk.from.x; actor.y = atk.from.y;
      actor.equipped = atk.weaponIdx;
      await game.battle(actor, atk.target);
      actor.acted = true;
      fought = true;
      if (game.checkObjective()) return fought;
      continue;
    }

    // 4) 攻撃できないときは、危険地帯を避けつつ敵へ寄る
    let best = null, bestScore = Infinity;
    const keepThroneFree = game.chapter.objective.type === 'seize' && actor.id !== 'ald';
    for (const t of tiles) {
      if (keepThroneFree && game.board.isSeizable(t.x, t.y)) continue;
      const risk = incomingDamage(game, threat, t, actor);
      const score = (risk >= actor.hp * tolerance ? 1000 : risk * riskWeight) + nearestFoe(game, t) -
        game.board.modsAt(t.x, t.y).def * 2;
      if (score < bestScore) { bestScore = score; best = t; }
    }
    if (best) { actor.x = best.x; actor.y = best.y; }
    actor.acted = true;
  }
  return fought;
}

/** 反撃の損得を無視して、いちばんダメージを通せる攻撃を選ぶ */
function bestDamagingAttack(game, unit, tiles) {
  const foes = game.units.filter((u) => u.team === 'enemy' && u.hp > 0);
  let best = null;
  for (const tile of tiles) {
    for (let wi = 0; wi < unit.weapons.length; wi++) {
      const wKey = unit.weapons[wi];
      const w = D.WEAPONS[wKey];
      if (w.staff || !R.canUse(unit, wKey)) continue;
      for (const foe of foes) {
        const d = Math.abs(tile.x - foe.x) + Math.abs(tile.y - foe.y);
        if (!R.canReachWith(w, d)) continue;
        const ci = R.bestWeaponIndex(foe, d);
        const plan = R.strikePlan(
          { unit: unit, weapon: w, terrain: game.board.modsAt(tile.x, tile.y) },
          { unit: foe, weapon: ci >= 0 ? D.WEAPONS[foe.weapons[ci]] : R.weaponOf(foe),
            terrain: game.board.modsAt(foe.x, foe.y) });
        const expected = (plan.hit / 100) * plan.dmg * (plan.doubles ? 2 : 1);
        if (expected <= 0) continue;
        const score = expected + (plan.dmg * (plan.doubles ? 2 : 1) >= foe.hp ? 50 : 0);
        if (!best || score > best.score) {
          best = { score: score, from: tile, target: foe, weaponIdx: wi };
        }
      }
    }
  }
  return best;
}

function nearestFoe(game, tile) {
  let min = 99;
  for (const e of game.units) {
    if (e.team !== 'enemy' || e.hp <= 0) continue;
    const d = Math.abs(e.x - tile.x) + Math.abs(e.y - tile.y);
    if (d < min) min = d;
  }
  return min;
}

async function runCampaign(seed) {
  const view = stubView();
  const game = new FE.Game(view);
  game.rng = new FE.Rng(seed);
  const report = [];
  for (let ci = 0; ci < D.CHAPTERS.length; ci++) {
    view.result = null;
    await game.startChapter(ci);
    let safety = 0, idle = 0;
    while (!game.state.over && safety++ < 60) {
      // 2ターン戦闘がなければ膠着とみなし、危険を承知で踏み込む
      const fought = await playerTurn(game, idle >= 2);
      idle = fought ? 0 : idle + 1;
      if (game.state.over) break;
      await game.endPlayerPhase();
    }
    const win = view.result && view.result.win;
    if (process.env.DEBUG_SIM) {
      console.log('  [debug] ch' + (ci + 1) + ' result=' + JSON.stringify(view.result) +
        ' over=' + game.state.over + ' 生存=' + game.roster.filter((u) => !u.dead).map((u) => u.name).join(','));
    }
    report.push({
      chapter: ci + 1,
      title: D.CHAPTERS[ci].title,
      win: !!win,
      turns: game.state.turn,
      dead: game.roster.filter((u) => u.dead).map((u) => u.name),
      enemiesLeft: game.livingEnemies().length,
      timeout: safety >= 60
    });
    if (!win) break;
  }
  return { seed, report, roster: game.roster.map((u) => u.name + ' Lv' + u.lv + (u.dead ? '(戦死)' : '')) };
}

/** 指定の章だけを、想定レベルまで育てた部隊で検証する */
async function runSingleChapter(seed, ci) {
  const EXPECTED_LV = [2, 4, 6, 8, 10, 12];
  const view = stubView();
  const game = new FE.Game(view);
  game.rng = new FE.Rng(seed);
  game.roster = D.CHARACTERS.filter((c) => c.joinChapter < ci).map((c) => {
    const u = R.makePlayerUnit(c);
    const ups = Math.max(0, EXPECTED_LV[ci] - c.lv);
    for (const k of R.STAT_KEYS) {
      u.stats[k] = Math.min(R.STAT_CAP[k], u.stats[k] + Math.round((u.growth[k] || 0) * ups / 100));
    }
    u.lv = Math.max(c.lv, EXPECTED_LV[ci]);
    u.hp = u.stats.hp;
    return u;
  });
  await game.startChapter(ci);
  let safety = 0, idle = 0;
  const limit = +(process.env.SIM_TURN_LIMIT || 120);
  while (!game.state.over && safety++ < limit) {
    const fought = await playerTurn(game, idle >= 2);
    idle = fought ? 0 : idle + 1;
    if (process.env.DEBUG_SIM) {
      const ald = game.livingPlayers().find((u) => u.id === 'ald');
      console.log('   T' + game.state.turn + ' 敵' + game.livingEnemies().length +
        ' ボス' + (game.livingEnemies().some((e) => e.boss) ? '生' : '死') +
        ' アルド' + (ald ? '(' + ald.x + ',' + ald.y + ')' : '不在'));
    }
    if (game.state.over) break;
    await game.endPlayerPhase();
  }
  return {
    win: !!(view.result && view.result.win),
    turns: game.state.turn,
    dead: game.roster.filter((u) => u.dead).map((u) => u.name),
    enemiesLeft: game.livingEnemies().length
  };
}

(async () => {
  if (process.argv[2] === '--chapter') {
    const ci = +process.argv[3] - 1;
    const n = +(process.argv[4] || 5);
    console.log('=== 第' + (ci + 1) + '章「' + D.CHAPTERS[ci].title + '」を ' + n + ' 回検証 ===');
    for (let i = 0; i < n; i++) {
      const r = await runSingleChapter(2000 + i * 31, ci);
      console.log('  ' + (r.win ? '勝利' : '失敗') + ' / ' + r.turns + 'ターン' +
        ' / 残敵' + r.enemiesLeft + (r.dead.length ? ' / 戦死:' + r.dead.join('、') : ' / 全員生還'));
    }
    return;
  }
  const trials = +(process.argv[2] || 5);
  const all = [];
  for (let i = 0; i < trials; i++) all.push(await runCampaign(1000 + i * 77));

  const stat = {};
  for (const run of all) {
    for (const r of run.report) {
      const s = stat[r.chapter] || (stat[r.chapter] = { title: r.title, n: 0, win: 0, turns: [], dead: 0, timeout: 0 });
      s.n++; if (r.win) s.win++;
      s.turns.push(r.turns); s.dead += r.dead.length; if (r.timeout) s.timeout++;
    }
  }
  console.log('=== 自動プレイ ' + trials + ' 回 ===');
  for (const k of Object.keys(stat)) {
    const s = stat[k];
    const avg = (s.turns.reduce((a, b) => a + b, 0) / s.turns.length).toFixed(1);
    console.log('第' + k + '章 ' + s.title.padEnd(7, '　') +
      ' 到達' + s.n + ' 勝利' + s.win + ' 平均' + avg + 'ターン' +
      ' 延べ戦死' + s.dead + (s.timeout ? ' ⚠打ち切り' + s.timeout : ''));
  }
  console.log('\n最終パーティ例:', all[0].roster.join(' / '));
})();
