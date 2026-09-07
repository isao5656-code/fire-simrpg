/* =========================================================================
 *  炎翼の紋章 —— game.js
 *  ゲーム進行の状態機械。描画・演出は view（ui.js）へ委譲する。
 * ========================================================================= */
(function (global) {
  'use strict';
  const FE = (global.FE = global.FE || {});
  const D = FE.data;
  const R = FE.rules;
  const G = FE.grid;
  const AI = FE.ai;
  const key = FE.util.key;
  const manhattan = FE.util.manhattan;

  const SAVE_KEY = 'enyoku-no-monsho-save-v1';

  class Game {
    constructor(view) {
      this.view = view;
      this.rng = new FE.Rng();
      this.roster = [];
      this.chapterIndex = 0;
      this.cleared = 0;
      this.state = this.blankState();
    }

    blankState() {
      return {
        phase: 'player', turn: 1, mode: 'idle',
        sel: null, range: null, moveTiles: [], threat: new Set(),
        origin: null, menu: null, targets: [], targetIdx: 0,
        cursor: { x: 0, y: 0 }, danger: false, over: false
      };
    }

    /* =================================================================
     *  セーブ / ロード
     * ================================================================= */
    hasSave() {
      try { return !!global.localStorage && !!localStorage.getItem(SAVE_KEY); }
      catch (e) { return false; }
    }
    save() {
      try {
        if (!global.localStorage) return;
        localStorage.setItem(SAVE_KEY, JSON.stringify({
          chapterIndex: this.chapterIndex,
          cleared: this.cleared,
          roster: this.roster.map((u) => ({
            id: u.id, lv: u.lv, exp: u.exp, stats: u.stats, hp: u.hp,
            weapons: u.weapons, equipped: u.equipped, items: u.items, dead: !!u.dead
          }))
        }));
      } catch (e) { /* プライベートモード等では黙って諦める */ }
    }
    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        const s = JSON.parse(raw);
        this.chapterIndex = s.chapterIndex || 0;
        this.cleared = s.cleared || 0;
        R.resetUid();
        this.roster = s.roster.map((sv) => {
          const def = D.CHARACTERS.find((c) => c.id === sv.id);
          const u = R.makePlayerUnit(def);
          Object.assign(u, {
            lv: sv.lv, exp: sv.exp, stats: sv.stats, hp: sv.hp,
            weapons: sv.weapons, equipped: sv.equipped || 0, items: sv.items, dead: !!sv.dead
          });
          return u;
        });
        return true;
      } catch (e) { return false; }
    }
    clearSave() {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* noop */ }
    }

    /* =================================================================
     *  章の開始
     * ================================================================= */
    newGame() {
      R.resetUid();
      this.roster = [];
      this.chapterIndex = 0;
      this.cleared = 0;
      this.clearSave();
      return this.startChapter(0);
    }

    continueGame() {
      if (!this.load()) return this.newGame();
      return this.startChapter(this.chapterIndex);
    }

    /** 加入イベント：その章までに仲間になるキャラを roster に追加 */
    recruitFor(index) {
      const joined = [];
      for (const c of D.CHARACTERS) {
        if (c.joinChapter > index) continue;
        if (this.roster.some((u) => u.id === c.id)) continue;
        this.roster.push(R.makePlayerUnit(c));
        joined.push(c);
      }
      return joined;
    }

    async startChapter(index) {
      this.chapterIndex = index;
      const ch = D.CHAPTERS[index];
      const joined = this.recruitFor(index);

      // 章開始時点の状態を控えておく（やり直し用）
      this.snapshot = JSON.stringify(this.roster.map((u) => ({
        id: u.id, lv: u.lv, exp: u.exp, stats: u.stats, hp: u.stats.hp,
        weapons: u.weapons, equipped: u.equipped, items: u.items, dead: !!u.dead
      })));
      this.save();

      await this.view.showBriefing(ch, this.roster.filter((u) => !u.dead), joined);
      this.deploy(ch);
      this.state = this.blankState();
      this.state.cursor = { x: this.units[0].x, y: this.units[0].y };
      this.view.buildMap(this.board, ch);
      this.view.redraw();
      if (ch.story) await this.view.dialog(ch.title, ch.story);
      await this.beginPlayerPhase(true);
    }

    /** 章のやり直し（roster を章開始時点へ巻き戻す） */
    async retryChapter() {
      if (this.snapshot) {
        const saved = JSON.parse(this.snapshot);
        R.resetUid();
        this.roster = saved.map((sv) => {
          const def = D.CHARACTERS.find((c) => c.id === sv.id);
          const u = R.makePlayerUnit(def);
          Object.assign(u, {
            lv: sv.lv, exp: sv.exp, stats: sv.stats, hp: sv.hp,
            weapons: sv.weapons, equipped: sv.equipped || 0, items: sv.items, dead: !!sv.dead
          });
          return u;
        });
      }
      await this.startChapter(this.chapterIndex);
    }

    deploy(ch) {
      this.board = new G.Board(ch.map);
      this.chapter = ch;
      this.villages = (ch.villages || []).map((v) => Object.assign({}, v, { visited: false }));
      this.pendingReinforcements = (ch.reinforcements || []).map((r) => Object.assign({}, r, { done: false }));

      const alive = this.roster.filter((u) => !u.dead);
      alive.forEach((u, i) => {
        const pos = ch.start[Math.min(i, ch.start.length - 1)];
        u.x = pos[0]; u.y = pos[1];
        u.hp = u.stats.hp;
        u.acted = false;
        u.equipped = Math.min(u.equipped, Math.max(0, u.weapons.length - 1));
      });
      // 配置が重なった場合は空きマスへずらす
      alive.forEach((u) => {
        while (alive.some((o) => o !== u && o.x === u.x && o.y === u.y)) {
          const spot = this.freeTileNear(u.x, u.y, alive);
          u.x = spot.x; u.y = spot.y;
        }
      });

      this.enemies = ch.enemies.map((e) => R.makeEnemyUnit(e));
      this.units = alive.concat(this.enemies);
      this.bossQuoted = false;
    }

    freeTileNear(x, y, units) {
      for (let r = 1; r < 12; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) + Math.abs(dy) !== r) continue;
            const nx = x + dx, ny = y + dy;
            if (!this.board.inside(nx, ny)) continue;
            if (!this.board.passable(nx, ny, 'foot')) continue;
            if ((units || this.units).some((u) => u.hp > 0 && u.x === nx && u.y === ny)) continue;
            return { x: nx, y: ny };
          }
        }
      }
      return { x, y };
    }

    /* =================================================================
     *  フェイズ進行
     * ================================================================= */
    livingPlayers() { return this.units.filter((u) => u.team === 'player' && u.hp > 0); }
    livingEnemies() { return this.units.filter((u) => u.team === 'enemy' && u.hp > 0); }
    unitAt(x, y) { return this.units.find((u) => u.hp > 0 && u.x === x && u.y === y); }

    async beginPlayerPhase(first) {
      this.state.phase = 'player';
      this.state.mode = 'idle';
      this.clearSelection();
      this.livingPlayers().forEach((u) => { u.acted = false; });
      if (!first) this.applyTerrainHeal('player');
      await this.spawnReinforcements();
      this.view.redraw();
      FE.audio.play('phase');
      await this.view.banner('PLAYER PHASE', '自軍の行動', 'player');
      this.view.log('ユニットを選んで行動させよう。');
      this.checkObjective();
    }

    applyTerrainHeal(team) {
      for (const u of this.units) {
        if (u.team !== team || u.hp <= 0) continue;
        const t = this.board.modsAt(u.x, u.y);
        if (t.heal) {
          const amount = Math.ceil(u.stats.hp * t.heal);
          const done = R.applyHeal(u, amount);
          if (done > 0) this.view.floatText(u, '+' + done, 'heal');
        }
      }
    }

    async spawnReinforcements() {
      for (const wave of this.pendingReinforcements) {
        if (wave.done || wave.turn !== this.state.turn) continue;
        wave.done = true;
        for (const entry of wave.units) {
          const u = R.makeEnemyUnit(entry);
          if (this.unitAt(u.x, u.y)) {
            const spot = this.freeTileNear(u.x, u.y);
            u.x = spot.x; u.y = spot.y;
          }
          this.units.push(u);
        }
        this.view.redraw();
        this.view.log('⚑ 敵の増援が現れた！');
        await this.view.banner('REINFORCEMENTS', '敵の増援', 'enemy');
      }
    }

    async endPlayerPhase() {
      if (this.state.phase !== 'player' || this.state.over) return;
      if (this.state.mode === 'busy') return;
      this.clearSelection();
      this.state.phase = 'enemy';
      this.state.mode = 'busy';
      this.view.redraw();
      FE.audio.play('phase');
      await this.view.banner('ENEMY PHASE', '帝国軍の進撃', 'enemy');
      this.applyTerrainHeal('enemy');
      await this.enemyPhase();
      if (this.state.over) return;
      this.state.turn++;
      this.view.setTurn(this.state.turn);
      if (this.checkObjective()) return;
      await this.beginPlayerPhase(false);
    }

    async enemyPhase() {
      const order = this.livingEnemies().slice().sort((a, b) => {
        const rank = (u) => (u.ai === 'charge' ? 0 : u.ai === 'aggro' ? 1 : 2);
        return rank(a) - rank(b);
      });
      for (const e of order) {
        if (this.state.over) return;
        if (e.hp <= 0) continue;
        if (!this.livingPlayers().length) break;
        const plan = AI.plan(this.board, e, this.units);
        if (plan.idle && plan.move.x === e.x && plan.move.y === e.y && !plan.attack) continue;

        this.view.focus(e);
        if (plan.move.x !== e.x || plan.move.y !== e.y) {
          const range = G.movementRange(this.board, e, this.units);
          const path = G.pathTo(range, plan.move.x, plan.move.y) || [{ x: e.x, y: e.y }, plan.move];
          await this.view.animateMove(e, path);
          e.x = plan.move.x; e.y = plan.move.y;
        }
        if (plan.attack) {
          e.equipped = plan.attack.weaponIdx;
          await this.battle(e, plan.attack.target);
          if (this.checkObjective()) return;
        }
        this.view.redraw();
      }
    }

    /* =================================================================
     *  自軍の操作
     * ================================================================= */
    clearSelection() {
      const s = this.state;
      s.sel = null; s.range = null; s.moveTiles = []; s.threat = new Set();
      s.origin = null; s.menu = null; s.targets = []; s.targetIdx = 0;
      if (s.mode !== 'busy') s.mode = 'idle';
    }

    selectUnit(u) {
      const s = this.state;
      if (s.mode === 'busy' || s.phase !== 'player') return;
      s.sel = u;
      s.origin = { x: u.x, y: u.y };
      s.range = G.movementRange(this.board, u, this.units);
      s.moveTiles = G.stopTiles(s.range);
      s.threat = G.threatSet(this.board, s.range, R.attackRanges(u));
      s.mode = u.team === 'player' && !u.acted ? 'move' : 'inspect';
      s.cursor = { x: u.x, y: u.y };
      FE.audio.play('select');
      this.view.redraw();
    }

    /** マップのマスがクリック（または決定キーで確定）されたとき */
    async clickTile(x, y) {
      const s = this.state;
      if (s.mode === 'busy' || s.over || s.phase !== 'player') return;
      s.cursor = { x, y };
      const target = this.unitAt(x, y);

      if (s.mode === 'attack') {
        const t = s.targets.find((u) => u.x === x && u.y === y);
        if (t) return this.confirmAttack(t);
        return this.backToMenu();
      }
      if (s.mode === 'staff') {
        const t = s.targets.find((u) => u.x === x && u.y === y);
        if (t) return this.confirmStaff(t);
        return this.backToMenu();
      }
      if (s.mode === 'menu') {
        // コマンド選択中は地図の操作を受け付けない（取り消しは Esc / 右クリック）
        this.view.log('コマンドを選んでください。（Esc または右クリックで取り消し）');
        return;
      }

      if (s.mode === 'move' && s.sel && s.sel.team === 'player' && !s.sel.acted) {
        const node = s.range.get(key(x, y));
        if (node && node.stop) {
          const path = G.pathTo(s.range, x, y);
          s.mode = 'busy';
          this.view.redraw();
          await this.view.animateMove(s.sel, path);
          s.sel.x = x; s.sel.y = y;
          this.openMenu();
          return;
        }
        // 移動範囲外を押したら選択し直し
      }
      if (target) this.selectUnit(target);
      else { this.clearSelection(); this.view.redraw(); }
    }

    /* ---- コマンドメニュー ------------------------------------------- */
    openMenu() {
      const s = this.state;
      const u = s.sel;
      const items = [];
      const foes = this.attackableFrom(u, u.x, u.y);
      if (foes.length) items.push({ id: 'attack', label: '攻撃' });
      const allies = this.staffTargetsFrom(u, u.x, u.y);
      if (allies.length) items.push({ id: 'staff', label: '杖' });
      const village = this.villages.find((v) => !v.visited && v.x === u.x && v.y === u.y);
      if (village) items.push({ id: 'visit', label: '訪問' });
      if (this.chapter.objective.type === 'seize' && this.board.isSeizable(u.x, u.y) && u.id === 'ald') {
        items.push({ id: 'seize', label: '制圧' });
      }
      if (u.items.length) items.push({ id: 'item', label: '道具' });
      if (u.weapons.filter((w) => R.canUse(u, w)).length > 1) items.push({ id: 'equip', label: '装備' });
      items.push({ id: 'wait', label: '待機' });
      s.menu = { items, index: 0 };
      s.mode = 'menu';
      this.view.redraw();
    }

    backToMenu() {
      const s = this.state;
      s.targets = []; s.targetIdx = 0;
      this.openMenu();
    }

    attackableFrom(u, x, y) {
      const ranges = R.attackRanges(u);
      if (!ranges.length) return [];
      return this.units.filter((t) => t.hp > 0 && t.team !== u.team &&
        ranges.includes(Math.abs(t.x - x) + Math.abs(t.y - y)));
    }

    staffTargetsFrom(u, x, y) {
      const ranges = R.staffRanges(u);
      if (!ranges.length) return [];
      return this.units.filter((t) => t.hp > 0 && t.team === u.team && t !== u &&
        t.hp < t.stats.hp && ranges.includes(Math.abs(t.x - x) + Math.abs(t.y - y)));
    }

    async command(id) {
      const s = this.state;
      const u = s.sel;
      if (!u || s.mode === 'busy') return;
      switch (id) {
        case 'attack':
          s.targets = this.attackableFrom(u, u.x, u.y);
          s.targetIdx = 0;
          s.mode = 'attack';
          s.menu = null;
          this.view.redraw();
          break;
        case 'staff':
          s.targets = this.staffTargetsFrom(u, u.x, u.y);
          s.targetIdx = 0;
          s.mode = 'staff';
          s.menu = null;
          this.view.redraw();
          break;
        case 'visit':
          await this.visitVillage(u);
          break;
        case 'seize':
          await this.seize(u);
          break;
        case 'item':
          s.menu = {
            items: u.items.map((it, i) => ({ id: 'use:' + i, label: D.ITEMS[it.key].name + '（' + it.uses + '）' }))
              .concat([{ id: 'back', label: 'もどる' }]),
            index: 0
          };
          this.view.redraw();
          break;
        case 'equip':
          s.menu = {
            items: u.weapons.map((w, i) => ({ w: w, i: i }))
              .filter((entry) => R.canUse(u, entry.w))
              .map((entry) => ({
                id: 'eq:' + entry.i,
                label: (entry.i === u.equipped ? '▶ ' : '　') + D.WEAPONS[entry.w].name
              })).concat([{ id: 'back', label: 'もどる' }]),
            index: 0
          };
          this.view.redraw();
          break;
        case 'back':
          this.openMenu();
          break;
        case 'wait':
          this.finishUnit(u);
          break;
        default:
          if (id.startsWith('use:')) {
            const slot = +id.slice(4);
            const item = u.items[slot];
            const name = D.ITEMS[item.key].name;
            const res = R.useItem(u, slot);
            FE.audio.play(res.kind === 'heal' ? 'heal' : 'item');
            if (res.kind === 'heal') {
              this.view.floatText(u, '+' + res.value, 'heal');
              this.view.log(u.name + ' は ' + name + ' を使った。ＨＰが ' + res.value + ' 回復。');
            } else {
              this.view.floatText(u, R.STAT_LABEL[res.stat] + '+' + res.value, 'heal');
              this.view.log(u.name + ' は ' + name + ' を使った。' + R.STAT_LABEL[res.stat] + 'が ' + res.value + ' 上がった！');
            }
            this.finishUnit(u);
          } else if (id.startsWith('eq:')) {
            u.equipped = +id.slice(3);
            FE.audio.play('select');
            this.view.log(u.name + ' は ' + D.WEAPONS[u.weapons[u.equipped]].name + ' を装備した。');
            this.openMenu();
          }
      }
    }

    cancel() {
      const s = this.state;
      if (s.mode === 'busy' || s.over) return;
      if (s.mode === 'attack' || s.mode === 'staff') { this.backToMenu(); FE.audio.play('cancel'); return; }
      if (s.mode === 'menu') {
        // 移動前の位置へ戻す
        if (s.sel && s.origin) { s.sel.x = s.origin.x; s.sel.y = s.origin.y; }
        FE.audio.play('cancel');
        this.selectUnit(s.sel);
        return;
      }
      FE.audio.play('cancel');
      this.clearSelection();
      this.view.redraw();
    }

    finishUnit(u) {
      u.acted = true;
      this.clearSelection();
      // 攻撃・杖・訪問は処理中 'busy' にしているので、ここで操作可能へ戻す
      if (!this.state.over && this.state.phase === 'player') this.state.mode = 'idle';
      this.view.redraw();
      if (this.checkObjective()) return;
      if (this.livingPlayers().every((p) => p.acted)) {
        this.view.log('全ユニットが行動を終えた。');
        const turn = this.state.turn;
        setTimeout(() => {
          if (this.state.phase === 'player' && this.state.turn === turn) this.endPlayerPhase();
        }, 500);
      }
    }

    /* ---- 各種アクション --------------------------------------------- */
    async visitVillage(u) {
      const s = this.state;
      const v = this.villages.find((n) => !n.visited && n.x === u.x && n.y === u.y);
      if (!v) return;
      v.visited = true;
      s.mode = 'busy';
      await this.view.dialog('民家', v.text);
      if (D.WEAPONS[v.item]) {
        this.giveWeapon(v.item, u);
      } else if (u.items.length < 5) {
        u.items.push(R.makeItem(v.item));
        this.view.log(u.name + ' は ' + D.ITEMS[v.item].name + ' を受け取った！');
      } else {
        this.view.log('荷物がいっぱいで受け取れなかった……');
      }
      FE.audio.play('item');
      this.finishUnit(u);
    }

    /** 手に入れた武器を、扱える味方へ渡す（受取候補を優先） */
    giveWeapon(weaponKey, preferred) {
      const owner = (preferred && R.canUse(preferred, weaponKey)) ? preferred
        : this.livingPlayers().find((p) => R.canUse(p, weaponKey))
        || this.roster.find((p) => !p.dead && R.canUse(p, weaponKey));
      if (owner) {
        owner.weapons.push(weaponKey);
        this.view.log(owner.name + ' は ' + D.WEAPONS[weaponKey].name + ' を手に入れた！');
        FE.audio.play('item');
      } else {
        this.view.log(D.WEAPONS[weaponKey].name + ' を拾ったが、扱える者がいなかった……');
      }
      return owner;
    }

    async seize(u) {
      this.state.mode = 'busy';
      this.view.log(u.name + ' は玉座を制圧した！');
      FE.audio.play('win');
      await this.victory();
    }

    async confirmStaff(target) {
      const s = this.state;
      const u = s.sel;
      const idx = R.staffIndex(u);
      if (idx < 0) return;
      u.equipped = idx;
      const staff = R.weaponOf(u);
      s.mode = 'busy';
      this.view.redraw();
      const amount = R.healAmount(u, staff);
      const done = R.applyHeal(target, amount);
      FE.audio.play('heal');
      this.view.floatText(target, '+' + done, 'heal');
      this.view.log(u.name + ' の' + staff.name + '！ ' + target.name + ' のＨＰが ' + done + ' 回復。');
      await this.view.wait(500);
      await this.awardExp(u, R.staffExp(u, done));
      this.finishUnit(u);
    }

    async confirmAttack(target) {
      const s = this.state;
      const u = s.sel;
      const dist = manhattan(u, target);
      const wi = R.bestWeaponIndex(u, dist);
      if (wi < 0) { this.view.log('その間合いに届く武器がない。'); return; }
      if (wi !== u.equipped) {
        u.equipped = wi;
        this.view.log(u.name + ' は ' + R.weaponOf(u).name + ' に持ち替えた。');
      }
      s.mode = 'busy';
      this.view.redraw();
      if (target.boss && target.quote && !this.bossQuoted) {
        this.bossQuoted = true;
        await this.view.dialog(target.name, target.quote);
      }
      await this.battle(u, target);
      if (this.checkObjective()) return;
      this.finishUnit(u);
    }

    /** 実際の戦闘処理（自軍・敵軍どちらの攻撃でも使う） */
    async battle(attacker, defender) {
      const dist = manhattan(attacker, defender);
      const wi = R.bestWeaponIndex(attacker, dist);
      if (wi >= 0) attacker.equipped = wi;
      const ci = R.bestWeaponIndex(defender, dist);
      const defWeaponKey = ci >= 0 ? defender.weapons[ci] : R.weaponKeyOf(defender);
      if (ci >= 0) defender.equipped = ci;

      const att = { unit: attacker, weapon: R.weaponOf(attacker), terrain: this.board.modsAt(attacker.x, attacker.y) };
      const def = { unit: defender, weapon: defWeaponKey ? D.WEAPONS[defWeaponKey] : null, terrain: this.board.modsAt(defender.x, defender.y) };

      if (defender.team === 'enemy' && defender.ai === 'aggro') defender.aggroed = true;

      const events = R.resolveCombat(att, def, dist, this.rng);
      await this.view.animateCombat(attacker, defender, events, dist);

      // 経験値（自軍のみ）
      const attackerStruck = events.some((ev) => ev.from === attacker);
      const defenderStruck = events.some((ev) => ev.from === defender);
      if (attacker.team === 'player' && attackerStruck) {
        await this.awardExp(attacker, defender.hp <= 0 ? R.killExp(attacker, defender) : R.hitExp(attacker, defender));
      }
      if (defender.team === 'player' && defenderStruck) {
        await this.awardExp(defender, attacker.hp <= 0 ? R.killExp(defender, attacker) : R.hitExp(defender, attacker));
      }

      for (const dead of [defender, attacker]) {
        if (dead.hp <= 0) await this.onDeath(dead, dead === defender ? attacker : defender);
      }
      this.view.redraw();
    }

    async awardExp(u, amount) {
      const before = u.exp;
      const ups = R.gainExp(u, amount, this.rng);
      if (u.lv >= R.MAX_LEVEL && !ups.length && before === u.exp) return;
      this.view.floatText(u, 'EXP+' + amount, 'exp');
      await this.view.wait(280);
      for (const up of ups) {
        FE.audio.play('levelup');
        await this.view.showLevelUp(u, up);
      }
      this.view.redraw();
    }

    async onDeath(u, killer) {
      FE.audio.play('die');
      await this.view.animateDeath(u);
      if (u.team === 'player') {
        u.dead = true;
        this.view.log('▼ ' + u.name + ' は倒れた……');
        await this.view.dialog(u.name, u.id === 'ald'
          ? '「すまない……ここまで、か……」'
          : '「アルド様……あとを、頼み、ます……」');
      } else {
        this.view.log(u.name + ' を撃破した！');
        if (u.drop && killer && killer.team === 'player') {
          if (D.ITEMS[u.drop]) {
            if (killer.items.length < 5) {
              killer.items.push(R.makeItem(u.drop));
              this.view.log(killer.name + ' は ' + D.ITEMS[u.drop].name + ' を手に入れた！');
              FE.audio.play('item');
            } else {
              this.view.log('落とし物があったが、荷物がいっぱいで持ちきれない……');
            }
          } else if (D.WEAPONS[u.drop]) {
            this.giveWeapon(u.drop, killer);
          }
        }
      }
      this.units = this.units.filter((x) => x !== u);
      this.view.redraw();
    }

    /* =================================================================
     *  勝敗判定
     * ================================================================= */
    checkObjective() {
      if (this.state.over) return true;
      const players = this.livingPlayers();
      const ald = players.find((u) => u.id === 'ald');
      if (!players.length || !ald) { this.defeat(); return true; }

      const obj = this.chapter.objective;
      if (obj.type === 'rout' && !this.livingEnemies().length) { this.victory(); return true; }
      if (obj.type === 'boss' && !this.livingEnemies().some((e) => e.boss)) { this.victory(); return true; }
      if (obj.type === 'survive' && this.state.turn > obj.turns) { this.victory(); return true; }
      return false;
    }

    async victory() {
      if (this.state.over) return;
      this.state.over = true;
      this.state.mode = 'busy';
      FE.audio.play('win');
      // 生存者を roster に反映（HP は次章で全快）
      this.cleared = Math.max(this.cleared, this.chapterIndex + 1);
      this.chapterIndex = Math.min(this.chapterIndex + 1, D.CHAPTERS.length);
      this.save();
      await this.view.showResult(this.chapter, this.roster.filter((u) => !u.dead), this.state.turn);
    }

    async defeat() {
      if (this.state.over) return;
      this.state.over = true;
      this.state.mode = 'busy';
      FE.audio.play('lose');
      await this.view.showDefeat(this.chapter);
    }

    async nextChapter() {
      if (this.chapterIndex >= D.CHAPTERS.length) {
        await this.view.showEnding(D.EPILOGUE);
        this.chapterIndex = 0;
        this.clearSave();
        this.view.showTitle();
        return;
      }
      await this.startChapter(this.chapterIndex);
    }

    /* =================================================================
     *  カーソル操作（キーボード）
     * ================================================================= */
    moveCursor(dx, dy) {
      const s = this.state;
      if (s.mode === 'busy' || s.over) return;
      if (s.mode === 'menu' && s.menu) {
        s.menu.index = (s.menu.index + (dy || dx) + s.menu.items.length) % s.menu.items.length;
        FE.audio.play('cursor');
        this.view.redraw();
        return;
      }
      if ((s.mode === 'attack' || s.mode === 'staff') && s.targets.length) {
        s.targetIdx = (s.targetIdx + (dx || dy) + s.targets.length) % s.targets.length;
        const t = s.targets[s.targetIdx];
        s.cursor = { x: t.x, y: t.y };
        FE.audio.play('cursor');
        this.view.redraw();
        return;
      }
      const nx = FE.util.clamp(s.cursor.x + dx, 0, this.board.w - 1);
      const ny = FE.util.clamp(s.cursor.y + dy, 0, this.board.h - 1);
      if (nx !== s.cursor.x || ny !== s.cursor.y) {
        s.cursor = { x: nx, y: ny };
        FE.audio.play('cursor');
        this.view.redraw();
      }
    }

    confirm() {
      const s = this.state;
      if (s.mode === 'busy' || s.over) return;
      if (s.mode === 'menu' && s.menu) {
        const item = s.menu.items[s.menu.index];
        FE.audio.play('select');
        this.command(item.id);
        return;
      }
      if ((s.mode === 'attack' || s.mode === 'staff') && s.targets.length) {
        const t = s.targets[s.targetIdx];
        this.clickTile(t.x, t.y);
        return;
      }
      this.clickTile(s.cursor.x, s.cursor.y);
    }

    /** 未行動ユニットを順に選択 */
    cycleUnit() {
      const s = this.state;
      if (s.mode === 'busy' || s.phase !== 'player' || s.over) return;
      const list = this.livingPlayers().filter((u) => !u.acted);
      if (!list.length) return;
      const cur = s.sel ? list.indexOf(s.sel) : -1;
      const next = list[(cur + 1) % list.length];
      this.selectUnit(next);
      this.view.focus(next);
    }

    toggleDanger() {
      this.state.danger = !this.state.danger;
      this.view.redraw();
      this.view.log(this.state.danger ? '危険地帯を表示（敵の攻撃範囲）' : '危険地帯を非表示');
    }
  }

  FE.Game = Game;
})(typeof globalThis !== 'undefined' ? globalThis : this);
