/* =========================================================================
 *  炎翼の紋章 —— main.js
 *  起動・画面外ボタンの結線
 * ========================================================================= */
(function (global) {
  'use strict';
  const FE = global.FE;
  const $ = (s) => document.querySelector(s);

  function boot() {
    const view = new FE.View();
    const game = new FE.Game(view);
    view.attach(game);
    global.FE.instance = { view, game };

    view.showTitle();

    /* --- タイトル --- */
    $('#btnNew').addEventListener('click', () => {
      FE.audio.ensure();
      FE.audio.play('select');
      game.newGame();
    });
    $('#btnContinue').addEventListener('click', () => {
      FE.audio.ensure();
      FE.audio.play('select');
      game.continueGame();
    });
    $('#btnHelp').addEventListener('click', () => { $('#helpBox').hidden = false; });
    $('#btnHelpClose').addEventListener('click', () => { $('#helpBox').hidden = true; });

    /* --- 戦闘画面のツール --- */
    $('#btnEndTurn').addEventListener('click', () => game.endPlayerPhase());
    $('#btnDanger').addEventListener('click', () => game.toggleDanger());
    $('#btnSfx').addEventListener('click', (e) => {
      FE.audio.ensure();
      FE.audio.sfxOn = !FE.audio.sfxOn;
      e.currentTarget.classList.toggle('on', FE.audio.sfxOn);
    });
    $('#btnBgm').addEventListener('click', (e) => {
      FE.audio.ensure();
      FE.audio.setBgm(!FE.audio.bgmOn);
      e.currentTarget.classList.toggle('on', FE.audio.bgmOn);
    });
    $('#btnRetry').addEventListener('click', () => {
      if (confirm('この章を最初からやり直しますか？')) game.retryChapter();
    });
    $('#btnTitle').addEventListener('click', () => {
      if (confirm('タイトルへ戻りますか？（章の開始時点まで記録されています）')) {
        FE.audio.setBgm(false);
        $('#btnBgm').classList.remove('on');
        view.showTitle();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
