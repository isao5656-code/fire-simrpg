/* =========================================================================
 *  炎翼の紋章 —— data.js
 *  地形 / 兵種 / 武器 / アイテム / キャラクター / 章（マップ・配置）データ
 * ========================================================================= */
(function (global) {
  'use strict';
  const FE = (global.FE = global.FE || {});

  /* ---------------------------------------------------------------------
   *  地形
   *  cost: 移動タイプ別の消費移動力（99 = 進入不可）
   *  def / avo: 守備補正・回避補正、heal: ターン開始時の回復割合
   * ------------------------------------------------------------------- */
  const TERRAIN = {
    '.': { id: 'plain',  name: '平原', def: 0, avo: 0,  cost: { foot: 1, armor: 1, mount: 1, flier: 1 } },
    ',': { id: 'waste',  name: '荒地', def: 0, avo: 5,  cost: { foot: 2, armor: 2, mount: 2, flier: 1 } },
    'f': { id: 'forest', name: '森',   def: 1, avo: 20, cost: { foot: 2, armor: 2, mount: 3, flier: 1 } },
    'n': { id: 'hill',   name: '丘',   def: 1, avo: 10, cost: { foot: 2, armor: 2, mount: 3, flier: 1 } },
    '^': { id: 'mount',  name: '山',   def: 2, avo: 30, cost: { foot: 4, armor: 99, mount: 99, flier: 1 } },
    '~': { id: 'river',  name: '河',   def: 0, avo: 10, cost: { foot: 5, armor: 99, mount: 99, flier: 1 } },
    '=': { id: 'bridge', name: '橋',   def: 0, avo: 0,  cost: { foot: 1, armor: 1, mount: 1, flier: 1 } },
    '_': { id: 'floor',  name: '城内', def: 0, avo: 0,  cost: { foot: 1, armor: 1, mount: 1, flier: 1 } },
    '+': { id: 'fort',   name: '砦',   def: 2, avo: 20, heal: 0.2, cost: { foot: 2, armor: 2, mount: 2, flier: 2 } },
    'G': { id: 'gate',   name: '城門', def: 2, avo: 15, heal: 0.2, cost: { foot: 1, armor: 1, mount: 1, flier: 1 } },
    'T': { id: 'throne', name: '玉座', def: 3, avo: 30, heal: 0.2, cost: { foot: 1, armor: 1, mount: 1, flier: 1 } },
    'v': { id: 'village', name: '民家', def: 0, avo: 10, cost: { foot: 1, armor: 1, mount: 1, flier: 1 } },
    '#': { id: 'wall',   name: '城壁', def: 0, avo: 0,  cost: { foot: 99, armor: 99, mount: 99, flier: 99 } }
  };

  /* ---------------------------------------------------------------------
   *  武器・道具
   *  triangle: 武器相性の系統 / anima: 魔法三すくみの属性
   * ------------------------------------------------------------------- */
  const WEAPONS = {
    ironSword:   { name: '鉄の剣',       kind: 'sword', mt: 5,  hit: 90, crit: 0,  wt: 5,  min: 1, max: 1 },
    steelSword:  { name: '鋼の剣',       kind: 'sword', mt: 7,  hit: 85, crit: 0,  wt: 9,  min: 1, max: 1 },
    slimSword:   { name: '細身の剣',     kind: 'sword', mt: 4,  hit: 95, crit: 15, wt: 3,  min: 1, max: 1 },
    silverSword: { name: '銀の剣',       kind: 'sword', mt: 10, hit: 85, crit: 5,  wt: 8,  min: 1, max: 1 },
    braveSword:  { name: '炎翼の剣',     kind: 'sword', mt: 11, hit: 90, crit: 15, wt: 7,  min: 1, max: 1 },
    ironLance:   { name: '鉄の槍',       kind: 'lance', mt: 6,  hit: 80, crit: 0,  wt: 7,  min: 1, max: 1 },
    steelLance:  { name: '鋼の槍',       kind: 'lance', mt: 9,  hit: 75, crit: 0,  wt: 12, min: 1, max: 1 },
    slimLance:   { name: '細身の槍',     kind: 'lance', mt: 4,  hit: 85, crit: 10, wt: 4,  min: 1, max: 1 },
    javelin:     { name: '手槍',         kind: 'lance', mt: 5,  hit: 70, crit: 0,  wt: 10, min: 1, max: 2 },
    silverLance: { name: '銀の槍',       kind: 'lance', mt: 11, hit: 78, crit: 0,  wt: 10, min: 1, max: 1 },
    ironAxe:     { name: '鉄の斧',       kind: 'axe',   mt: 7,  hit: 75, crit: 0,  wt: 9,  min: 1, max: 1 },
    steelAxe:    { name: '鋼の斧',       kind: 'axe',   mt: 10, hit: 70, crit: 0,  wt: 14, min: 1, max: 1 },
    handAxe:     { name: '手斧',         kind: 'axe',   mt: 5,  hit: 65, crit: 0,  wt: 11, min: 1, max: 2 },
    ironBow:     { name: '鉄の弓',       kind: 'bow',   mt: 6,  hit: 85, crit: 0,  wt: 7,  min: 2, max: 2, effective: ['flier'] },
    steelBow:    { name: '鋼の弓',       kind: 'bow',   mt: 8,  hit: 80, crit: 0,  wt: 11, min: 2, max: 2, effective: ['flier'] },
    longBow:     { name: '遠射の弓',     kind: 'bow',   mt: 5,  hit: 75, crit: 5,  wt: 9,  min: 2, max: 3, effective: ['flier'] },
    fire:        { name: 'ファイアー',   kind: 'tome',  mt: 5,  hit: 90, crit: 0,  wt: 5,  min: 1, max: 2, magic: true, anima: 'fire' },
    thunder:     { name: 'サンダー',     kind: 'tome',  mt: 7,  hit: 80, crit: 5,  wt: 8,  min: 1, max: 2, magic: true, anima: 'thunder' },
    wind:        { name: 'ウィンド',     kind: 'tome',  mt: 4,  hit: 95, crit: 0,  wt: 4,  min: 1, max: 2, magic: true, anima: 'wind' },
    elfire:      { name: 'エルファイア', kind: 'tome',  mt: 8,  hit: 85, crit: 0,  wt: 9,  min: 1, max: 2, magic: true, anima: 'fire' },
    darkTome:    { name: '闇の書',       kind: 'tome',  mt: 7,  hit: 75, crit: 5,  wt: 10, min: 1, max: 2, magic: true },
    heal:        { name: 'ライブの杖',   kind: 'staff', mt: 0,  hit: 100, crit: 0, wt: 3,  min: 1, max: 1, staff: true, heal: 10 },
    mend:        { name: 'リライブの杖', kind: 'staff', mt: 0,  hit: 100, crit: 0, wt: 5,  min: 1, max: 2, staff: true, heal: 20 },
    darkBlade:   { name: '暗黒の剣',     kind: 'sword', mt: 11, hit: 85, crit: 10, wt: 11, min: 1, max: 1 },
    hero:        { name: '将軍の斧',     kind: 'axe',   mt: 11, hit: 80, crit: 5,  wt: 13, min: 1, max: 1 }
  };

  const ITEMS = {
    vulnerary: { name: '傷薬',       heal: 10, uses: 3, desc: 'HPを10回復（3回）' },
    elixir:    { name: 'エリクサー', heal: 99, uses: 2, desc: 'HPを全回復（2回）' },
    doping:    { name: '力の雫',     stat: 'str', up: 2, uses: 1, desc: '力が永続的に+2' },
    speedwing: { name: '飛燕の羽',   stat: 'spd', up: 2, uses: 1, desc: '速さが永続的に+2' },
    shield:    { name: '守りの盾',   stat: 'def', up: 2, uses: 1, desc: '守備が永続的に+2' }
  };

  /* ---------------------------------------------------------------------
   *  兵種
   *  base = Lv1 相当の基礎値、growth = 成長率(%)（敵ユニットの自動生成にも使用）
   * ------------------------------------------------------------------- */
  const mk = (name, icon, mtype, move, weapons, base, growth) =>
    ({ name, icon, mtype, move, weapons, base, growth });

  const CLASSES = {
    lord:     mk('ロード', '⚔', 'foot', 5, ['sword'],
      { hp: 20, str: 5, mag: 0, skl: 5, spd: 7, lck: 7, def: 6, res: 0 },
      { hp: 80, str: 50, mag: 15, skl: 45, spd: 45, lck: 50, def: 35, res: 25 }),
    paladin:  mk('ソシアルナイト', '♞', 'mount', 7, ['sword', 'lance'],
      { hp: 22, str: 6, mag: 0, skl: 5, spd: 5, lck: 3, def: 7, res: 1 },
      { hp: 75, str: 50, mag: 10, skl: 45, spd: 45, lck: 35, def: 40, res: 20 }),
    pegasus:  mk('ペガサスナイト', '♘', 'flier', 7, ['lance'],
      { hp: 18, str: 4, mag: 2, skl: 6, spd: 9, lck: 6, def: 5, res: 6 },
      { hp: 65, str: 45, mag: 20, skl: 50, spd: 60, lck: 55, def: 25, res: 40 }),
    fighter:  mk('戦士', '⚒', 'foot', 5, ['axe'],
      { hp: 26, str: 7, mag: 0, skl: 4, spd: 5, lck: 3, def: 6, res: 0 },
      { hp: 90, str: 60, mag: 5, skl: 45, spd: 40, lck: 30, def: 35, res: 15 }),
    archer:   mk('アーチャー', '➶', 'foot', 5, ['bow'],
      { hp: 20, str: 5, mag: 0, skl: 8, spd: 8, lck: 5, def: 5, res: 3 },
      { hp: 65, str: 50, mag: 10, skl: 60, spd: 55, lck: 45, def: 25, res: 25 }),
    mage:     mk('魔道士', '✧', 'foot', 5, ['tome'],
      { hp: 19, str: 1, mag: 7, skl: 6, spd: 7, lck: 4, def: 4, res: 7 },
      { hp: 60, str: 10, mag: 60, skl: 45, spd: 50, lck: 35, def: 20, res: 50 }),
    cleric:   mk('僧侶', '✚', 'foot', 5, ['staff'],
      { hp: 18, str: 1, mag: 5, skl: 4, spd: 6, lck: 8, def: 3, res: 6 },
      { hp: 60, str: 15, mag: 50, skl: 40, spd: 45, lck: 60, def: 20, res: 50 }),
    armor:    mk('アーマーナイト', '▣', 'armor', 4, ['lance'],
      { hp: 30, str: 9, mag: 0, skl: 5, spd: 3, lck: 3, def: 12, res: 1 },
      { hp: 95, str: 55, mag: 5, skl: 40, spd: 25, lck: 30, def: 45, res: 15 }),
    swordman: mk('剣士', '†', 'foot', 6, ['sword'],
      { hp: 24, str: 6, mag: 0, skl: 12, spd: 13, lck: 5, def: 5, res: 2 },
      { hp: 70, str: 45, mag: 10, skl: 65, spd: 65, lck: 40, def: 25, res: 25 }),

    /* --- 敵側 --- */
    brigand:  mk('山賊', '⚒', 'foot', 5, ['axe'],
      { hp: 20, str: 5, mag: 0, skl: 3, spd: 4, lck: 0, def: 3, res: 0 },
      { hp: 75, str: 45, mag: 0, skl: 30, spd: 30, lck: 10, def: 20, res: 5 }),
    soldier:  mk('帝国兵', '♟', 'foot', 5, ['lance'],
      { hp: 18, str: 4, mag: 0, skl: 4, spd: 4, lck: 1, def: 4, res: 1 },
      { hp: 65, str: 35, mag: 0, skl: 35, spd: 35, lck: 15, def: 25, res: 15 }),
    mercenary: mk('傭兵', '‡', 'foot', 5, ['sword'],
      { hp: 20, str: 5, mag: 0, skl: 6, spd: 6, lck: 2, def: 4, res: 1 },
      { hp: 65, str: 40, mag: 0, skl: 45, spd: 45, lck: 20, def: 25, res: 15 }),
    eArcher:  mk('弓兵', '➶', 'foot', 5, ['bow'],
      { hp: 16, str: 4, mag: 0, skl: 6, spd: 5, lck: 1, def: 3, res: 2 },
      { hp: 55, str: 40, mag: 0, skl: 50, spd: 45, lck: 15, def: 20, res: 20 }),
    eMage:    mk('魔道士', '✧', 'foot', 5, ['tome'],
      { hp: 16, str: 0, mag: 5, skl: 5, spd: 5, lck: 1, def: 2, res: 6 },
      { hp: 50, str: 0, mag: 45, skl: 45, spd: 45, lck: 15, def: 15, res: 45 }),
    shaman:   mk('呪術師', '☾', 'foot', 5, ['tome'],
      { hp: 18, str: 0, mag: 6, skl: 4, spd: 4, lck: 1, def: 3, res: 8 },
      { hp: 55, str: 0, mag: 45, skl: 40, spd: 35, lck: 15, def: 20, res: 50 }),
    eArmor:   mk('重装兵', '▣', 'armor', 4, ['lance'],
      { hp: 22, str: 7, mag: 0, skl: 3, spd: 2, lck: 0, def: 9, res: 0 },
      { hp: 80, str: 45, mag: 0, skl: 35, spd: 15, lck: 10, def: 30, res: 10 }),
    eKnight:  mk('帝国騎兵', '♞', 'mount', 7, ['sword', 'lance'],
      { hp: 20, str: 5, mag: 0, skl: 5, spd: 5, lck: 1, def: 5, res: 1 },
      { hp: 65, str: 40, mag: 0, skl: 40, spd: 40, lck: 15, def: 25, res: 15 }),
    wyvern:   mk('ドラゴンナイト', '♖', 'flier', 7, ['axe'],
      { hp: 24, str: 6, mag: 0, skl: 5, spd: 5, lck: 1, def: 6, res: 0 },
      { hp: 75, str: 45, mag: 0, skl: 40, spd: 40, lck: 15, def: 30, res: 5 }),
    general:  mk('将軍', '♛', 'armor', 4, ['lance', 'axe'],
      { hp: 26, str: 9, mag: 0, skl: 6, spd: 4, lck: 2, def: 8, res: 3 },
      { hp: 70, str: 40, mag: 0, skl: 45, spd: 25, lck: 20, def: 25, res: 15 }),
    darkKnight: mk('黒騎士', '♚', 'mount', 6, ['sword'],
      { hp: 30, str: 11, mag: 0, skl: 10, spd: 6, lck: 3, def: 9, res: 7 },
      { hp: 70, str: 40, mag: 0, skl: 45, spd: 25, lck: 20, def: 25, res: 25 })
  };

  /* ---------------------------------------------------------------------
   *  自軍キャラクター（joinChapter の章から加入）
   * ------------------------------------------------------------------- */
  const CHARACTERS = [
    {
      id: 'ald', name: 'アルド', cls: 'lord', lv: 1, joinChapter: 0,
      title: 'グラナ辺境伯の子',
      base: { hp: 20, str: 5, mag: 0, skl: 5, spd: 7, lck: 7, def: 6, res: 0 },
      growth: { hp: 80, str: 50, mag: 15, skl: 45, spd: 45, lck: 50, def: 35, res: 25 },
      weapons: ['ironSword'], items: ['vulnerary'],
      bio: '故郷を焼かれた若き領主の子。玉座の制圧は彼にしか行えない。'
    },
    {
      id: 'mireille', name: 'ミレイユ', cls: 'pegasus', lv: 1, joinChapter: 0,
      title: '天馬の斥候',
      base: { hp: 18, str: 4, mag: 2, skl: 6, spd: 9, lck: 6, def: 5, res: 6 },
      growth: { hp: 65, str: 45, mag: 20, skl: 50, spd: 60, lck: 55, def: 25, res: 40 },
      weapons: ['slimLance'], items: [],
      bio: '空を駆け地形を無視して進む。ただし弓には滅法弱い。'
    },
    {
      id: 'bolus', name: 'ボルス', cls: 'fighter', lv: 2, joinChapter: 0,
      title: '辺境の樵',
      base: { hp: 27, str: 8, mag: 0, skl: 5, spd: 5, lck: 3, def: 6, res: 0 },
      growth: { hp: 90, str: 60, mag: 5, skl: 45, spd: 40, lck: 30, def: 35, res: 15 },
      weapons: ['ironAxe', 'handAxe'], items: ['vulnerary'],
      bio: '斧一本で熊を狩る豪傑。手斧を持てば遠間からも殴れる。'
    },
    {
      id: 'sera', name: 'セラ', cls: 'cleric', lv: 1, joinChapter: 0,
      title: '祈りの徒',
      base: { hp: 18, str: 1, mag: 5, skl: 4, spd: 6, lck: 8, def: 3, res: 6 },
      growth: { hp: 60, str: 15, mag: 50, skl: 40, spd: 45, lck: 60, def: 20, res: 50 },
      weapons: ['heal'], items: ['vulnerary'],
      bio: '杖で味方を癒す。回復でも経験値を得られる貴重な後衛。'
    },
    {
      id: 'gareth', name: 'ガレス', cls: 'paladin', lv: 4, joinChapter: 1,
      title: '流浪の騎兵',
      base: { hp: 26, str: 8, mag: 0, skl: 7, spd: 7, lck: 4, def: 9, res: 2 },
      growth: { hp: 75, str: 50, mag: 10, skl: 45, spd: 45, lck: 35, def: 40, res: 20 },
      weapons: ['ironSword', 'ironLance'], items: ['vulnerary'],
      bio: '剣と槍を持ち替えて戦う騎兵。移動7は戦線の要。'
    },
    {
      id: 'linne', name: 'リンネ', cls: 'archer', lv: 3, joinChapter: 1,
      title: '古城の狩人',
      base: { hp: 21, str: 6, mag: 0, skl: 9, spd: 9, lck: 6, def: 5, res: 3 },
      growth: { hp: 65, str: 50, mag: 10, skl: 60, spd: 55, lck: 45, def: 25, res: 25 },
      weapons: ['ironBow'], items: [],
      bio: '射程2からの一方的な攻撃が持ち味。飛行ユニットには3倍の特効。'
    },
    {
      id: 'nova', name: 'ノヴァ', cls: 'mage', lv: 5, joinChapter: 2,
      title: '塔の魔道士',
      base: { hp: 21, str: 1, mag: 9, skl: 7, spd: 9, lck: 5, def: 4, res: 9 },
      growth: { hp: 60, str: 10, mag: 60, skl: 45, spd: 50, lck: 35, def: 20, res: 50 },
      weapons: ['fire', 'wind'], items: ['vulnerary'],
      bio: '守備の硬い重装兵を、魔防の低さごと撃ち抜く切り札。'
    },
    {
      id: 'dorga', name: 'ドルガ', cls: 'armor', lv: 7, joinChapter: 3,
      title: '鉄壁の門番',
      base: { hp: 35, str: 12, mag: 0, skl: 7, spd: 4, lck: 4, def: 14, res: 2 },
      growth: { hp: 95, str: 55, mag: 5, skl: 40, spd: 25, lck: 30, def: 45, res: 15 },
      weapons: ['steelLance', 'javelin'], items: ['vulnerary'],
      bio: '遅いが硬い。狭い城門をひとりで塞げる盾。'
    },
    {
      id: 'shade', name: 'シェイド', cls: 'swordman', lv: 9, joinChapter: 4,
      title: '峠の剣鬼',
      base: { hp: 29, str: 10, mag: 0, skl: 17, spd: 19, lck: 7, def: 7, res: 4 },
      growth: { hp: 70, str: 45, mag: 10, skl: 65, spd: 65, lck: 40, def: 25, res: 25 },
      weapons: ['slimSword'], items: ['vulnerary'],
      bio: '技と速さに優れ、必殺と追撃で敵陣を切り裂く。'
    }
  ];

  /* ---------------------------------------------------------------------
   *  章データ
   *  objective: rout（全滅）/ boss（敵将撃破）/ seize（玉座制圧）/ survive（N ターン生存）
   *  ai: charge（常に前進）/ aggro（射程に入ると起動）/ guard（その場で迎撃）/ boss
   * ------------------------------------------------------------------- */
  const e = (cls, lv, x, y, weapons, ai, opt) =>
    Object.assign({ cls, lv, x, y, weapons, ai: ai || 'aggro' }, opt || {});

  const CHAPTERS = [
    {
      no: 1, title: '辺境の狼煙', roman: 'I',
      objective: { type: 'rout' },
      objectiveText: '敵の全滅',
      story: 'グラナ辺境の空に、帝国の狼煙が上がった。館を焼かれた若きアルドは、はじめて剣の柄を握る。' +
             '川向こうの山賊は帝国が放った先兵——ここで退けねば、村は灰になる。',
      brief: '川を渡る道は橋ひとつ。渡り切る前に、対岸から一人ずつ迎え撃つのが定石だ。',
      map: [
        '^^f...ff...^',
        '^.f..v...f.^',
        '..~~~~~=~...',
        '...~~~~=....',
        'f..........f',
        '.f...+....f.',
        '..f.....f...',
        '^..f.....f.^',
        '^^....^..^^^'
      ],
      start: [[4, 7], [5, 7], [3, 7], [6, 7], [4, 8], [5, 8], [3, 8], [6, 8], [2, 7]],
      villages: [{ x: 5, y: 1, item: 'steelSword', text: '村人「亡き旦那様の剣です。どうかお持ちください」' }],
      enemies: [
        e('brigand', 2, 2, 1, ['ironAxe'], 'aggro'),
        e('brigand', 2, 8, 1, ['ironAxe'], 'aggro'),
        e('brigand', 3, 7, 0, ['handAxe'], 'aggro'),
        e('mercenary', 2, 9, 2, ['ironSword'], 'aggro'),
        e('brigand', 3, 4, 0, ['ironAxe'], 'charge'),
        e('brigand', 4, 7, 1, ['ironAxe'], 'boss',
          { name: 'ガザック', boss: true, bonus: { hp: 6, str: 2, def: 1 }, drop: 'steelAxe',
            quote: '「小僧、その首、俺の手柄にしてやる！」' })
      ]
    },
    {
      no: 2, title: '霧深き古城', roman: 'II',
      objective: { type: 'boss' },
      objectiveText: '敵将バルガスの撃破',
      story: '森を抜けた一行の前に、霧をまとう古城がそびえる。城には帝国の門将バルガスが陣取り、' +
             '捕らえた者たちを人質にしていた。門を破り、将を討て。',
      brief: '城門は敵将の守り。弓兵は射程2から一方的に攻撃してくる——森に隠れて距離を詰めろ。',
      map: [
        '#_____T_____#',
        '#___________#',
        '##__##GG##__#',
        ',,,,,....,,,,',
        '.f.,,...,,.f.',
        '..f......f...',
        'f...+...+...f',
        '.f.........f.',
        '..f...v...f..',
        'f....f.f....f'
      ],
      start: [[6, 9], [5, 9], [7, 9], [4, 9], [8, 9], [3, 9], [9, 9], [2, 9], [10, 9]],
      recruits: ['gareth', 'linne'],
      villages: [{ x: 6, y: 8, item: 'doping', text: '老人「力の雫じゃ。城の連中に思い知らせてやれ」' }],
      enemies: [
        e('soldier', 4, 3, 4, ['ironLance'], 'aggro'),
        e('soldier', 4, 9, 4, ['ironLance'], 'aggro'),
        e('eArcher', 4, 4, 3, ['ironBow'], 'aggro'),
        e('eArcher', 4, 8, 3, ['ironBow'], 'aggro'),
        e('mercenary', 5, 6, 3, ['ironSword'], 'charge', { drop: 'steelSword' }),
        e('eMage', 4, 2, 1, ['fire'], 'aggro'),
        e('soldier', 5, 6, 2, ['ironLance'], 'guard'),
        e('soldier', 5, 7, 2, ['ironLance'], 'guard'),
        e('general', 5, 6, 0, ['steelLance'], 'boss',
          { name: 'バルガス', boss: true, bonus: { hp: 4 }, drop: 'steelLance',
            quote: '「この門は蟻一匹通さぬ。撃ち落とせ！」' })
      ]
    },
    {
      no: 3, title: '竜鱗の渡し', roman: 'III',
      objective: { type: 'boss' },
      objectiveText: '敵将ケルドの撃破',
      story: '大河ドラグネスを越えねば王都へは届かない。渡し場には帝国のドラゴンナイトが待ち構え、' +
             '空から橋を睨んでいた。渡河は、命懸けの綱渡りになる。',
      brief: '橋は二本。飛行兵は川を無視して飛ぶ——弓の特効を忘れるな。',
      map: [
        '^^f.....f..^^',
        '^..+.....+..^',
        '.....v...v...',
        '~~~~=~~~~=~~~',
        '~~~~=~~~~=~~~',
        '..f.......f..',
        '.n.......n...',
        'f...+...+...f',
        '.f.........f.',
        '^..f.....f..^'
      ],
      start: [[4, 8], [9, 8], [3, 8], [8, 8], [5, 8], [10, 8], [4, 9], [8, 9], [6, 8]],
      recruits: ['nova'],
      villages: [
        { x: 5, y: 2, item: 'speedwing', text: '渡し守「飛燕の羽じゃ。速さは命を救うぞ」' },
        { x: 9, y: 2, item: 'vulnerary', text: '女「無事に帰ってくださいね……」' }
      ],
      enemies: [
        e('soldier', 6, 4, 2, ['ironLance'], 'aggro'),
        e('soldier', 6, 9, 2, ['ironLance'], 'aggro'),
        e('eArcher', 6, 3, 1, ['steelBow'], 'guard', { drop: 'steelBow' }),
        e('eArcher', 6, 9, 1, ['steelBow'], 'guard'),
        e('wyvern', 6, 2, 0, ['handAxe'], 'charge'),
        e('wyvern', 6, 10, 0, ['handAxe'], 'charge'),
        e('eMage', 6, 7, 1, ['fire'], 'aggro'),
        e('eKnight', 7, 5, 0, ['ironLance'], 'aggro'),
        e('wyvern', 8, 6, 0, ['steelAxe'], 'boss',
          { name: 'ケルド', boss: true, bonus: { hp: 6, spd: 2 }, drop: 'silverLance',
            quote: '「羽虫が。竜の顎で噛み砕いてやろう」' })
      ],
      reinforcements: [
        { turn: 4, units: [e('soldier', 6, 0, 0, ['javelin'], 'charge'), e('soldier', 6, 12, 0, ['javelin'], 'charge')] }
      ]
    },
    {
      no: 4, title: '黒鋼の要塞', roman: 'IV',
      objective: { type: 'seize' },
      objectiveText: '玉座の制圧（アルドで玉座へ）',
      story: '王都への最後の関門、黒鋼の要塞。分厚い壁に守られた内部は、重装兵の巣だった。' +
             '門番ドルガは、囚われた民を見かねて刃を返す。',
      brief: '入口は南の城門ひとつ。硬い重装兵には魔道士のノヴァを当てろ。制圧はアルドだけが行える。',
      map: [
        '#####__T__####',
        '#____________#',
        '#__##____##__#',
        '#____________#',
        '#__##____##__#',
        '#____________#',
        '####GGGG######',
        ',,,,.....,,,,,',
        ',f,,.....,,f,,',
        ',,,+,,,,,+,,,,'
      ],
      start: [[5, 8], [6, 8], [4, 8], [7, 8], [5, 9], [6, 9], [4, 9], [7, 9], [8, 8]],
      recruits: ['dorga'],
      enemies: [
        e('eArmor', 8, 5, 5, ['ironLance'], 'guard'),
        e('eArmor', 8, 6, 5, ['ironLance'], 'guard'),
        e('soldier', 8, 3, 5, ['javelin'], 'aggro'),
        e('soldier', 8, 8, 5, ['javelin'], 'aggro'),
        e('eArcher', 8, 2, 3, ['steelBow'], 'aggro'),
        e('eArcher', 8, 9, 3, ['steelBow'], 'aggro'),
        e('shaman', 8, 4, 1, ['darkTome'], 'aggro'),
        e('shaman', 8, 8, 1, ['darkTome'], 'aggro'),
        e('eArmor', 9, 5, 1, ['steelLance'], 'guard', { drop: 'shield' }),
        e('eArmor', 9, 7, 1, ['steelLance'], 'guard'),
        e('general', 10, 7, 0, ['hero'], 'boss',
          { name: 'ゴルドー', boss: true, bonus: { hp: 6, def: 2, res: 2 }, drop: 'silverSword',
            quote: '「鉄より硬き我が守り、貴様らの鈍らで砕けるか」' })
      ],
      reinforcements: [
        { turn: 4, units: [e('soldier', 8, 5, 9, ['ironLance'], 'charge'), e('soldier', 8, 9, 9, ['ironLance'], 'charge')] }
      ]
    },
    {
      no: 5, title: '白銀の峠', roman: 'V',
      objective: { type: 'survive', turns: 8 },
      objectiveText: '8ターンの生存',
      story: '雪の峠で、一行は挟撃を受けた。援軍が谷を抜けるまで、この吹きさらしの砦を守り抜くしかない。' +
             '峠に潜んでいた剣鬼シェイドが、なぜか味方として刃を並べる。',
      brief: '守りきれば勝ち。砦（+）に立てば守備+2、毎ターンHPが回復する。無理に前へ出るな。',
      map: [
        '^^^^^^^^^^^^^',
        '^^..^^...^^^^',
        '^..n....n..^^',
        '^.n......n..^',
        '.n..,,,,,..n.',
        '...,,,+,,,...',
        '.n..,,,,,..n.',
        '^..n.....n..^',
        '^^.n.....n.^^',
        '^^^^^^^^^^^^^'
      ],
      start: [[6, 5], [5, 5], [7, 5], [6, 4], [6, 6], [5, 4], [7, 6], [5, 6], [7, 4]],
      recruits: ['shade'],
      enemies: [
        e('mercenary', 9, 1, 4, ['steelSword'], 'charge', { drop: 'elixir' }),
        e('mercenary', 9, 11, 6, ['steelSword'], 'charge', { drop: 'silverSword' }),
        e('eArcher', 9, 0, 5, ['steelBow'], 'charge'),
        e('eArcher', 9, 12, 5, ['steelBow'], 'charge'),
        e('eMage', 9, 2, 2, ['elfire'], 'charge', { drop: 'elfire' }),
        e('eMage', 9, 10, 2, ['elfire'], 'charge')
      ],
      reinforcements: [
        { turn: 2, units: [e('soldier', 9, 2, 1, ['steelLance'], 'charge'), e('soldier', 9, 9, 1, ['steelLance'], 'charge')] },
        { turn: 3, units: [e('wyvern', 9, 4, 1, ['steelAxe'], 'charge'), e('wyvern', 9, 8, 1, ['steelAxe'], 'charge')] },
        { turn: 5, units: [e('eKnight', 10, 0, 4, ['silverLance'], 'charge'), e('eKnight', 10, 12, 6, ['silverLance'], 'charge')] },
        { turn: 6, units: [e('mercenary', 10, 3, 8, ['steelSword'], 'charge'), e('mercenary', 10, 9, 8, ['steelSword'], 'charge')] }
      ]
    },
    {
      no: 6, title: '王都奪還', roman: 'VI',
      objective: { type: 'seize' },
      objectiveText: '玉座の制圧（アルドで玉座へ）',
      story: 'ついに王都セレネ。玉座に座するのは、かつて父の友であった黒騎士ヴァルド。' +
             '炎翼の紋章が、アルドの剣に灯る。奪われた祖国の光を、この手に取り戻せ。',
      brief: '最終決戦。黒騎士は玉座で回復し、すべてを迎え撃つ。回復役を守り、包囲して押し切れ。',
      map: [
        '######_T_######',
        '#####_____#####',
        '###_________###',
        '#__##_____##__#',
        '#___##GGG##___#',
        '#_____________#',
        '####_______####',
        ',,,,.......,,,,',
        ',,f,,.....,,f,,',
        ',,,,+,,,,,+,,,,',
        ',f,,,,,,,,,,,f,'
      ],
      start: [[7, 9], [6, 9], [8, 9], [5, 9], [9, 9], [7, 10], [6, 10], [8, 10], [4, 9]],
      enemies: [
        e('eArmor', 10, 6, 6, ['steelLance'], 'guard'),
        e('eArmor', 10, 8, 6, ['steelLance'], 'guard'),
        e('mercenary', 10, 4, 7, ['steelSword'], 'aggro'),
        e('mercenary', 10, 10, 7, ['steelSword'], 'aggro'),
        e('eArcher', 10, 5, 5, ['longBow'], 'guard'),
        e('eArcher', 10, 9, 5, ['longBow'], 'guard'),
        e('shaman', 11, 3, 3, ['darkTome'], 'aggro', { drop: 'elixir' }),
        e('shaman', 11, 11, 3, ['darkTome'], 'aggro'),
        e('eKnight', 11, 5, 2, ['silverLance'], 'aggro'),
        e('eKnight', 11, 9, 2, ['silverLance'], 'aggro'),
        e('eArmor', 12, 6, 1, ['silverLance'], 'guard'),
        e('eArmor', 12, 8, 1, ['silverLance'], 'guard'),
        e('darkKnight', 14, 7, 0, ['darkBlade'], 'boss',
          { name: 'ヴァルド', boss: true, bonus: { hp: 10, def: 1 }, drop: 'braveSword',
            quote: '「アルド……父の仇を討ちに来たか。ならば、その覚悟を見せてみよ」' })
      ],
      reinforcements: [
        { turn: 4, units: [e('soldier', 10, 0, 7, ['javelin'], 'charge'), e('soldier', 10, 14, 7, ['javelin'], 'charge')] },
        { turn: 7, units: [e('wyvern', 11, 2, 10, ['steelAxe'], 'charge'), e('wyvern', 11, 12, 10, ['steelAxe'], 'charge')] }
      ]
    }
  ];

  const EPILOGUE =
    '黒騎士ヴァルドは玉座に崩れ落ち、王都セレネに朝の光が差した。\n' +
    'アルドの剣に灯った炎翼の紋章は、失われた盟約が再び結ばれた証だという。\n' +
    '——戦は終わった。焼けた辺境に、人々が帰ってくる。';

  FE.data = { TERRAIN, WEAPONS, ITEMS, CLASSES, CHARACTERS, CHAPTERS, EPILOGUE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
