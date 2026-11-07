/* Magic & motion: mana bar, materialize-on-scroll, starfield depth, card spotlight.
   Everything here is decoration: the page works fully without it. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var canHover = window.matchMedia('(hover: hover) and (pointer: fine)');

  /* =====================================================================
     Mana bar: liquid drawn on a canvas at the display's refresh rate
     ===================================================================== */
  var mana = (function () {
    var bar = document.querySelector('.mana-bar');
    var canvas = bar && bar.querySelector('.mana-canvas');
    if (!canvas || !canvas.getContext) return null;
    var ctx = canvas.getContext('2d');

    // Liquid palette: bright surface line, then light, mid and deep bands
    var C_SHINE = '#C8F7FF', C_LIGHT = '#5FD3EA', C_MID = '#2E9BB5', C_DEEP = '#1C7189', C_BUBBLE = 'rgba(214, 250, 255, 0.9)';

    var W = 0, H = 0, dpr = 1;
    var LIQUID = 7;        // depth of the liquid band at the bottom of the canvas (px)
    var target = 0;        // where the liquid should end (px), from scroll position
    var level = 0;         // where it currently ends (eases toward target)
    var slosh = 0;         // how far the front edge leans (from fill speed)
    var bubbles = [], pops = [], fizz = [];
    var running = false, lastT = 0, clock = 0;

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = bar.clientWidth;
      H = bar.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Height of the liquid surface (px from the top) at x: two blended waves
    function surface(x) {
      var y = (H - LIQUID) + 2
        + 0.6 * Math.sin(x * 0.042 - clock * 1.5)
        + 0.3 * Math.sin(x * 0.115 + clock * 2.2);
      // The front edge piles up (or dips) with the slosh, fading out behind it
      var d = level - x;
      if (d < 40) y -= slosh * Math.exp(-d / 14);
      return y;
    }

    // Fill the liquid body, with its top following the surface pushed down by `offset`
    function band(offset, color) {
      var end = level - offset * 0.6;
      if (end <= 4) return;
      ctx.beginPath();
      ctx.moveTo(0, H);
      var step = 3, x = 0, y;
      for (; x < end - 3; x += step) {
        y = Math.min(H, surface(x) + offset);
        ctx.lineTo(x, y);
      }
      y = Math.min(H, surface(end - 3) + offset);
      ctx.lineTo(end - 3, y);
      // Rounded front of the liquid (a little meniscus)
      ctx.quadraticCurveTo(end + 1, y, end, Math.min(H, y + (H - y) * 0.55));
      ctx.lineTo(end, H);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }

    function shineLine() {
      var end = level - 4;
      if (end <= 2) return;
      ctx.beginPath();
      for (var x = 0; x < end; x += 3) {
        var y = surface(x) + 0.5;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = C_SHINE;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.85;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function snap(v) { return Math.round(v * dpr) / dpr; }

    function updateBubbles(dt) {
      // More liquid, more bubbles: roughly 2 to 10 per second, like a fizzy potion
      if (!reducedMotion.matches && level > 16) {
        var rate = 2 + 8 * (level / Math.max(W, 1));
        if (Math.random() < rate * dt) {
          bubbles.push({
            x: 6 + Math.random() * (level - 14),
            y: H - 1,
            vy: 3 + Math.random() * 4,
            size: Math.random() < 0.3 ? 2 : 1.5,
            phase: Math.random() * Math.PI * 2
          });
        }
      }
      for (var i = bubbles.length - 1; i >= 0; i--) {
        var b = bubbles[i];
        b.y -= b.vy * dt;
        b.x += Math.sin(clock * 3 + b.phase) * 0.12;
        var top = surface(b.x) + 0.8;
        if (b.y <= top || b.x > level - 3) {
          if (b.x < level - 3) {
            if (Math.random() < 0.4) {
              // Breaks free and fizzes up into the header
              var life = 0.9 + Math.random() * 0.7;
              fizz.push({ x: b.x, y: top - 1, vy: 14 + Math.random() * 12, size: b.size, phase: b.phase, age: 0, life: life });
            } else {
              // Pops at the surface with a tiny sparkle
              pops.push({ x: b.x, y: top - 0.5, age: 0 });
            }
          }
          bubbles.splice(i, 1);
        }
      }
      for (var f = fizz.length - 1; f >= 0; f--) {
        var z = fizz[f];
        z.age += dt;
        z.vy *= Math.pow(0.35, dt);                        // slows as it rises
        z.y -= z.vy * dt;
        z.x += Math.sin(clock * 4 + z.phase) * 0.18;       // gentle drift
        if (z.age >= z.life || z.y < 1) fizz.splice(f, 1);
      }
      for (var j = pops.length - 1; j >= 0; j--) {
        pops[j].age += dt;
        if (pops[j].age > 0.32) pops.splice(j, 1);
      }
    }

    function drawParticles() {
      ctx.fillStyle = C_BUBBLE;
      for (var i = 0; i < bubbles.length; i++) {
        var b = bubbles[i];
        ctx.fillRect(snap(b.x), snap(b.y), b.size, b.size);
      }
      for (var j = 0; j < pops.length; j++) {
        var p = pops[j], k = p.age / 0.32;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#FFFFFF';
        if (p.age < 0.08) ctx.fillRect(snap(p.x), snap(p.y - 0.5), 1.5, 1.5);
        ctx.fillStyle = C_SHINE;
        var spread = 1 + k * 3;
        ctx.fillRect(snap(p.x - spread), snap(p.y - k * 1.5), 1, 1);
        ctx.fillRect(snap(p.x + spread), snap(p.y - k * 1.5), 1, 1);
        ctx.globalAlpha = 1;
      }
      // Fizz above the liquid: fades and shrinks as it rises
      for (var f = 0; f < fizz.length; f++) {
        var z = fizz[f], t = z.age / z.life;
        ctx.globalAlpha = Math.max(0, 0.9 * (1 - t * t));
        ctx.fillStyle = t < 0.5 ? C_BUBBLE : C_SHINE;
        var s = Math.max(1, z.size * (1 - t * 0.5));
        ctx.fillRect(snap(z.x), snap(z.y), s, s);
      }
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      var dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
      lastT = now;
      if (!reducedMotion.matches) clock += dt;

      // Ease the level toward the target, and let the front edge lean with the speed
      var prev = level;
      if (reducedMotion.matches) level = target;
      else level += (target - level) * Math.min(1, dt * 7);
      if (Math.abs(target - level) < 0.05) level = target;
      var speed = (level - prev) / Math.max(dt, 0.001);          // px per second
      var lean = Math.max(-1.6, Math.min(1.6, speed * 0.009));
      slosh += (lean - slosh) * Math.min(1, dt * 6);              // springs back when you stop

      updateBubbles(dt);

      ctx.clearRect(0, 0, W, H);
      if (level > 0.5) {
        band(0, C_LIGHT);
        band(1.3, C_MID);
        band(3.3, C_DEEP);
        shineLine();
      }
      drawParticles();

      // Keep animating while there's liquid (it's always gently moving),
      // otherwise stop until the next scroll.
      if (level > 0.5 || target > 0.5 || bubbles.length || pops.length || fizz.length) {
        if (reducedMotion.matches && level === target) { running = false; return; }
        window.requestAnimationFrame(frame);
      } else {
        running = false;
      }
    }

    function start() {
      if (running) return;
      running = true;
      lastT = performance.now();
      window.requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener('resize', function () { resize(); start(); });

    return {
      setProgress: function (p) { target = p * W; start(); }
    };
  })();

  /* =====================================================================
     Depth parallax: scroll + mouse move every layer by its own distance
     ===================================================================== */
  function nodes(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  var starLayers = nodes('.star-layer').map(function (el) {
    return { el: el, depth: parseFloat(el.getAttribute('data-depth')) || 0 };
  });
  var horizonLayers = nodes('.horizon [data-speed]').map(function (el) {
    return { el: el, speed: parseFloat(el.getAttribute('data-speed')) || 0, mouse: parseFloat(el.getAttribute('data-mouse')) || 0 };
  });
  var motes = document.querySelector('.motes');
  var contact = document.getElementById('contact');
  var footer = document.querySelector('.site-footer');

  // Mouse position, -1..1 from the centre of the window, eased for a weighty feel
  var mouse = { tx: 0, ty: 0, x: 0, y: 0 };
  var useMotion = !reducedMotion.matches;

  function applyDepth() {
    var y = window.scrollY || window.pageYOffset;
    var h = window.innerHeight;

    // Stars: drift with scroll at their depth (wrapping seamlessly), and lean with the mouse
    for (var i = 0; i < starLayers.length; i++) {
      var d = starLayers[i].depth;
      var sx = mouse.x * d * 120;
      var sy = -((y * d) % h) + mouse.y * d * 70;
      starLayers[i].el.style.transform = 'translate3d(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px,0)';
    }

    // Motes are in front of the page, so they move faster than it does
    if (motes) {
      var my = -((y * 1.25) % h) + mouse.y * 26;
      motes.style.transform = 'translate3d(' + (mouse.x * 40).toFixed(1) + 'px,' + my.toFixed(1) + 'px,0)';
    }

    // Horizon: farther layers lag behind the scroll; all settle into place at the bottom of the page
    if (horizonLayers.length && contact) {
      var r = contact.getBoundingClientRect();
      if (r.top < h * 1.5) {
        var t = Math.max(0, r.bottom + (footer ? footer.offsetHeight : 0) - h);
        for (var k = 0; k < horizonLayers.length; k++) {
          var L = horizonLayers[k];
          L.el.style.transform = 'translate3d(' + (mouse.x * L.mouse).toFixed(1) + 'px,' + (t * L.speed).toFixed(1) + 'px,0)';
        }
      }
    }
  }

  /* ---------- Scroll: mana bar + depth, once per frame ---------- */
  var ticking = false;
  function onScrollFrame() {
    ticking = false;
    var y = window.scrollY || window.pageYOffset;
    var max = root.scrollHeight - window.innerHeight;
    if (mana) mana.setProgress(max > 0 ? Math.min(1, Math.max(0, y / max)) : 0);
    if (useMotion) applyDepth();
  }
  function requestFrame() {
    if (!ticking) { ticking = true; window.requestAnimationFrame(onScrollFrame); }
  }
  window.addEventListener('scroll', requestFrame, { passive: true });
  window.addEventListener('resize', requestFrame);
  onScrollFrame();

  /* ---------- Mouse parallax (desktop only) ---------- */
  var mouseLoop = false;
  function mouseFrame() {
    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;
    applyDepth();
    if (Math.abs(mouse.tx - mouse.x) > 0.0005 || Math.abs(mouse.ty - mouse.y) > 0.0005) {
      window.requestAnimationFrame(mouseFrame);
    } else {
      mouseLoop = false;
    }
  }
  function kickMouse() {
    if (!mouseLoop) { mouseLoop = true; window.requestAnimationFrame(mouseFrame); }
  }
  if (useMotion && canHover.matches) {
    window.addEventListener('pointermove', function (e) {
      mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
      kickMouse();
    }, { passive: true });
    // Drift back to centre when the mouse leaves the window
    document.addEventListener('mouseleave', function () { mouse.tx = 0; mouse.ty = 0; kickMouse(); });
  }

  /* ---------- Materialize on scroll ---------- */
  var revealEls = document.querySelectorAll('[data-reveal]');
  if (reducedMotion.matches || !('IntersectionObserver' in window)) {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Cursor spotlight on cards (mouse only) ---------- */
  if (canHover.matches) {
    document.querySelectorAll('.spotlight').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
      });
    });
  }
})();
