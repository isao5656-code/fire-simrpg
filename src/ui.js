/* =========================================================================
 *  炎翼の紋章 —— ui.js
 *  DOM の描画・演出・入力。game.js からは view として呼ばれる。
 * ========================================================================= */
(function (global) {
  'use strict';
  const FE = (global.FE = global.FE || {});
  const D = FE.data;
  const R = FE.rules;
  const G = FE.grid;
  const key = FE.util.key;
  const manhattan = FE.util.manhattan;

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

  class View {
    constructor() {
      this.game = null;
      this.unitNodes = new Map();
      this.tileNodes = [];
      this.board = null;
      this.speed = 1;
      this.cacheDom();
      this.bindStaticEvents();
    }

    cacheDom() {
      this.screens = {
        title: $('#titleScreen'), brief: $('#briefScreen'), battle: $('#battleScreen')
      };
      this.boardEl = $('#board');
      this.tileLayer = $('#tileLayer');
      this.unitLayer = $('#unitLayer');
      this.fxLayer = $('#fxLayer');
      this.cursorEl = $('#cursor');
      this.menuEl = $('#cmdMenu');
      this.bannerEl = $('#phaseBanner');
      this.logEl = $('#messageLog');
    }

    attach(game) { this.game = game; }

    /* =================================================================
     *  画面の出し入れ
     * ================================================================= */
    show(name) {
      for (const k of Object.keys(this.screens)) this.screens[k].hidden = (k !== name);
    }
    showTitle() {
      this.show('title');
      const info = $('#saveInfo');
      const g = this.game;
      const btn = $('#btnContinue');
      if (g && g.hasSave()) {
        btn.disabled = false;
        try {
          const s = JSON.parse(localStorage.getItem('enyoku-no-monsho-save-v1'));
          const ch = D.CHAPTERS[Math.min(s.chapterIndex, D.CHAPTERS.length - 1)];
          info.textContent = '記録：第' + ch.no + '章「' + ch.title + '」から再開できます。';
        } catch (e) { info.textContent = ''; }
      } else {
        btn.disabled = true;
        info.textContent = '記録はまだありません。';
      }
    }

    /* =================================================================
     *  出撃前ブリーフィング
     * ================================================================= */
    showBriefing(ch, party, joined) {
      this.show('brief');
      $('#briefNo').textContent = 'CHAPTER ' + ROMAN[ch.no - 1];
      $('#briefTitle').textContent = ch.title;
      $('#briefStory').textContent = ch.story;
      $('#briefObjective').textContent = ch.objectiveText;
      $('#briefHint').textContent = ch.brief || '';
      const joinBox = $('#briefJoin');
      if (joined && joined.length) {
        joinBox.hidden = false;
        joinBox.innerHTML = '';
        joinBox.appendChild(el('span', 'join-label', '仲間が加わった！'));
        joined.forEach((c) => {
          const chip = el('span', 'join-chip');
          chip.appendChild(el('i', null, D.CLASSES[c.cls].icon));
          chip.appendChild(el('b', null, c.name));
          chip.appendChild(el('small', null, c.title));
          joinBox.appendChild(chip);
        });
      } else {
        joinBox.hidden = true;
      }
      $('#briefParty').innerHTML = '';
      party.forEach((u) => $('#briefParty').appendChild(this.partyCard(u)));
      return new Promise((resolve) => {
        const btn = $('#btnSortie');
        const go = () => { btn.removeEventListener('click', go); FE.audio.play('select'); resolve(); };
        btn.addEventListener('click', go);
      });
    }

    partyCard(u) {
      const cls = D.CLASSES[u.cls];
      const card = el('div', 'party-card');
      card.appendChild(el('span', 'pc-face', cls.icon));
      const body = el('div', 'pc-body');
      body.appendChild(el('b', null, u.name));
      body.appendChild(el('small', null, cls.name + ' ／ LV ' + u.lv));
      const bar = el('div', 'pc-hp');
      const fill = el('i');
      fill.style.width = Math.max(0, u.hp / u.stats.hp * 100) + '%';
      bar.appendChild(fill);
      body.appendChild(bar);
      body.appendChild(el('small', 'pc-weapon', u.weapons.length ? D.WEAPONS[u.weapons[u.equipped]].name : '—'));
      card.appendChild(body);
      return card;
    }

    /* =================================================================
     *  マップ生成
     * ================================================================= */
    buildMap(board, ch) {
      this.board = board;
      this.show('battle');
      this.boardEl.style.setProperty('--cols', board.w);
      this.boardEl.style.setProperty('--rows', board.h);
      this.tileLayer.innerHTML = '';
      this.unitLayer.innerHTML = '';
      this.fxLayer.innerHTML = '';
      this.unitNodes.clear();
      this.tileNodes = [];

      for (let y = 0; y < board.h; y++) {
        for (let x = 0; x < board.w; x++) {
          const t = board.terrainAt(x, y);
          const node = el('div', 'tile t-' + t.id);
          node.dataset.x = x;
          node.dataset.y = y;
          node.title = t.name;
          node.addEventListener('click', () => this.game.clickTile(x, y));
          node.addEventListener('mouseenter', () => this.hoverTile(x, y));
          this.tileLayer.appendChild(node);
          this.tileNodes.push(node);
        }
      }
      this.fitTile();
      $('#stageNo').textContent = 'CHAPTER ' + ROMAN[ch.no - 1];
      $('#stageTitle').textContent = ch.title;
      $('#objectiveText').textContent = ch.objectiveText;
      $('#turnNumber').textContent = '1';
      this.setPhaseLabel('player');
      this.cursorEl.hidden = false;
    }

    tileNode(x, y) { return this.tileNodes[y * this.board.w + x]; }

    /** マップ全体が画面幅に収まるよう1マスの大きさを決める */
    fitTile() {
      if (!this.board) return;
      const wrap = this.boardEl.closest('.battlefield-wrap');
      const avail = (wrap ? wrap.clientWidth : window.innerWidth) - 28;
      const size = Math.max(26, Math.min(58, Math.floor(avail / this.board.w)));
      this.boardEl.style.setProperty('--tile', size + 'px');
    }

    setPos(node, x, y) {
      node.style.setProperty('--tx', x);
      node.style.setProperty('--ty', y);
    }

    /* =================================================================
     *  再描画
     * ================================================================= */
    redraw() {
      const g = this.game;
      if (!g || !g.board) return;
      const s = g.state;

      /* --- タイルのハイライト --- */
      const moveSet = new Set(s.moveTiles.map((t) => key(t.x, t.y)));
      const atkSet = new Set();
      if (s.mode === 'attack' || s.mode === 'staff') {
        s.targets.forEach((t) => atkSet.add(key(t.x, t.y)));
      } else if (s.sel && (s.mode === 'move' || s.mode === 'inspect')) {
        for (const k of s.threat) if (!moveSet.has(k)) atkSet.add(k);
      }
      const danger = s.danger ? G.dangerZone(g.board, g.units, 'enemy') : null;

      for (let y = 0; y < g.board.h; y++) {
        for (let x = 0; x < g.board.w; x++) {
          const node = this.tileNode(x, y);
          const k = key(x, y);
          node.classList.toggle('hl-move', moveSet.has(k));
          node.classList.toggle('hl-atk', atkSet.has(k));
          node.classList.toggle('hl-danger', !!danger && danger.has(k) && !moveSet.has(k));
        }
      }

      /* --- ユニット --- */
      const alive = new Set();
      for (const u of g.units) {
        if (u.hp <= 0) continue;
        alive.add(u.uid);
        let node = this.unitNodes.get(u.uid);
        if (!node) {
          node = this.makeUnitNode(u);
          this.unitLayer.appendChild(node);
          this.unitNodes.set(u.uid, node);
        }
        this.setPos(node, u.x, u.y);
        node.classList.toggle('acted', !!u.acted && u.team === 'player');
        node.classList.toggle('selected', s.sel === u);
        node.classList.toggle('targeted', (s.mode === 'attack' || s.mode === 'staff') &&
          s.targets[s.targetIdx] === u);
        node.querySelector('.u-hp i').style.width = Math.max(0, u.hp / u.stats.hp * 100) + '%';
        node.querySelector('.u-lv').textContent = u.lv;
      }
      for (const [uid, node] of [...this.unitNodes]) {
        if (!alive.has(uid)) { node.remove(); this.unitNodes.delete(uid); }
      }

      /* --- カーソル --- */
      this.setPos(this.cursorEl, s.cursor.x, s.cursor.y);
      this.cursorEl.hidden = s.mode === 'busy';

      /* --- コマンドメニュー --- */
      this.renderMenu();

      /* --- サイドパネル --- */
      const focus = s.sel || g.unitAt(s.cursor.x, s.cursor.y);
      this.renderUnitPanel(focus);
      this.renderTerrain(s.cursor.x, s.cursor.y);
      this.renderForecast();
      this.renderParty();
      const obj = g.chapter && g.chapter.objective;
      if (obj && obj.type === 'survive') {
        const left = Math.max(0, obj.turns - s.turn + 1);
        $('#objectiveText').textContent = g.chapter.objectiveText + '（あと ' + left + ' ターン）';
      }
      $('#tallyAlly').textContent = g.livingPlayers().length;
      $('#tallyEnemy').textContent = g.livingEnemies().length;
      this.setPhaseLabel(s.phase);
      $('#btnDanger').classList.toggle('on', s.danger);
    }

    makeUnitNode(u) {
      const cls = D.CLASSES[u.cls];
      const node = el('div', 'unit ' + (u.team === 'enemy' ? 'enemy' : 'ally') + (u.boss ? ' boss' : ''));
      node.appendChild(el('span', 'u-icon', cls.icon));
      const hp = el('span', 'u-hp');
      hp.appendChild(el('i'));
      node.appendChild(hp);
      node.appendChild(el('span', 'u-lv', u.lv));
      node.title = u.name + '（' + cls.name + '）';
      node.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.game.clickTile(u.x, u.y);
      });
      node.addEventListener('mouseenter', () => this.hoverTile(u.x, u.y));
      return node;
    }

    setPhaseLabel(phase) {
      const lab = $('#phaseLabel');
      lab.textContent = phase === 'player' ? 'PLAYER PHASE' : 'ENEMY PHASE';
      lab.classList.toggle('enemy', phase !== 'player');
    }

    setTurn(n) { $('#turnNumber').textContent = n; }

    hoverTile(x, y) {
      const g = this.game;
      if (!g || g.state.mode === 'busy') return;
      g.state.cursor = { x, y };
      this.setPos(this.cursorEl, x, y);
      this.renderTerrain(x, y);
      const u = g.unitAt(x, y);
      if (!g.state.sel) this.renderUnitPanel(u);
    }

    /* =================================================================
     *  各パネル
     * ================================================================= */
    renderMenu() {
      const s = this.game.state;
      if (s.mode !== 'menu' || !s.menu) { this.menuEl.hidden = true; return; }
      const u = s.sel;
      this.menuEl.hidden = false;
      this.menuEl.innerHTML = '';
      s.menu.items.forEach((item, i) => {
        const b = el('button', 'menu-item' + (i === s.menu.index ? ' active' : ''), item.label);
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          s.menu.index = i;
          FE.audio.play('select');
          this.game.command(item.id);
        });
        // ホバーで作り直すとクリックを取りこぼすので、選択表示だけ差し替える
        b.addEventListener('mouseenter', () => {
          s.menu.index = i;
          Array.prototype.forEach.call(this.menuEl.children,
            (n, j) => n.classList.toggle('active', j === i));
        });
        this.menuEl.appendChild(b);
      });
      this.setPos(this.menuEl, u.x, u.y);
      this.menuEl.classList.toggle('flip-x', u.x > this.board.w - 4);
      this.menuEl.classList.toggle('flip-y', u.y > this.board.h - 4);
    }

    renderUnitPanel(u) {
      if (!u) { $('#unitEmpty').hidden = false; $('#unitCard').hidden = true; return; }
      $('#unitEmpty').hidden = true;
      $('#unitCard').hidden = false;
      const cls = D.CLASSES[u.cls];
      const card = $('#unitCard');
      card.classList.toggle('is-enemy', u.team === 'enemy');
      $('#unitPortrait').textContent = cls.icon;
      $('#unitName').textContent = u.name;
      $('#unitClass').textContent = cls.name + (u.boss ? '（敵将）' : '');
      $('#unitLevel').textContent = u.lv;
      $('#unitExp').textContent = u.team === 'player' ? u.exp : '—';
      $('#hpText').textContent = Math.max(0, u.hp) + '/' + u.stats.hp;
      $('#hpBar').style.width = Math.max(0, u.hp / u.stats.hp * 100) + '%';
      $('#expBar').style.width = (u.team === 'player' ? u.exp : 0) + '%';
      const w = R.weaponOf(u);
      $('#unitWeapon').textContent = w ? w.name : '—';
      $('#weaponInfo').textContent = w
        ? (w.staff
            ? '回復 ' + (w.heal + u.stats.mag) + ' ／ 射程 ' + w.min + (w.max > w.min ? '-' + w.max : '')
            : '威力 ' + w.mt + ' ／ 命中 ' + w.hit + ' ／ 必殺 ' + w.crit +
              ' ／ 射程 ' + w.min + (w.max > w.min ? '-' + w.max : '') + (w.magic ? ' ／ 魔法' : ''))
        : '';
      const stats = [
        ['力', u.stats.str], ['魔力', u.stats.mag], ['技', u.stats.skl], ['速さ', u.stats.spd],
        ['幸運', u.stats.lck], ['守備', u.stats.def], ['魔防', u.stats.res], ['移動', cls.move]
      ];
      $('#unitStats').innerHTML = stats
        .map((s) => '<div class="stat"><span>' + s[0] + '</span><b>' + s[1] + '</b></div>').join('');
      $('#unitItems').innerHTML = u.items.length
        ? u.items.map((it) => '<span class="item-chip">' + D.ITEMS[it.key].name +
            '<small>×' + it.uses + '</small></span>').join('')
        : '<span class="item-chip empty">道具なし</span>';
      const guide = $('#unitGuide');
      if (u.team === 'enemy') {
        guide.textContent = u.ai === 'boss' || u.ai === 'guard' ? '敵：その場で迎撃' :
          (u.aggroed ? '敵：進軍中' : '敵：待機中（近づくと動く）');
      } else if (u.acted) {
        guide.textContent = '行動終了';
      } else {
        guide.textContent = '青＝移動範囲／赤＝攻撃範囲';
      }
    }

    renderTerrain(x, y) {
      if (!this.board || !this.board.inside(x, y)) return;
      const t = this.board.modsAt(x, y);
      $('#terrainName').textContent = t.name + (t.heal ? '（回復）' : '');
      $('#terrainAvoid').textContent = '+' + t.avo;
      $('#terrainDef').textContent = '+' + t.def;
    }

    renderParty() {
      const g = this.game;
      const box = $('#partyList');
      box.innerHTML = '';
      g.units.filter((u) => u.team === 'player' && u.hp > 0).forEach((u) => {
        const row = el('div', 'party-mini' + (u.acted ? ' done' : '') + (g.state.sel === u ? ' sel' : ''));
        row.appendChild(el('span', 'mini-face', D.CLASSES[u.cls].icon));
        const info = el('div', 'mini-body');
        info.appendChild(el('b', null, u.name));
        const bar = el('div', 'mini-hp');
        const fill = el('i');
        fill.style.width = Math.max(0, u.hp / u.stats.hp * 100) + '%';
        bar.appendChild(fill);
        info.appendChild(bar);
        row.appendChild(info);
        row.appendChild(el('i', 'mini-hp-text', Math.max(0, u.hp) + '/' + u.stats.hp));
        row.addEventListener('click', () => {
          if (g.state.mode === 'busy' || g.state.phase !== 'player') return;
          this.focus(u);
          g.selectUnit(u);
        });
        box.appendChild(row);
      });
    }

    renderForecast() {
      const g = this.game;
      const s = g.state;
      const box = $('#forecast');
      if (s.mode !== 'attack' || !s.targets.length || !s.sel) { box.hidden = true; return; }
      const u = s.sel;
      const t = s.targets[s.targetIdx];
      if (!t) { box.hidden = true; return; }
      const dist = manhattan(u, t);
      const wi = R.bestWeaponIndex(u, dist);
      const saved = u.equipped;
      if (wi >= 0) u.equipped = wi;
      const ci = R.bestWeaponIndex(t, dist);
      const foeWeapon = ci >= 0 ? D.WEAPONS[t.weapons[ci]] : R.weaponOf(t);
      const att = { unit: u, weapon: R.weaponOf(u), terrain: this.board.modsAt(u.x, u.y) };
      const def = { unit: t, weapon: foeWeapon, terrain: this.board.modsAt(t.x, t.y) };
      const fc = R.forecast(att, def, dist);
      u.equipped = saved;

      box.hidden = false;
      $('#fcAllyName').textContent = u.name;
      $('#fcAllyHp').textContent = u.hp + '/' + u.stats.hp;
      $('#fcAllyDmg').textContent = fc.attacker.dmg + (fc.attacker.doubles ? ' ×2' : '');
      $('#fcAllyHit').textContent = fc.attacker.hit + '%';
      $('#fcAllyCrit').textContent = fc.attacker.crit + '%';
      $('#fcFoeName').textContent = t.name;
      $('#fcFoeHp').textContent = t.hp + '/' + t.stats.hp;
      $('#fcFoeDmg').textContent = fc.counter ? fc.counter.dmg + (fc.counter.doubles ? ' ×2' : '') : '—';
      $('#fcFoeHit').textContent = fc.counter ? fc.counter.hit + '%' : '—';
      $('#fcFoeCrit').textContent = fc.counter ? fc.counter.crit + '%' : '—';
      const notes = [];
      if (fc.attacker.tri > 0) notes.push('三すくみ有利');
      if (fc.attacker.tri < 0) notes.push('三すくみ不利');
      if (fc.attacker.effective) notes.push('特効！');
      if (!fc.counter) notes.push('反撃なし');
      const lethal = fc.attacker.dmg * (fc.attacker.doubles ? 2 : 1) >= t.hp;
      if (lethal) notes.push('撃破可能');
      $('#fcNote').textContent = notes.join(' ／ ');
    }

    log(text) {
      this.logEl.textContent = text;
      this.logEl.classList.remove('flash');
      void this.logEl.offsetWidth;
      this.logEl.classList.add('flash');
    }

    focus(u) {
      const node = this.unitNodes.get(u.uid);
      if (node && node.scrollIntoView) {
        node.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    }

    /* =================================================================
     *  演出
     * ================================================================= */
    wait(ms) { return wait(ms * this.speed); }

    async animateMove(unit, path) {
      const node = this.unitNodes.get(unit.uid);
      if (!node || !path) return;
      node.classList.add('moving');
      for (let i = 1; i < path.length; i++) {
        this.setPos(node, path[i].x, path[i].y);
        FE.audio.play('move');
        await wait(90);
      }
      node.classList.remove('moving');
      await wait(60);
    }

    async animateCombat(attacker, defender, events, dist) {
      const aNode = this.unitNodes.get(attacker.uid);
      const dNode = this.unitNodes.get(defender.uid);
      if (!events.length) return;
      for (const ev of events) {
        const from = this.unitNodes.get(ev.from.uid);
        const to = this.unitNodes.get(ev.to.uid);
        if (from) {
          const dx = Math.sign(ev.to.x - ev.from.x) * 0.22;
          const dy = Math.sign(ev.to.y - ev.from.y) * 0.22;
          from.style.setProperty('--lx', dx);
          from.style.setProperty('--ly', dy);
          from.classList.add('lunge');
        }
        await wait(150);
        if (ev.type === 'miss') {
          FE.audio.play('miss');
          this.log(ev.from.name + ' の攻撃！ …… ' + ev.to.name + ' はかわした！');
          this.floatText(ev.to, 'MISS', 'miss');
          if (to) { to.classList.add('dodge'); setTimeout(() => to.classList.remove('dodge'), 320); }
        } else {
          FE.audio.play(ev.type === 'crit' ? 'crit' : 'hit');
          this.log(ev.type === 'crit'
            ? ev.from.name + ' の必殺の一撃！ ' + ev.to.name + ' に ' + ev.dmg + ' ダメージ！'
            : ev.from.name + ' の攻撃！ ' + ev.to.name + ' に ' + ev.dmg + ' ダメージ。');
          this.floatText(ev.to, (ev.type === 'crit' ? '会心 ' : '') + ev.dmg, ev.type === 'crit' ? 'crit' : 'dmg');
          if (to) {
            to.classList.add('hurt');
            setTimeout(() => to.classList.remove('hurt'), 380);
            const bar = to.querySelector('.u-hp i');
            if (bar) bar.style.width = Math.max(0, ev.hpAfter / ev.to.stats.hp * 100) + '%';
          }
          this.shake(ev.type === 'crit');
        }
        if (from) {
          from.classList.remove('lunge');
          from.style.removeProperty('--lx');
          from.style.removeProperty('--ly');
        }
        await wait(ev.type === 'crit' ? 420 : 300);
      }
      if (aNode) aNode.classList.remove('lunge');
      if (dNode) dNode.classList.remove('lunge');
      await wait(120);
    }

    shake(strong) {
      const frame = this.boardEl.parentElement;
      frame.classList.remove('shake', 'shake-strong');
      void frame.offsetWidth;
      frame.classList.add(strong ? 'shake-strong' : 'shake');
      setTimeout(() => frame.classList.remove('shake', 'shake-strong'), 400);
    }

    async animateDeath(unit) {
      const node = this.unitNodes.get(unit.uid);
      if (!node) return;
      node.classList.add('dying');
      await wait(520);
    }

    floatText(unit, text, kind) {
      const node = el('div', 'float ' + (kind || ''), text);
      this.setPos(node, unit.x, unit.y);
      this.fxLayer.appendChild(node);
      setTimeout(() => node.remove(), 1000);
    }

    banner(title, sub, side) {
      const b = this.bannerEl;
      b.hidden = false;
      b.className = 'phase-banner ' + (side === 'enemy' ? 'enemy-phase' : 'player-phase');
      b.querySelector('strong').textContent = title;
      b.querySelector('span').textContent = sub;
      b.classList.remove('run');
      void b.offsetWidth;
      b.classList.add('run');
      return wait(1150).then(() => { b.hidden = true; });
    }

    /** クリック / Enter で送るメッセージウィンドウ（タイプ表示つき） */
    dialog(speaker, text) {
      const box = $('#dialogBox');
      const textEl = $('#dialogText');
      $('#dialogSpeaker').textContent = speaker || '';
      textEl.textContent = '';
      box.hidden = false;
      let i = 0, done = false, timer = null;
      const finish = () => { textEl.textContent = text; done = true; clearInterval(timer); };
      timer = setInterval(() => {
        textEl.textContent = text.slice(0, ++i);
        if (i >= text.length) finish();
      }, 22);
      return new Promise((resolve) => {
        const onKey = (e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape' || e.key === 'z') step(e);
        };
        const step = (e) => {
          if (e) e.preventDefault();
          if (!done) { finish(); return; }
          box.hidden = true;
          box.removeEventListener('click', step);
          document.removeEventListener('keydown', onKey);
          resolve();
        };
        box.addEventListener('click', step);
        document.addEventListener('keydown', onKey);
      });
    }

    showLevelUp(unit, up) {
      const box = $('#levelUpBox');
      $('#luName').textContent = unit.name;
      $('#luLv').textContent = up.lv;
      const list = $('#luStats');
      list.innerHTML = '';
      const keys = R.STAT_KEYS;
      let any = false;
      keys.forEach((k) => {
        const row = el('div', 'lu-row' + (up.gains[k] ? ' up' : ''));
        row.appendChild(el('span', null, R.STAT_LABEL[k]));
        row.appendChild(el('b', null, unit.stats[k]));
        row.appendChild(el('i', null, up.gains[k] ? '+1' : '—'));
        if (up.gains[k]) any = true;
        list.appendChild(row);
      });
      if (!any) list.appendChild(el('p', 'lu-none', '……今回は伸びなかった。'));
      box.hidden = false;
      return new Promise((resolve) => {
        let closed = false;
        const close = () => {
          if (closed) return;
          closed = true;
          box.hidden = true;
          box.removeEventListener('click', close);
          document.removeEventListener('keydown', onKey);
          clearTimeout(auto);
          resolve();
        };
        const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'z') { e.preventDefault(); close(); } };
        box.addEventListener('click', close);
        document.addEventListener('keydown', onKey);
        const auto = setTimeout(close, 3200);
      });
    }

    showResult(ch, party, turns) {
      const box = $('#resultBox');
      $('#resultCrest').textContent = '♛';
      $('#resultLabel').textContent = 'CHAPTER CLEAR';
      $('#resultTitle').textContent = '第' + ch.no + '章「' + ch.title + '」制圧';
      const lost = this.game.roster.filter((u) => u.dead);
      $('#resultSummary').textContent = turns + ' ターンで勝利。' +
        (lost.length ? '失った仲間：' + lost.map((u) => u.name).join('、') : '全員生還。');
      const list = $('#resultParty');
      list.innerHTML = '';
      party.forEach((u) => list.appendChild(this.partyCard(u)));
      $('#btnNext').textContent = this.game.chapterIndex >= D.CHAPTERS.length ? 'エンディングへ ▶' : '次の章へ ▶';
      box.hidden = false;
      return new Promise((resolve) => {
        const go = () => { cleanup(); this.game.nextChapter(); resolve(); };
        const retry = () => { cleanup(); this.game.retryChapter(); resolve(); };
        const cleanup = () => {
          box.hidden = true;
          $('#btnNext').removeEventListener('click', go);
          $('#btnRetry2').removeEventListener('click', retry);
        };
        $('#btnNext').addEventListener('click', go);
        $('#btnRetry2').addEventListener('click', retry);
      });
    }

    showDefeat(ch) {
      const box = $('#resultBox');
      $('#resultCrest').textContent = '✝';
      $('#resultLabel').textContent = 'GAME OVER';
      $('#resultTitle').textContent = '第' + ch.no + '章「' + ch.title + '」敗北';
      $('#resultSummary').textContent = 'アルドが倒れ、軍は散り散りになった……。章の最初からやり直そう。';
      $('#resultParty').innerHTML = '';
      $('#btnNext').textContent = 'もう一度挑む ▶';
      box.hidden = false;
      return new Promise((resolve) => {
        const retry = () => { cleanup(); this.game.retryChapter(); resolve(); };
        const cleanup = () => {
          box.hidden = true;
          $('#btnNext').removeEventListener('click', retry);
          $('#btnRetry2').removeEventListener('click', retry);
        };
        $('#btnNext').addEventListener('click', retry);
        $('#btnRetry2').addEventListener('click', retry);
      });
    }

    showEnding(text) {
      const box = $('#endingBox');
      $('#endingText').textContent = text;
      box.hidden = false;
      FE.audio.play('win');
      return new Promise((resolve) => {
        const close = () => {
          box.hidden = true;
          $('#btnEndClose').removeEventListener('click', close);
          resolve();
        };
        $('#btnEndClose').addEventListener('click', close);
      });
    }

    /* =================================================================
     *  入力
     * ================================================================= */
    bindStaticEvents() {
      document.addEventListener('contextmenu', (e) => {
        if (e.target.closest('#board')) { e.preventDefault(); this.game && this.game.cancel(); }
      });
      document.addEventListener('keydown', (e) => this.onKey(e));
      let resizeTimer = null;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => this.fitTile(), 120);
      });
    }

    onKey(e) {
      const g = this.game;
      if (!g || this.screens.battle.hidden) return;
      if (!$('#dialogBox').hidden || !$('#levelUpBox').hidden ||
          !$('#resultBox').hidden || !$('#endingBox').hidden || !$('#helpBox').hidden) return;
      const k = e.key;
      const map = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]
      };
      if (map[k]) { e.preventDefault(); g.moveCursor(map[k][0], map[k][1]); return; }
      if (k === 'Enter' || k === 'z' || k === ' ') { e.preventDefault(); g.confirm(); return; }
      if (k === 'Escape' || k === 'x' || k === 'Backspace') { e.preventDefault(); g.cancel(); return; }
      if (k === 'Tab') { e.preventDefault(); g.cycleUnit(); return; }
      if (k === 'd' || k === 'D') { e.preventDefault(); g.toggleDanger(); return; }
      if (k === 't' || k === 'T') { e.preventDefault(); g.endPlayerPhase(); return; }
    }
  }

  FE.View = View;
})(typeof globalThis !== 'undefined' ? globalThis : this);
