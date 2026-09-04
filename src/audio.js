/* =========================================================================
 *  炎翼の紋章 —— audio.js
 *  WebAudio による 8bit 風の効果音と BGM（外部ファイル不要）
 * ========================================================================= */
(function (global) {
  'use strict';
  const FE = (global.FE = global.FE || {});

  const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  function freq(name) {
    if (name === '-') return 0;
    const m = /^([A-G]#?)(\d)$/.exec(name);
    if (!m) return 0;
    return 440 * Math.pow(2, (NOTE[m[1]] + (+m[2] - 4) * 12 - 9) / 12);
  }

  const Audio = {
    ctx: null,
    sfxOn: true,
    bgmOn: false,
    _bgmTimer: null,
    _bgmStep: 0,

    ensure() {
      if (!this.ctx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },

    tone(f, dur, type, gain, when) {
      const ctx = this.ensure();
      if (!ctx || !f) return;
      const t0 = (when == null ? ctx.currentTime : when);
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(f, t0);
      amp.gain.setValueAtTime(0.0001, t0);
      amp.gain.exponentialRampToValueAtTime(gain || 0.08, t0 + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(amp).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    },

    noise(dur, gain) {
      const ctx = this.ensure();
      if (!ctx) return;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      const amp = ctx.createGain();
      amp.gain.value = gain || 0.12;
      src.buffer = buf;
      src.connect(amp).connect(ctx.destination);
      src.start();
    },

    play(name) {
      if (!this.sfxOn) return;
      const ctx = this.ensure();
      if (!ctx) return;
      const t = ctx.currentTime;
      switch (name) {
        case 'cursor':  this.tone(660, 0.05, 'square', 0.04); break;
        case 'select':  this.tone(880, 0.07, 'square', 0.06); this.tone(1320, 0.06, 'square', 0.04, t + 0.05); break;
        case 'cancel':  this.tone(330, 0.09, 'square', 0.05); break;
        case 'move':    this.tone(520, 0.05, 'triangle', 0.05); break;
        case 'hit':     this.noise(0.14, 0.13); this.tone(180, 0.1, 'sawtooth', 0.07); break;
        case 'crit':
          this.noise(0.26, 0.2);
          [220, 330, 440].forEach((f, i) => this.tone(f, 0.14, 'sawtooth', 0.1, t + i * 0.05));
          break;
        case 'miss':    this.tone(260, 0.09, 'sine', 0.05); this.tone(200, 0.09, 'sine', 0.04, t + 0.07); break;
        case 'heal':    [660, 880, 1100].forEach((f, i) => this.tone(f, 0.16, 'sine', 0.07, t + i * 0.07)); break;
        case 'die':     [330, 260, 200, 140].forEach((f, i) => this.tone(f, 0.18, 'square', 0.07, t + i * 0.09)); break;
        case 'levelup': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.2, 'square', 0.08, t + i * 0.1)); break;
        case 'win':     [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.26, 'square', 0.08, t + i * 0.14)); break;
        case 'lose':    [440, 392, 349, 262].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.08, t + i * 0.24)); break;
        case 'phase':   [392, 523, 659].forEach((f, i) => this.tone(f, 0.14, 'square', 0.06, t + i * 0.08)); break;
        case 'item':    this.tone(784, 0.1, 'square', 0.06); this.tone(1046, 0.12, 'square', 0.05, t + 0.09); break;
      }
    },

    /* --- 簡易 BGM（メロディ + ベースの 2 声ループ） --- */
    MELODY: ('A4 - C5 - E5 - D5 C5 B4 - A4 - G4 - A4 - - - ' +
             'F4 - A4 - C5 - B4 A4 G4 - E4 - F4 - G4 - - - ').split(' '),
    BASS:   ('A2 - A2 - E2 - E2 - F2 - F2 - G2 - G2 - ' +
             'F2 - F2 - C3 - C3 - D3 - D3 - E3 - E3 - ').split(' '),

    startBgm() {
      const ctx = this.ensure();
      if (!ctx || this._bgmTimer) return;
      const step = 0.17;
      this._bgmStep = 0;
      const tick = () => {
        if (!this.bgmOn) return;
        const i = this._bgmStep % this.MELODY.length;
        const mf = freq(this.MELODY[i]);
        const bf = freq(this.BASS[this._bgmStep % this.BASS.length]);
        if (mf) this.tone(mf, step * 0.9, 'square', 0.035);
        if (bf) this.tone(bf, step * 1.6, 'triangle', 0.045);
        this._bgmStep++;
      };
      tick();
      this._bgmTimer = setInterval(tick, step * 1000);
    },
    stopBgm() {
      if (this._bgmTimer) { clearInterval(this._bgmTimer); this._bgmTimer = null; }
    },
    setBgm(on) {
      this.bgmOn = on;
      if (on) this.startBgm(); else this.stopBgm();
    }
  };

  FE.audio = Audio;
})(typeof globalThis !== 'undefined' ? globalThis : this);
