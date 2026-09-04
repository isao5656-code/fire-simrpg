/* =========================================================================
 *  単体テスト   node --test tests/
 * ========================================================================= */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
['core', 'data', 'rules', 'grid', 'ai', 'audio', 'game'].forEach((f) => require('../src/' + f + '.js'));
const FE = globalThis.FE;
const { rules: R, grid: G, data: D, ai: AI } = FE;

const flat = { def: 0, avo: 0 };
const player = (id) => R.makePlayerUnit(D.CHARACTERS.find((c) => c.id === id));
const enemy = (cls, lv, weapons, extra) =>
  R.makeEnemyUnit(Object.assign({ cls, lv, x: 0, y: 0, weapons }, extra || {}));

/* ---- 三すくみ --------------------------------------------------------- */
test('三すくみ：剣＞斧＞槍＞剣', () => {
  const W = D.WEAPONS;
  assert.strictEqual(R.triangleBonus(W.ironSword, W.ironAxe), 1);
  assert.strictEqual(R.triangleBonus(W.ironAxe, W.ironLance), 1);
  assert.strictEqual(R.triangleBonus(W.ironLance, W.ironSword), 1);
  assert.strictEqual(R.triangleBonus(W.ironAxe, W.ironSword), -1);
  assert.strictEqual(R.triangleBonus(W.ironSword, W.ironBow), 0);
});

test('魔法の三すくみ：炎＞風＞雷＞炎', () => {
  const W = D.WEAPONS;
  assert.strictEqual(R.triangleBonus(W.fire, W.wind), 1);
  assert.strictEqual(R.triangleBonus(W.wind, W.thunder), 1);
  assert.strictEqual(R.triangleBonus(W.thunder, W.fire), 1);
});

/* ---- ダメージ計算 ----------------------------------------------------- */
test('物理ダメージ＝力＋威力＋相性−（守備＋地形）', () => {
  const ald = player('ald');                       // 力5 / 鉄の剣(威力5)
  const foe = enemy('brigand', 1, ['ironAxe']);    // 守備3
  const plan = R.strikePlan(
    { unit: ald, weapon: D.WEAPONS.ironSword, terrain: flat },
    { unit: foe, weapon: D.WEAPONS.ironAxe, terrain: flat });
  assert.strictEqual(plan.atk, 5 + 5 + 1);         // 相性有利 +1
  assert.strictEqual(plan.dmg, 11 - 3);
});

test('地形の守備補正がダメージを減らす', () => {
  const ald = player('ald');
  const foe = enemy('brigand', 1, ['ironAxe']);
  const onForest = R.strikePlan(
    { unit: ald, weapon: D.WEAPONS.ironSword, terrain: flat },
    { unit: foe, weapon: D.WEAPONS.ironAxe, terrain: { def: 1, avo: 20 } });
  assert.strictEqual(onForest.dmg, 11 - 3 - 1);
  assert.ok(onForest.hit < 100);
});

test('魔法は魔防で軽減される', () => {
  const nova = player('nova');                      // 魔力9 / ファイアー(威力5)
  const armor = enemy('eArmor', 8, ['ironLance']);  // 守備高・魔防0
  const magic = R.strikePlan(
    { unit: nova, weapon: D.WEAPONS.fire, terrain: flat },
    { unit: armor, weapon: D.WEAPONS.ironLance, terrain: flat });
  assert.strictEqual(magic.dmg, 9 + 5 - armor.stats.res);
  assert.ok(magic.dmg > 10, '重装兵には魔法が有効であること');
});

test('弓は飛行ユニットに特効（威力2倍）', () => {
  const linne = player('linne');
  const peg = player('mireille');
  const plain = R.strikePlan(
    { unit: linne, weapon: D.WEAPONS.ironBow, terrain: flat },
    { unit: player('bolus'), weapon: D.WEAPONS.ironAxe, terrain: flat });
  const eff = R.strikePlan(
    { unit: linne, weapon: D.WEAPONS.ironBow, terrain: flat },
    { unit: peg, weapon: D.WEAPONS.slimLance, terrain: flat });
  assert.strictEqual(eff.effective, true);
  assert.strictEqual(plain.effective, false);
  assert.strictEqual(eff.atk - plain.atk, D.WEAPONS.ironBow.mt);
});

test('攻速が4以上高いと追撃できる', () => {
  const shade = player('shade');                    // 速さ19
  const armor = enemy('eArmor', 8, ['steelLance']); // 速さ低
  const fast = R.strikePlan(
    { unit: shade, weapon: D.WEAPONS.slimSword, terrain: flat },
    { unit: armor, weapon: D.WEAPONS.steelLance, terrain: flat });
  const slow = R.strikePlan(
    { unit: armor, weapon: D.WEAPONS.steelLance, terrain: flat },
    { unit: shade, weapon: D.WEAPONS.slimSword, terrain: flat });
  assert.strictEqual(fast.doubles, true);
  assert.strictEqual(slow.doubles, false);
});

test('重い武器は攻速を下げる', () => {
  const bolus = player('bolus');                    // 力8
  const light = R.combatStats({ unit: bolus, weapon: D.WEAPONS.handAxe, terrain: flat }, null);
  const heavy = R.combatStats({ unit: bolus, weapon: D.WEAPONS.steelAxe, terrain: flat }, null);
  assert.ok(heavy.as < light.as);
});

/* ---- 戦闘の解決 ------------------------------------------------------- */
test('射程外の相手からは反撃されない', () => {
  const linne = player('linne');
  const foe = enemy('brigand', 1, ['ironAxe']);     // 射程1
  const fc = R.forecast(
    { unit: linne, weapon: D.WEAPONS.ironBow, terrain: flat },
    { unit: foe, weapon: D.WEAPONS.ironAxe, terrain: flat }, 2);
  assert.strictEqual(fc.counter, null);
});

test('杖は反撃に使えない', () => {
  const sera = player('sera');
  const foe = enemy('brigand', 1, ['ironAxe']);
  const fc = R.forecast(
    { unit: foe, weapon: D.WEAPONS.ironAxe, terrain: flat },
    { unit: sera, weapon: D.WEAPONS.heal, terrain: flat }, 1);
  assert.strictEqual(fc.counter, null);
});

test('戦闘はどちらかが倒れた時点で終わる', () => {
  const rng = new FE.Rng(12345);
  const ald = player('ald');
  const foe = enemy('brigand', 1, ['ironAxe']);
  foe.hp = 1;
  const events = R.resolveCombat(
    { unit: ald, weapon: D.WEAPONS.ironSword, terrain: flat },
    { unit: foe, weapon: D.WEAPONS.ironAxe, terrain: flat }, 1, rng);
  assert.ok(events.length >= 1);
  if (foe.hp <= 0) assert.strictEqual(events[events.length - 1].to, foe);
});

/* ---- 武器の適性 ------------------------------------------------------- */
test('兵種が扱えない武器は装備候補にならない', () => {
  const sera = player('sera');                      // 僧侶＝杖のみ
  sera.weapons.push('silverSword');
  assert.strictEqual(R.canUse(sera, 'silverSword'), false);
  assert.strictEqual(R.bestWeaponIndex(sera, 1), -1);
  assert.deepStrictEqual(R.attackRanges(sera), []);
  assert.deepStrictEqual(R.staffRanges(sera), [1]);
});

/* ---- 経験値・成長 ----------------------------------------------------- */
test('経験値100でレベルアップし、成長率に従って伸びる', () => {
  const rng = new FE.Rng(7);
  const ald = player('ald');
  for (const k of R.STAT_KEYS) ald.growth[k] = 100;  // 必ず伸びる設定
  const ups = R.gainExp(ald, 100, rng);
  assert.strictEqual(ups.length, 1);
  assert.strictEqual(ald.lv, 2);
  assert.strictEqual(ald.stats.str, 6);
  assert.strictEqual(Object.keys(ups[0].gains).length, R.STAT_KEYS.length);
});

test('レベル上限を超えない', () => {
  const rng = new FE.Rng(3);
  const ald = player('ald');
  R.gainExp(ald, 100 * 40, rng);
  assert.strictEqual(ald.lv, R.MAX_LEVEL);
});

test('敵は撃破しても経験値を得ない', () => {
  const rng = new FE.Rng(3);
  const foe = enemy('brigand', 3, ['ironAxe']);
  assert.deepStrictEqual(R.gainExp(foe, 200, rng), []);
});

/* ---- 移動・地形 ------------------------------------------------------- */
test('移動範囲は地形コストを消費し、飛行は川を越えられる', () => {
  const board = new G.Board(D.CHAPTERS[0].map);
  const ald = player('ald');    ald.x = 4; ald.y = 7;
  const peg = player('mireille'); peg.x = 5; peg.y = 7;
  const units = [ald, peg];
  const footRange = G.movementRange(board, ald, units);
  const flyRange = G.movementRange(board, peg, units);
  assert.ok(!footRange.get('4,3'), '徒歩は川の向こうへ届かない');
  assert.ok(flyRange.get('4,3'), '飛行は川を越えられる');
  assert.ok(G.stopTiles(flyRange).length > G.stopTiles(footRange).length);
});

test('城壁はどの移動タイプでも通れない', () => {
  const board = new G.Board(D.CHAPTERS[3].map);
  for (const t of ['foot', 'armor', 'mount', 'flier']) {
    assert.strictEqual(board.passable(0, 0, t), false);
  }
});

test('味方は通り抜けられるが、その上では止まれない', () => {
  const board = new G.Board(['....', '....', '....']);
  const a = player('ald');  a.x = 0; a.y = 0;
  const b = player('bolus'); b.x = 1; b.y = 0;
  const range = G.movementRange(board, a, [a, b]);
  assert.ok(range.get('1,0'), '味方のマスは経路として通れる');
  assert.strictEqual(range.get('1,0').stop, false, '味方のマスでは止まれない');
  assert.ok(range.get('2,0'), '味方の向こう側へ抜けられる');
});

test('敵ユニットは通り抜けられない', () => {
  const board = new G.Board(['...']);
  const a = player('ald');  a.x = 0; a.y = 0;
  const foe = enemy('brigand', 1, ['ironAxe']); foe.x = 1; foe.y = 0;
  const range = G.movementRange(board, a, [a, foe]);
  assert.ok(!range.get('2,0'), '敵を貫通して進めない');
});

test('経路は開始マスから目的地までつながっている', () => {
  const board = new G.Board(D.CHAPTERS[0].map);
  const ald = player('ald'); ald.x = 4; ald.y = 7;
  const range = G.movementRange(board, ald, [ald]);
  const path = G.pathTo(range, 4, 4);
  assert.strictEqual(path[0].x, 4);
  assert.strictEqual(path[0].y, 7);
  assert.deepStrictEqual(path[path.length - 1], { x: 4, y: 4 });
  for (let i = 1; i < path.length; i++) {
    const d = Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
    assert.strictEqual(d, 1, '経路は隣接マスの連続であること');
  }
});

/* ---- 敵AI ------------------------------------------------------------- */
test('待機タイプの敵は、射程外なら動かない', () => {
  const board = new G.Board(D.CHAPTERS[0].map);
  const units = D.CHAPTERS[0].enemies.map((e) => R.makeEnemyUnit(e));
  const ald = player('ald'); ald.x = 4; ald.y = 8;   // 川の手前
  units.push(ald);
  const boss = units.find((u) => u.boss);
  const plan = AI.plan(board, boss, units);
  assert.strictEqual(plan.attack, null);
  assert.deepStrictEqual(plan.move, { x: boss.x, y: boss.y });
});

test('突撃タイプの敵は自軍へ近づく（渡れる橋を回り込む）', () => {
  const board = new G.Board(D.CHAPTERS[0].map);
  const foe = R.makeEnemyUnit({ cls: 'brigand', lv: 3, x: 4, y: 0, weapons: ['ironAxe'], ai: 'charge' });
  const ald = player('ald'); ald.x = 4; ald.y = 7;
  // 直線距離ではなく、実際に歩ける経路の長さで判定する
  const field = AI.distanceField(board, foe, [ald]);
  const cost = (p) => field.get(p.x + ',' + p.y);
  const plan = AI.plan(board, foe, [foe, ald]);
  assert.ok(cost(plan.move) < cost(foe), '経路上の距離が縮まること');
});

test('敵は倒せる相手を優先して狙う', () => {
  const board = new G.Board(['.....', '.....', '.....']);
  const foe = R.makeEnemyUnit({ cls: 'brigand', lv: 5, x: 2, y: 1, weapons: ['ironAxe'], ai: 'charge' });
  const healthy = player('bolus'); healthy.x = 1; healthy.y = 1;
  const weak = player('sera');     weak.x = 3; weak.y = 1; weak.hp = 3;
  const plan = AI.plan(board, foe, [foe, healthy, weak]);
  assert.ok(plan.attack, '攻撃を選ぶこと');
  assert.strictEqual(plan.attack.target, weak, '瀕死の相手を狙うこと');
});

/* ---- 章データの妥当性 ------------------------------------------------- */
test('全章のマップと配置が破綻していない', () => {
  for (const ch of D.CHAPTERS) {
    const w = ch.map[0].length;
    const board = new G.Board(ch.map);
    for (const row of ch.map) {
      assert.strictEqual(row.length, w, '第' + ch.no + '章：行の長さが揃っていること');
      for (const c of row) assert.ok(D.TERRAIN[c], '未定義の地形記号: ' + c);
    }
    for (const [x, y] of ch.start) {
      assert.ok(board.inside(x, y), '第' + ch.no + '章：出撃位置が場外');
      assert.ok(board.passable(x, y, 'foot'), '第' + ch.no + '章：出撃位置が進入不可');
    }
    const all = ch.enemies.concat((ch.reinforcements || []).flatMap((r) => r.units));
    for (const e of all) {
      assert.ok(board.inside(e.x, e.y), '第' + ch.no + '章：敵の配置が場外 ' + e.x + ',' + e.y);
      assert.ok(D.CLASSES[e.cls], '未定義の兵種: ' + e.cls);
      for (const w2 of e.weapons) assert.ok(D.WEAPONS[w2], '未定義の武器: ' + w2);
      if (e.drop) assert.ok(D.ITEMS[e.drop] || D.WEAPONS[e.drop], '未定義のドロップ: ' + e.drop);
      const cls = D.CLASSES[e.cls];
      for (const w2 of e.weapons) {
        assert.ok(cls.weapons.includes(D.WEAPONS[w2].kind),
          '第' + ch.no + '章：' + cls.name + ' が扱えない武器 ' + w2);
      }
    }
    for (const v of ch.villages || []) {
      assert.strictEqual(board.terrainAt(v.x, v.y).id, 'village',
        '第' + ch.no + '章：民家イベントの位置に民家がない');
      assert.ok(D.ITEMS[v.item] || D.WEAPONS[v.item], '未定義の民家アイテム: ' + v.item);
    }
    if (ch.objective.type === 'seize') {
      let thrones = 0;
      board.forEachTile((x, y) => { if (board.isSeizable(x, y)) thrones++; });
      assert.ok(thrones > 0, '第' + ch.no + '章：制圧対象の玉座がない');
    }
    if (ch.objective.type === 'boss') {
      assert.ok(ch.enemies.some((e) => e.boss), '第' + ch.no + '章：撃破対象のボスがいない');
    }
  }
});

test('自軍キャラは自分の兵種で扱える武器を持って加入する', () => {
  for (const c of D.CHARACTERS) {
    const cls = D.CLASSES[c.cls];
    assert.ok(cls, '未定義の兵種: ' + c.cls);
    assert.ok(c.weapons.length > 0, c.name + ' が武器を持っていない');
    for (const w of c.weapons) {
      assert.ok(D.WEAPONS[w], '未定義の武器: ' + w);
      assert.ok(cls.weapons.includes(D.WEAPONS[w].kind), c.name + ' が扱えない武器: ' + w);
    }
    for (const i of c.items) assert.ok(D.ITEMS[i], '未定義の道具: ' + i);
  }
});

test('道具を使うと回復し、使用回数が減る', () => {
  const ald = player('ald');
  ald.hp = 5;
  const res = R.useItem(ald, 0);
  assert.strictEqual(res.kind, 'heal');
  assert.strictEqual(ald.hp, 15);
  assert.strictEqual(ald.items[0].uses, 2);
});

test('能力の雫は永続的に能力を上げ、使い切ると消える', () => {
  const ald = player('ald');
  ald.items = [R.makeItem('doping')];
  const before = ald.stats.str;
  const res = R.useItem(ald, 0);
  assert.strictEqual(res.kind, 'stat');
  assert.strictEqual(ald.stats.str, before + 2);
  assert.strictEqual(ald.items.length, 0);
});
