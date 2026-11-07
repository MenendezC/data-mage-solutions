/* Contact modal: opens from any [data-open-contact] link, sends through Formspree,
   and protects the inbox with Cloudflare Turnstile + a honeypot + a speed check. */
(function () {
  'use strict';

  var CONFIG = {
    // Formspree form endpoint, e.g. https://formspree.io/f/abcdwxyz
    formEndpoint: 'https://formspree.io/f/mnppydlw',
    // Cloudflare Turnstile site key (public). Secret key goes in Formspree, never here.
    turnstileSiteKey: '0x4AAAAAAF3O-A8NVfoGn3DK',
    // Anything submitted faster than this after opening is treated as a bot.
    minFillMs: 3000
  };

  var dialog = document.getElementById('contact-modal');
  // Old browsers without <dialog>: links just scroll to the contact section.
  if (!dialog || typeof dialog.showModal !== 'function') return;

  var form = document.getElementById('contact-form');
  var formView = dialog.querySelector('[data-view="form"]');
  var successView = dialog.querySelector('[data-view="success"]');
  var statusEl = dialog.querySelector('.form-status');
  var submitBtn = form.querySelector('button[type="submit"]');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  var openedAt = 0;
  var closing = false;
  var turnstileId = null;
  var configured = CONFIG.formEndpoint.indexOf('FORMSPREE_FORM_ID') === -1 &&
                   CONFIG.turnstileSiteKey.indexOf('TURNSTILE_SITE_KEY') === -1;

  /* ---------- Turnstile (loaded only when the modal is first opened) ---------- */
  // Check for the real API, not just a global named "turnstile": browsers expose any element
  // with id="turnstile" as window.turnstile, which once fooled this into skipping the load.
  function turnstileReady() {
    return !!(window.turnstile && typeof window.turnstile.render === 'function');
  }

  function renderTurnstile() {
    if (turnstileId !== null || !turnstileReady() || !configured) return;
    turnstileId = window.turnstile.render('#cf-turnstile-slot', {
      sitekey: CONFIG.turnstileSiteKey,
      theme: 'dark',
      size: 'flexible'
    });
  }

  function loadTurnstile() {
    if (!configured) return;
    if (turnstileReady()) { renderTurnstile(); return; }
    if (document.getElementById('cf-turnstile-script')) return;
    window.dmTurnstileReady = renderTurnstile;
    var s = document.createElement('script');
    s.id = 'cf-turnstile-script';
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=dmTurnstileReady';
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }

  function resetTurnstile() {
    if (turnstileReady() && turnstileId !== null) window.turnstile.reset(turnstileId);
  }

  /* ---------- Open / close with the summon + dismiss animations ---------- */
  function showView(name) {
    formView.hidden = name !== 'form';
    successView.hidden = name !== 'success';
  }

  function openModal(e) {
    if (e) e.preventDefault();
    if (dialog.open) return;
    showView('form');
    setStatus('');
    dialog.classList.remove('is-closing');
    dialog.showModal();
    openedAt = Date.now();
    loadTurnstile();
  }

  function closeModal() {
    if (!dialog.open || closing) return;
    closing = true;
    dialog.classList.add('is-closing');
    window.setTimeout(function () {
      dialog.classList.remove('is-closing');
      dialog.close();
      closing = false;
    }, reducedMotion.matches ? 0 : 240);
  }

  document.querySelectorAll('[data-open-contact]').forEach(function (el) {
    el.addEventListener('click', openModal);
  });
  dialog.querySelectorAll('[data-close-contact]').forEach(function (el) {
    el.addEventListener('click', closeModal);
  });
  // Esc key: run the dismiss animation instead of closing instantly.
  dialog.addEventListener('cancel', function (e) { e.preventDefault(); closeModal(); });
  // Click on the dimmed backdrop closes; clicks inside the panel don't.
  dialog.addEventListener('click', function (e) { if (e.target === dialog) closeModal(); });

  /* ---------- Sending ---------- */
  function setStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.classList.toggle('is-error', type === 'error');
  }

  function setSending(on) {
    submitBtn.disabled = on;
    submitBtn.textContent = on ? 'Sending…' : 'Send message';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    // Bot traps: hidden honeypot filled in, or form completed inhumanly fast.
    // Pretend it worked so the bot learns nothing, but send nothing.
    var honeypot = form.elements._gotcha;
    if ((honeypot && honeypot.value) || Date.now() - openedAt < CONFIG.minFillMs) {
      form.reset();
      showView('success');
      return;
    }

    if (!configured) {
      setStatus('The contact form isn\'t connected yet.', 'error');
      return;
    }

    var token = form.querySelector('[name="cf-turnstile-response"]');
    if (!token || !token.value) {
      setStatus('Please complete the quick human check above the button.', 'error');
      return;
    }

    setStatus('');
    setSending(true);

    fetch(CONFIG.formEndpoint, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        form.reset();
        showView('success');
        var heading = successView.querySelector('h2');
        if (heading) heading.focus();
      })
      .catch(function () {
        setStatus('Your message didn\'t send. Please try again in a moment.', 'error');
      })
      .then(function () {
        setSending(false);
        resetTurnstile();
      });
  });
})();
