/* =====================================================================
   Spellstorm: a hidden mini-game (three quick clicks on the logo's hat).
   Data gremlins march down in waves; the wizard casts bolts to stop them.
   Loaded on demand by magic.js, so it costs nothing until it's summoned.
   ===================================================================== */
(function () {
  'use strict';
  if (window.Spellstorm) return;

  var CONFIG = {
    // Cloudflare Worker that keeps the shared leaderboard (see worker/scores-worker.js).
    // While empty, scores are kept in this browser only.
    scoresEndpoint: 'https://spellstorm-scores.chris-menendez007.workers.dev'
  };

  /* ---------- constants ---------- */
  var W = 320, H = 240, SCALE = 2;
  var PLAYER_Y = H - 26;
  var COLS = 9, ROWS = 5, GAP_X = 16, GAP_Y = 14;
  var BARRIER_Y = H - 62, BW = 24, BH = 14;
  var ROW_TYPES = ['ghost', 'bat', 'bat', 'beetle', 'beetle'];
  var BONUS_VALUES = [50, 100, 150, 300];
  var EXTRA_LIFE_AT = 2000;
  var LOCAL_KEY = 'spellstorm-local-scores';
  var MUTE_KEY = 'spellstorm-muted';

  /* ---------- sprites (original pixel art, one character per pixel) ---------- */
  function makeSprite(rows, pal) {
    var w = 0; rows.forEach(function (r) { w = Math.max(w, r.length); });
    var c = document.createElement('canvas'); c.width = w; c.height = rows.length;
    var x = c.getContext('2d');
    rows.forEach(function (row, y) {
      for (var i = 0; i < row.length; i++) {
        var col = pal[row[i]];
        if (col) { x.fillStyle = col; x.fillRect(i, y, 1, 1); }
      }
    });
    return c;
  }

  var PAL_WIZ = { G: '#EAD886', H: '#2C3E66', h: '#5E829C', B: '#4A607F', S: '#E8C9A0', E: '#161929', W: '#EEF2F5', R: '#5E829C', r: '#384A63' };
  var WIZARD = makeSprite([
    '......G......',
    '.....hHH.....',
    '....hHHHH....',
    '....hHGHH....',
    '...hHHHHHH...',
    '.BBBBBBBBBBB.',
    '...SESSSES...',
    '...WWWWWWW...',
    '..RWWWWWWWR..',
    '.RRRWWWWWRRR.',
    '.RRRRWWWRRRR.',
    '.rrrrrrrrrrr.'
  ], PAL_WIZ);
  var LIFE_HAT = makeSprite([
    '...G...',
    '..hHH..',
    '.hHGHH.',
    'BBBBBBB'
  ], PAL_WIZ);

  var PAL_BEETLE = { a: '#C3708E', l: '#9C4A68', S: '#D9547E', k: '#6B2340', s: '#F08CA8' };
  var PAL_GHOST = { G: '#DDE6F0', g: '#9AA8B1', e: '#2E9BB5' };
  var PAL_BAT = { B: '#8E6BD8', K: '#4E3592', e: '#EAD886' };
  var PAL_BOOK = { P: '#8A4B2E', W: '#F2E6C8', l: '#9AA8B1', G: '#EAD886' };

  var TYPES = {
    ghost: {
      pts: 30, color: '#DDE6F0',
      frames: [
        makeSprite([
          '...GGGGG...',
          '..GGGGGGG..',
          '.GGGGGGGGG.',
          '.GGeGGGeGG.',
          '.GGeGGGeGG.',
          '.GGGGGGGGG.',
          '.GgGGGGGgG.',
          '.GGGGGGGGG.',
          '.GG.GGG.GG.'
        ], PAL_GHOST),
        makeSprite([
          '...GGGGG...',
          '..GGGGGGG..',
          '.GGGGGGGGG.',
          '.GGeGGGeGG.',
          '.GGeGGGeGG.',
          '.GGGGGGGGG.',
          '.GgGGGGGgG.',
          '.GGGGGGGGG.',
          '.G.GG.GG.G.'
        ], PAL_GHOST)
      ]
    },
    bat: {
      pts: 20, color: '#8E6BD8',
      frames: [
        makeSprite([
          'B...K.K...B',
          'BB..KKK..BB',
          'BBBKeKeKBBB',
          '.BBKKKKKBB.',
          '..B.KKK.B..',
          '....K.K....'
        ], PAL_BAT),
        makeSprite([
          '....K.K....',
          '....KKK....',
          '.BBKeKeKBB.',
          'BBBKKKKKBBB',
          'BB..KKK..BB',
          'B...K.K...B'
        ], PAL_BAT)
      ]
    },
    beetle: {
      pts: 10, color: '#D9547E',
      frames: [
        makeSprite([
          '..a.....a..',
          '...a...a...',
          'l..SSkSS..l',
          '.lSsSkSsSl.',
          '..SSSkSSS..',
          '.lSSSkSSSl.',
          'l..SSkSS..l',
          '....SkS....'
        ], PAL_BEETLE),
        makeSprite([
          '..a.....a..',
          '...a...a...',
          '.l.SSkSS.l.',
          'l.SsSkSsS.l',
          '..SSSkSSS..',
          'l.SSSkSSS.l',
          '.l.SSkSS.l.',
          '....SkS....'
        ], PAL_BEETLE)
      ]
    }
  };
  var BOOK = [
    makeSprite([
      '.PPPPP.PPPPP.',
      'PWWWWWPWWWWWP',
      'PWllWWPWWllWP',
      'PWWWWWPWWWWWP',
      'PWllWWPWWllWP',
      'PPPPPPGPPPPPP',
      '......G......'
    ], PAL_BOOK),
    makeSprite([
      '.............',
      '..PPPP.PPPP..',
      '.PWWllPllWWP.',
      'PWWWWWPWWWWWP',
      'PWllWWPWWllWP',
      'PPPPPPGPPPPPP',
      '......G......'
    ], PAL_BOOK)
  ];

  /* ---------- sound (tiny WebAudio blips) ---------- */
  var audio = null;
  var muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}
  function tone(type, f0, f1, dur, vol) {
    if (muted) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      var t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      g.gain.setValueAtTime(vol || 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  var sfx = {
    cast: function () { tone('square', 1100, 380, 0.09, 0.035); },
    pop: function () { tone('triangle', 520, 90, 0.16, 0.06); tone('square', 180, 60, 0.12, 0.02); },
    hurt: function () { tone('sawtooth', 300, 40, 0.5, 0.05); },
    bonus: function () { [660, 880, 1320].forEach(function (f, i) { setTimeout(function () { tone('square', f, f, 0.08, 0.03); }, i * 70); }); },
    life: function () { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { tone('triangle', f, f, 0.1, 0.05); }, i * 80); }); },
    wave: function () { [392, 523, 784].forEach(function (f, i) { setTimeout(function () { tone('triangle', f, f, 0.12, 0.04); }, i * 110); }); }
  };

  /* ---------- leaderboard ---------- */
  var board = { scores: [], shared: !!CONFIG.scoresEndpoint, loaded: false, error: false };
  function localScores() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || []; } catch (e) { return []; }
  }
  function saveLocal(entry) {
    var list = localScores(); list.push(entry);
    list.sort(function (a, b) { return b.score - a.score; });
    list = list.slice(0, 10);
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch (e) {}
    return list;
  }
  function loadBoard() {
    if (!CONFIG.scoresEndpoint) { board.scores = localScores(); board.loaded = true; return; }
    fetch(CONFIG.scoresEndpoint + '/scores', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (list) { board.scores = Array.isArray(list) ? list : []; board.loaded = true; board.error = false; })
      .catch(function () { board.scores = localScores(); board.loaded = true; board.error = true; });
  }
  function qualifies(score) {
    if (score <= 0) return false;
    if (board.scores.length < 10) return true;
    return score > board.scores[board.scores.length - 1].score;
  }
  function submitScore(entry) {
    if (!CONFIG.scoresEndpoint || board.error) {
      board.scores = saveLocal(entry);
      return Promise.resolve({ ok: true, local: true });
    }
    return fetch(CONFIG.scoresEndpoint + '/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    }).then(function (r) {
      return r.json().then(function (data) {
        if (r.ok && Array.isArray(data)) { board.scores = data; return { ok: true }; }
        return { ok: false, reason: data && data.error };
      });
    }).catch(function () {
      board.scores = saveLocal(entry);
      return { ok: true, local: true };
    });
  }

  /* ---------- DOM ---------- */
  var css = [
    '.ss-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(9,11,20,.84);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);animation:backdrop-in .25s ease both}',
    '.ss-frame{display:flex;flex-direction:column;align-items:center;gap:12px;width:min(100%,960px)}',
    '.ss-bar{display:flex;align-items:center;justify-content:space-between;width:100%;gap:12px;font-family:Silkscreen,monospace;color:var(--moon);font-size:13px;letter-spacing:.04em}',
    '.ss-bar b{color:var(--gold);font-weight:400}',
    '.ss-close,.ss-mute{background:none;border:1px solid var(--card-border);color:var(--mist);font:inherit;width:38px;height:38px;border-radius:2px;display:inline-flex;align-items:center;justify-content:center;transition:border-color .2s,color .2s}',
    '.ss-close:hover,.ss-mute:hover{border-color:var(--gold);color:var(--gold)}',
    '.ss-close:focus-visible,.ss-mute:focus-visible{outline:2px solid var(--gold);outline-offset:3px}',
    '.ss-tools{display:flex;gap:8px}',
    '.ss-canvas{display:block;width:min(100%,calc((100vh - 190px)*4/3));width:min(100%,calc((100dvh - 190px)*4/3));aspect-ratio:4/3;height:auto;image-rendering:pixelated;background:#0F1220;border:2px solid #384A63;border-radius:2px;box-shadow:0 0 0 1px #0B0D18,0 0 40px rgba(95,211,234,.16),0 24px 60px rgba(0,0,0,.5);touch-action:none}',
    '.ss-help{margin:0;font-family:Silkscreen,monospace;font-size:12px;color:var(--moon);text-align:center}',
    '.ss-initials{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px;font-family:Silkscreen,monospace;color:var(--gold);font-size:14px}',
    '.ss-initials[hidden]{display:none}',
    '.ss-initials input{width:5.2em;padding:10px 12px;font:inherit;font-size:20px;letter-spacing:.3em;text-transform:uppercase;text-align:center;color:var(--white);background:#0F1220;border:2px solid var(--steel);border-radius:2px}',
    '.ss-initials input:focus{outline:none;border-color:var(--gold);box-shadow:0 0 14px rgba(234,216,134,.3)}',
    '.ss-initials .ss-msg{flex-basis:100%;text-align:center;font-size:12px;color:var(--moon);min-height:1em}',
    '.ss-touch{display:none;gap:14px;width:100%;justify-content:space-between}',
    '.ss-touch button{flex:1;height:64px;font-family:Silkscreen,monospace;font-size:24px;color:var(--white);background:rgba(56,74,99,.5);border:2px solid #4A607F;border-radius:2px;touch-action:none;-webkit-user-select:none;user-select:none}',
    '.ss-touch button.is-down{border-color:var(--gold);color:var(--gold);background:rgba(234,216,134,.12)}',
    '.ss-touch .ss-fire{flex:1.4}',
    '@media (pointer:coarse){.ss-touch{display:flex}.ss-help{display:none}.ss-canvas{width:min(100%,calc((100vh - 230px)*4/3));width:min(100%,calc((100dvh - 230px)*4/3))}}'
  ].join('\n');

  var overlay, canvas, ctx, form, input, msg, muteBtn, opener;
  function buildDom() {
    var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    overlay = document.createElement('div');
    overlay.className = 'ss-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.tabIndex = -1;
    overlay.style.outline = 'none';
    overlay.setAttribute('aria-label', 'Spellstorm, a hidden mini-game');
    overlay.innerHTML =
      '<div class="ss-frame">' +
        '<div class="ss-bar"><span>You found <b>Spellstorm</b></span>' +
          '<span class="ss-tools"><button type="button" class="ss-mute" aria-label="Toggle sound"></button>' +
          '<button type="button" class="ss-close" aria-label="Close the game">&#x2715;</button></span></div>' +
        '<canvas class="ss-canvas" width="' + W * SCALE + '" height="' + H * SCALE + '"></canvas>' +
        '<form class="ss-initials" hidden autocomplete="off">' +
          '<label for="ss-name">Your initials</label>' +
          '<input id="ss-name" name="name" maxlength="3" spellcheck="false" autocapitalize="characters" pattern="[A-Za-z0-9]{3}" required>' +
          '<button class="btn btn-gold btn-sm" type="submit">Save</button>' +
          '<span class="ss-msg" aria-live="polite"></span>' +
        '</form>' +
        '<p class="ss-help">&larr; &rarr; move &middot; Space cast &middot; P pause &middot; M sound &middot; Esc close</p>' +
        '<div class="ss-touch">' +
          '<button type="button" data-key="left" aria-label="Move left">&#9664;</button>' +
          '<button type="button" class="ss-fire" data-key="fire" aria-label="Cast">&#10022;</button>' +
          '<button type="button" data-key="right" aria-label="Move right">&#9654;</button>' +
        '</div>' +
      '</div>';
    canvas = overlay.querySelector('canvas');
    ctx = canvas.getContext('2d');
    form = overlay.querySelector('.ss-initials');
    input = form.querySelector('input');
    msg = form.querySelector('.ss-msg');
    muteBtn = overlay.querySelector('.ss-mute');
    updateMuteBtn();

    overlay.querySelector('.ss-close').addEventListener('click', close);
    muteBtn.addEventListener('click', toggleMute);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    canvas.addEventListener('pointerdown', function () {
      if (state === 'title' || (state === 'over' && form.hidden)) startGame();
      else if (state === 'paused') state = 'play';
    });
    form.addEventListener('submit', onSubmitInitials);
    input.addEventListener('input', function () { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

    overlay.querySelectorAll('.ss-touch button').forEach(function (b) {
      var k = b.getAttribute('data-key');
      function down(e) {
        e.preventDefault(); b.classList.add('is-down'); keys[k] = true;
        if (k === 'fire' && (state === 'title' || (state === 'over' && form.hidden))) startGame();
      }
      function up() { b.classList.remove('is-down'); keys[k] = false; }
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
  }
  function updateMuteBtn() {
    muteBtn.innerHTML = muted ? '&#x266A;&#x0338;' : '&#x266A;';
    muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    muteBtn.title = muted ? 'Sound off' : 'Sound on';
  }
  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
    updateMuteBtn();
  }

  /* ---------- input ---------- */
  var keys = { left: false, right: false, fire: false };
  function onKey(e) {
    if (!overlay || !overlay.isConnected) return;
    var down = e.type === 'keydown';
    if (e.key === 'Escape') { if (down) close(); return; }
    if (document.activeElement === input) return;
    var k = null;
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': k = 'left'; break;
      case 'ArrowRight': case 'KeyD': k = 'right'; break;
      case 'Space': case 'ArrowUp': case 'KeyW': k = 'fire'; break;
    }
    if (k) {
      e.preventDefault();
      keys[k] = down;
      if (down && k === 'fire' && !e.repeat && (state === 'title' || (state === 'over' && form.hidden))) startGame();
      return;
    }
    if (!down) return;
    if (e.code === 'Enter' && (state === 'title' || (state === 'over' && form.hidden))) { e.preventDefault(); startGame(); }
    else if (e.code === 'KeyP' && (state === 'play' || state === 'paused')) state = state === 'play' ? 'paused' : 'play';
    else if (e.code === 'KeyM') toggleMute();
  }

  /* ---------- game state ---------- */
  var state = 'title';      // title | play | paused | wavebreak | dying | over
  var score, lives, wave, playMs, extraGiven, hiScore = 0;
  var player, bolt, enemies, aliveCount, form0, ox, oy, dir, stepT, animFrame, fireT, enemyBolts;
  var barriers = [], particles = [], texts = [], book, bookT, breakT, dyingT, overT = 0, titleT = 0, stars, frameClock = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function makeStars() {
    stars = [];
    for (var i = 0; i < 70; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, b: Math.random(), s: rand(0.5, 2.5), p: Math.random() * 6 });
  }

  function makeBarrier(left) {
    var cells = new Uint8Array(BW * BH);
    for (var y = 0; y < BH; y++) {
      for (var x = 0; x < BW; x++) {
        var on = true;
        if (y < 4 && (x < 4 - y || x > BW - 5 + y)) on = false;          // rounded top corners
        if (y > 8 && x >= 8 && x <= 15 && (y > 10 || (x > 8 && x < 15))) on = false; // arch underneath
        cells[y * BW + x] = on ? 1 : 0;
      }
    }
    var b = { x: left, y: BARRIER_Y, cells: cells, canvas: document.createElement('canvas'), dirty: true };
    b.canvas.width = BW; b.canvas.height = BH;
    return b;
  }
  // a little rune carved into each stone
  var RUNE = ['..G..', '.GGG.', 'G.G.G', '..G..', '.G.G.'];
  function renderBarrier(b) {
    var x = b.canvas.getContext('2d');
    x.clearRect(0, 0, BW, BH);
    for (var y = 0; y < BH; y++) {
      for (var i = 0; i < BW; i++) {
        if (!b.cells[y * BW + i]) continue;
        var rx = i - 10, ry = y - 3, rune = rx >= 0 && rx < 5 && ry >= 0 && ry < 5 && RUNE[ry][rx] === 'G';
        x.fillStyle = rune ? '#EAD886' : (y < 2 || !b.cells[(y - 1) * BW + i]) ? '#7F97AE' : (y > BH - 3 ? '#384A63' : '#4A607F');
        x.fillRect(i, y, 1, 1);
      }
    }
    b.dirty = false;
  }
  function barrierCell(b, px, py) {
    var cx = Math.floor(px - b.x), cy = Math.floor(py - b.y);
    if (cx < 0 || cy < 0 || cx >= BW || cy >= BH) return false;
    return b.cells[cy * BW + cx] === 1;
  }
  function damageBarrier(b, px, py, r) {
    var cx = px - b.x, cy = py - b.y;
    for (var y = Math.floor(cy - r); y <= cy + r; y++) {
      for (var x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= BW || y >= BH) continue;
        var d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r && Math.random() > d / r * 0.55) b.cells[y * BW + x] = 0;
      }
    }
    b.dirty = true;
    burst(px, py, '#7F97AE', 4, 30);
  }

  function newFormation() {
    enemies = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) enemies.push({ row: r, col: c, type: TYPES[ROW_TYPES[r]], alive: true });
    }
    aliveCount = enemies.length;
    form0 = aliveCount;
    ox = Math.round((W - (COLS - 1) * GAP_X) / 2);
    oy = 40 + Math.min(wave - 1, 6) * 6;
    dir = 1; stepT = 0; animFrame = 0; fireT = 1.2;
    enemyBolts = [];
    barriers = [0, 1, 2, 3].map(function (i) { return makeBarrier(Math.round(W * (i + 1) / 5 - BW / 2)); });
    book = null; bookT = rand(14, 22);
  }

  function startGame() {
    form.hidden = true;
    score = 0; lives = 3; wave = 1; playMs = 0; extraGiven = false;
    player = { x: W / 2, inv: 0 };
    bolt = null; particles = []; texts = [];
    keys.fire = false;
    newFormation();
    state = 'wavebreak'; breakT = 1.4;
    sfx.wave();
  }

  function enemyPos(e) { return { x: ox + e.col * GAP_X, y: oy + e.row * GAP_Y }; }
  function enemyBox(e) {
    var p = enemyPos(e), f = e.type.frames[0];
    return { x: p.x - f.width / 2, y: p.y - f.height / 2, w: f.width, h: f.height };
  }

  function burst(x, y, color, n, speed) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, v = rand(0.3, 1) * speed;
      particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.25, 0.6), max: 0.6, color: Math.random() < 0.3 ? '#FFF6CC' : color });
    }
  }
  function addScore(n, x, y) {
    score += n;
    if (x !== undefined) texts.push({ x: x, y: y, text: String(n), life: 0.9 });
    if (!extraGiven && score >= EXTRA_LIFE_AT) { extraGiven = true; lives++; sfx.life(); texts.push({ x: W / 2, y: H / 2, text: 'EXTRA LIFE!', life: 1.6 }); }
    if (score > hiScore) hiScore = score;
  }

  /* ---------- update ---------- */
  function update(dt) {
    frameClock += dt;
    stars.forEach(function (s) { s.p += dt * s.s; });
    particles = particles.filter(function (p) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 40 * dt; return p.life > 0; });
    texts = texts.filter(function (t) { t.life -= dt; t.y -= 12 * dt; return t.life > 0; });

    if (board.scores[0]) hiScore = Math.max(hiScore, board.scores[0].score);
    if (state === 'title') { titleT += dt; return; }
    if (state === 'paused' || state === 'over') { if (state === 'over') overT += dt; return; }
    playMs += dt * 1000;

    if (state === 'wavebreak') {
      breakT -= dt;
      movePlayer(dt);
      if (breakT <= 0) state = 'play';
      return;
    }
    if (state === 'dying') {
      dyingT -= dt;
      if (dyingT <= 0) {
        if (lives <= 0) return gameOver();
        state = 'play'; player.inv = 1.6; player.x = W / 2;
      }
      return;
    }

    // --- play ---
    movePlayer(dt);
    if (player.inv > 0) player.inv -= dt;

    if (keys.fire && !bolt) { bolt = { x: Math.round(player.x), y: PLAYER_Y - 8 }; sfx.cast(); }
    if (bolt) {
      bolt.y -= 270 * dt;
      if (Math.random() < 0.6) particles.push({ x: bolt.x + rand(-0.5, 0.5), y: bolt.y + 5, vx: 0, vy: 10, life: 0.25, max: 0.25, color: '#2E9BB5' });
      if (bolt.y < 12) bolt = null;
    }

    // formation march: faster as the ranks thin and the waves climb
    stepT -= dt;
    if (stepT <= 0) {
      stepT = (0.02 + 0.36 * aliveCount / form0) / (1 + 0.15 * (wave - 1));
      animFrame ^= 1;
      var minX = Infinity, maxX = -Infinity;
      enemies.forEach(function (e) {
        if (!e.alive) return;
        var b = enemyBox(e); minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x + b.w);
      });
      if ((dir > 0 && maxX + 3 > W - 6) || (dir < 0 && minX - 3 < 6)) { oy += 8; dir = -dir; }
      else ox += dir * 3;
    }

    // enemies reaching the barriers crumble them; reaching the wizard ends the game
    var lowest = 0;
    enemies.forEach(function (e) {
      if (!e.alive) return;
      var b = enemyBox(e); lowest = Math.max(lowest, b.y + b.h);
      if (b.y + b.h >= BARRIER_Y) {
        barriers.forEach(function (bar) {
          for (var y = Math.max(0, Math.floor(b.y - bar.y)); y < Math.min(BH, Math.ceil(b.y + b.h - bar.y)); y++)
            for (var x = Math.max(0, Math.floor(b.x - bar.x)); x < Math.min(BW, Math.ceil(b.x + b.w - bar.x)); x++)
              if (bar.cells[y * BW + x]) { bar.cells[y * BW + x] = 0; bar.dirty = true; }
        });
      }
    });
    if (lowest >= PLAYER_Y - 6) { lives = 0; hurtPlayer(); return; }

    // the player's bolt
    if (bolt) {
      for (var i = 0; i < enemies.length && bolt; i++) {
        var e = enemies[i]; if (!e.alive) continue;
        var b = enemyBox(e);
        if (bolt.x >= b.x - 1 && bolt.x <= b.x + b.w && bolt.y <= b.y + b.h && bolt.y + 5 >= b.y) {
          e.alive = false; aliveCount--;
          burst(b.x + b.w / 2, b.y + b.h / 2, e.type.color, 14, 60);
          addScore(e.type.pts);
          sfx.pop(); bolt = null;
        }
      }
    }
    if (bolt && book) {
      if (bolt.x >= book.x - 7 && bolt.x <= book.x + 7 && bolt.y <= 30 && bolt.y >= 14) {
        var v = BONUS_VALUES[Math.floor(Math.random() * BONUS_VALUES.length)];
        burst(book.x, 22, '#EAD886', 22, 70);
        addScore(v, book.x, 18); sfx.bonus();
        book = null; bolt = null;
      }
    }
    if (bolt) {
      for (var j = 0; j < barriers.length; j++) {
        var bar = barriers[j];
        if (barrierCell(bar, bolt.x, bolt.y) || barrierCell(bar, bolt.x, bolt.y + 3)) { damageBarrier(bar, bolt.x, bolt.y + 1, 2.2); bolt = null; break; }
      }
    }
    // enemy bolts can be shot down
    if (bolt) {
      enemyBolts = enemyBolts.filter(function (eb) {
        if (bolt && Math.abs(eb.x - bolt.x) <= 2 && bolt.y <= eb.y + 6 && bolt.y + 5 >= eb.y) {
          burst(eb.x, eb.y + 3, '#FF7AB8', 8, 40); bolt = null; return false;
        }
        return true;
      });
    }

    // enemy fire
    fireT -= dt;
    var maxBolts = Math.min(5, 2 + Math.floor(wave / 2));
    if (fireT <= 0 && aliveCount > 0) {
      fireT = rand(0.45, 1.25) / (1 + 0.12 * (wave - 1));
      if (enemyBolts.length < maxBolts) {
        var cols = {};
        enemies.forEach(function (e) { if (e.alive && (!cols[e.col] || e.row > cols[e.col].row)) cols[e.col] = e; });
        var shooters = Object.keys(cols).map(function (k) { return cols[k]; });
        var shooter = shooters[Math.floor(Math.random() * shooters.length)];
        if (Math.random() < 0.35) {
          shooter = shooters.reduce(function (best, e) {
            return Math.abs(enemyPos(e).x - player.x) < Math.abs(enemyPos(best).x - player.x) ? e : best;
          }, shooters[0]);
        }
        var sb = enemyBox(shooter);
        enemyBolts.push({ x: Math.round(sb.x + sb.w / 2), y: sb.y + sb.h, v: 70 + 7 * wave });
      }
    }
    enemyBolts = enemyBolts.filter(function (eb) {
      eb.y += eb.v * dt;
      if (eb.y > H - 14) { burst(eb.x, H - 14, '#FF7AB8', 4, 25); return false; }
      for (var k = 0; k < barriers.length; k++) {
        if (barrierCell(barriers[k], eb.x, eb.y + 6)) { damageBarrier(barriers[k], eb.x, eb.y + 5, 2.4); return false; }
      }
      if (player.inv <= 0 && state === 'play' && eb.x >= player.x - 6 && eb.x <= player.x + 6 && eb.y + 6 >= PLAYER_Y - 6 && eb.y <= PLAYER_Y + 6) {
        hurtPlayer(); return false;
      }
      return true;
    });

    // the wandering grimoire
    if (book) {
      book.x += book.dir * 38 * dt;
      if (book.x < -12 || book.x > W + 12) book = null;
    } else if (aliveCount >= 6) {
      bookT -= dt;
      if (bookT <= 0) { var d = Math.random() < 0.5 ? 1 : -1; book = { x: d > 0 ? -10 : W + 10, dir: d }; bookT = rand(16, 28); }
    }

    if (aliveCount === 0) {
      wave++; addScore(0);
      texts.push({ x: W / 2, y: H / 2 + 14, text: 'WAVE CLEARED', life: 1.4 });
      newFormation(); bolt = null;
      state = 'wavebreak'; breakT = 1.8; sfx.wave();
    }
  }

  function movePlayer(dt) {
    var v = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    player.x = Math.max(10, Math.min(W - 10, player.x + v * 115 * dt));
  }
  function hurtPlayer() {
    lives = Math.max(0, lives - 1);
    burst(player.x, PLAYER_Y, '#5E829C', 26, 70);
    burst(player.x, PLAYER_Y - 4, '#EAD886', 10, 50);
    sfx.hurt();
    bolt = null; enemyBolts = [];
    state = 'dying'; dyingT = 1.3;
  }
  function gameOver() {
    state = 'over'; overT = 0;
    keys.fire = false;
    if (qualifies(score)) {
      form.hidden = false; msg.textContent = ''; input.value = '';
      form.querySelector('button').disabled = false;
      setTimeout(function () { input.focus(); }, 50);
    }
  }
  function onSubmitInitials(e) {
    e.preventDefault();
    var name = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (name.length !== 3) { msg.textContent = 'Three letters or numbers, please.'; return; }
    var btn = form.querySelector('button'); btn.disabled = true; msg.textContent = 'Inscribing...';
    submitScore({ name: name, score: score, wave: wave, ms: Math.round(playMs) }).then(function (res) {
      if (res.ok) {
        lastEntry = { name: name, score: score };
        msg.textContent = res.local ? 'Saved on this device.' : '';
        form.hidden = true; canvas.focus && canvas.focus();
      } else {
        btn.disabled = false;
        msg.textContent = res.reason === 'name' ? 'Those initials are not allowed. Try others.' : 'The leaderboard refused that score.';
      }
    });
  }
  var lastEntry = null;

  /* ---------- drawing ---------- */
  function text(str, x, y, color, size, align) {
    ctx.font = (size || 8) + 'px Silkscreen, monospace';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#0B0D18';
    ctx.fillText(str, Math.round(x) + 1, Math.round(y) + 1);
    ctx.fillStyle = color;
    ctx.fillText(str, Math.round(x), Math.round(y));
  }
  function spr(img, x, y) { ctx.drawImage(img, Math.round(x), Math.round(y)); }
  function pad(n, len) { n = String(n); while (n.length < len) n = '0' + n; return n; }

  function draw() {
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0F1220'); g.addColorStop(1, '#1B2135');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    stars.forEach(function (s) {
      var a = 0.25 + 0.75 * Math.abs(Math.sin(s.p)) * s.b;
      ctx.fillStyle = 'rgba(209,210,212,' + a.toFixed(2) + ')';
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
    });

    if (state === 'title') return drawTitle();

    // ground
    ctx.fillStyle = 'rgba(234,216,134,.35)'; ctx.fillRect(0, H - 14, W, 1);

    barriers.forEach(function (bar) { if (bar.dirty) renderBarrier(bar); spr(bar.canvas, bar.x, bar.y); });
    enemies.forEach(function (e) {
      if (!e.alive) return;
      var b = enemyBox(e); spr(e.type.frames[animFrame], b.x, b.y);
    });
    if (book) spr(BOOK[Math.floor(frameClock * 6) % 2], book.x - 6, 16);

    // wizard (blinks while protected)
    if (state !== 'dying' && state !== 'over' && !(player.inv > 0 && Math.floor(frameClock * 12) % 2)) spr(WIZARD, player.x - 6, PLAYER_Y - 6);

    if (bolt) {
      ctx.fillStyle = '#5FD3EA'; ctx.fillRect(bolt.x, bolt.y + 1, 1, 4);
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(bolt.x, bolt.y, 1, 2);
      ctx.fillStyle = 'rgba(95,211,234,.35)'; ctx.fillRect(bolt.x - 1, bolt.y, 3, 3);
    }
    // enemy hexes: a little zigzag that wriggles as it falls
    enemyBolts.forEach(function (eb) {
      var zig = Math.floor(frameClock * 10 + eb.x) % 2 ? [-1, 1, -1] : [1, -1, 1];
      ctx.fillStyle = '#FF7AB8';
      for (var s = 0; s < 3; s++) ctx.fillRect(eb.x + zig[s], eb.y + s * 2, 1, 2);
      ctx.fillStyle = '#FFE1F0'; ctx.fillRect(eb.x, eb.y + 2, 1, 1);
    });
    particles.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    });
    ctx.globalAlpha = 1;
    texts.forEach(function (t) { text(t.text, t.x, t.y, '#EAD886', 8, 'center'); });

    // HUD
    text('SCORE ' + pad(score, 6), 6, 3, '#D1D2D4');
    text('HI ' + pad(Math.max(hiScore, score), 6), W / 2, 3, '#EAD886', 8, 'center');
    text('WAVE ' + wave, W - 6, 3, '#9AA8B1', 8, 'right');
    for (var i = 0; i < Math.min(lives, 6); i++) spr(LIFE_HAT, 6 + i * 10, H - 10);

    if (state === 'wavebreak') text('WAVE ' + wave, W / 2, H / 2 - 16, '#EAD886', 16, 'center');
    if (state === 'paused') {
      ctx.fillStyle = 'rgba(9,11,20,.6)'; ctx.fillRect(0, 0, W, H);
      text('PAUSED', W / 2, H / 2 - 12, '#EAD886', 16, 'center');
      text('P or tap to resume', W / 2, H / 2 + 10, '#9AA8B1', 8, 'center');
    }
    if (state === 'over') drawGameOver();
  }

  function drawTitle() {
    var page = Math.floor(titleT / 6) % 2;
    text('SPELLSTORM', W / 2, 22, '#EAD886', 24, 'center');
    text('Data gremlins are corrupting the dashboards!', W / 2, 54, '#9AA8B1', 8, 'center');
    if (page === 0) {
      var rows = [['ghost', 'NULL GHOST'], ['bat', 'CACHE BAT'], ['beetle', 'BUG']];
      rows.forEach(function (r, i) {
        var t = TYPES[r[0]], y = 82 + i * 20;
        spr(t.frames[Math.floor(titleT * 2) % 2], 104 - t.frames[0].width / 2, y);
        text(r[1] + '  ' + t.pts + ' PTS', 122, y + 1, '#D1D2D4');
      });
      spr(BOOK[Math.floor(titleT * 6) % 2], 98, 142);
      text('GRIMOIRE  ??? PTS', 122, 143, '#D1D2D4');
    } else {
      drawBoard(76);
    }
    var touch = window.matchMedia('(pointer: coarse)').matches;
    if (Math.floor(titleT * 2) % 2 === 0) text(touch ? 'TAP TO CAST' : 'PRESS SPACE TO CAST', W / 2, 186, '#5FD3EA', 8, 'center');
    spr(WIZARD, W / 2 - 6, 204);
  }

  function drawBoard(y0) {
    text(board.shared && !board.error ? 'HALL OF WIZARDS' : 'HALL OF WIZARDS (THIS DEVICE)', W / 2, y0, '#EAD886', 8, 'center');
    if (!board.loaded) { text('consulting the archives...', W / 2, y0 + 20, '#9AA8B1', 8, 'center'); return; }
    if (!board.scores.length) { text('No scores yet. Be the first!', W / 2, y0 + 20, '#9AA8B1', 8, 'center'); return; }
    board.scores.slice(0, 10).forEach(function (s, i) {
      var y = y0 + 14 + i * 9;
      var mine = lastEntry && s.name === lastEntry.name && s.score === lastEntry.score;
      var c = mine ? '#5FD3EA' : (i === 0 ? '#EAD886' : '#D1D2D4');
      text(pad(i + 1, 2) + '.', W / 2 - 52, y, c, 8, 'right');
      text(s.name, W / 2 - 44, y, c);
      text(pad(s.score, 6), W / 2 + 56, y, c, 8, 'right');
    });
  }

  function drawGameOver() {
    ctx.fillStyle = 'rgba(9,11,20,.72)'; ctx.fillRect(0, 0, W, H);
    text('GAME OVER', W / 2, 24, '#FF7AB8', 16, 'center');
    text('SCORE ' + pad(score, 6) + '   WAVE ' + wave, W / 2, 46, '#D1D2D4', 8, 'center');
    if (!form.hidden) {
      text('A new high score!', W / 2, 90, '#EAD886', 16, 'center');
      text('Enter your initials below', W / 2, 116, '#9AA8B1', 8, 'center');
      return;
    }
    drawBoard(66);
    if (overT > 0.8 && Math.floor(overT * 2) % 2 === 0) {
      var touch = window.matchMedia('(pointer: coarse)').matches;
      text(touch ? 'TAP TO PLAY AGAIN' : 'SPACE TO PLAY AGAIN', W / 2, 172, '#5FD3EA', 8, 'center');
    }
  }

  /* ---------- loop ---------- */
  var raf = 0, last = 0;
  function loop(t) {
    raf = requestAnimationFrame(loop);
    var dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;
    update(dt);
    draw();
  }
  function onVisibility() { if (document.hidden && state === 'play') state = 'paused'; }
  function onBlur() { if (state === 'play') state = 'paused'; keys.left = keys.right = keys.fire = false; }

  /* ---------- open / close ---------- */
  function open(from) {
    opener = from || document.activeElement;
    if (!overlay) { buildDom(); makeStars(); }
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = 'hidden';
    state = 'title'; titleT = 0; form.hidden = true;
    loadBoard();
    var best = localScores()[0];
    hiScore = Math.max(hiScore, best ? best.score : 0);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    if (document.fonts && document.fonts.load) document.fonts.load('8px Silkscreen');
    // focus the dialog itself (not a button) so Space and Enter go to the game
    overlay.focus({ preventScroll: true });
    last = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }
  function close() {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKey);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibility);
    keys.left = keys.right = keys.fire = false;
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.documentElement.style.overflow = '';
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }

  window.Spellstorm = { open: open, close: close };
})();
