/* New Horizon Repair Services, site behaviour (no dependencies). Hooks are data-attributes so markup can change freely. */
(function () {
  'use strict';
  var d = document, w = window;
  var CONSENT_KEY = 'nh_cookie_consent';
  function $(sel, root) { return (root || d).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || d).querySelectorAll(sel)); }
  function store(k, v) { try { v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  /* ---------- Mobile navigation ---------- */
  $$('[data-nav-toggle]').forEach(function (btn) {
    var targetSel = btn.getAttribute('data-nav-toggle') || '[data-nav]';
    var nav = $(targetSel);
    if (!nav) return;
    btn.setAttribute('aria-expanded', 'false');
    function setOpen(open) {
      nav.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      d.documentElement.classList.toggle('nav-open', open);
      /* keep Tab inside the open menu: everything outside the header is inert (no-op where unsupported) */
      $$('.skip-link, .topbar, main, footer, .mobile-cta, [data-cookie-banner]').forEach(function (el) { el.inert = open; });
    }
    btn.addEventListener('click', function () { setOpen(!nav.classList.contains('is-open')); if (!nav.classList.contains('is-open')) btn.focus(); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); btn.focus(); } });
  });
  /* Dropdown submenus: open on click for touch/keyboard (hover handled in CSS) */
  var deskNav = w.matchMedia('(min-width:1100px)');
  $$('[data-submenu-toggle]').forEach(function (btn) {
    var item = btn.closest('[data-has-submenu]') || btn.parentElement;
    btn.setAttribute('aria-expanded', 'false');
    /* keep the reported state matching the panel, which CSS also opens on hover/focus at desktop widths */
    function sync(open) { btn.setAttribute('aria-expanded', (open || item.classList.contains('is-open')) ? 'true' : 'false'); }
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      item.classList.toggle('is-open');
      sync(deskNav.matches); /* at desktop widths the toggle keeps focus inside, so the panel stays open */
    });
    ['focusin', 'mouseenter'].forEach(function (type) {
      item.addEventListener(type, function () { if (deskNav.matches) sync(true); });
    });
    ['focusout', 'mouseleave'].forEach(function (type) {
      item.addEventListener(type, function (e) {
        if (!deskNav.matches) return;
        if (type === 'focusout' && e.relatedTarget && item.contains(e.relatedTarget)) return;
        sync(false);
      });
    });
  });
  /* Header shadow after scroll */
  var header = $('[data-header]');
  if (header) {
    var onScroll = function () { header.classList.toggle('is-scrolled', w.scrollY > 8); };
    onScroll(); w.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- Analytics (GA4) gated by cookie consent ---------- */
  var gaId = (d.querySelector('meta[name="ga-id"]') || {}).content || '';
  var gaLoaded = false;
  w.dataLayer = w.dataLayer || [];
  function gtag() { w.dataLayer.push(arguments); }
  w.gtag = w.gtag || gtag;
  function loadGA() {
    if (gaLoaded || !gaId) return;
    gaLoaded = true;
    gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
    gtag('js', new Date());
    gtag('config', gaId, { anonymize_ip: true });
    var s = d.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gaId);
    d.head.appendChild(s);
  }
  function track(name, params) { if (gaLoaded) gtag('event', name, params || {}); }

  /* ---------- Cookie consent banner ---------- */
  var banner = $('[data-cookie-banner]');
  function showBanner() { if (banner) { banner.hidden = false; banner.setAttribute('aria-hidden', 'false'); } }
  function hideBanner() { if (banner) { banner.hidden = true; banner.setAttribute('aria-hidden', 'true'); } }
  function revokeGA() {
    if (!gaLoaded) return;
    w['ga-disable-' + gaId] = true;
    gtag('consent', 'update', { analytics_storage: 'denied' });
    var host = location.hostname, parts = host.split('.'), apex = parts.length > 2 ? parts.slice(-2).join('.') : host;
    d.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (name !== '_ga' && name.indexOf('_ga_') !== 0) return;
      d.cookie = name + '=; Max-Age=0; path=/';
      [host, '.' + host, '.' + apex].forEach(function (dom) { d.cookie = name + '=; Max-Age=0; path=/; domain=' + dom; });
    });
  }
  function applyConsent(value) {
    store(CONSENT_KEY, value);
    hideBanner();
    if (value === 'granted') loadGA(); else revokeGA();
  }
  var saved = read(CONSENT_KEY);
  if (saved === 'granted') loadGA();
  else if (saved !== 'denied' && gaId) showBanner();
  $$('[data-consent]').forEach(function (b) { b.addEventListener('click', function () { applyConsent(b.getAttribute('data-consent') === 'accept' ? 'granted' : 'denied'); }); });
  $$('[data-open-cookie-settings]').forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); store(CONSENT_KEY, undefined); showBanner(); }); });

  /* ---------- Click tracking for calls / emails / CTAs ---------- */
  $$('a[href^="tel:"]').forEach(function (a) { a.addEventListener('click', function () { track('click_call', { link_url: a.href }); }); });
  $$('a[href^="mailto:"]').forEach(function (a) { a.addEventListener('click', function () { track('click_email', { link_url: a.href }); }); });
  $$('[data-track]').forEach(function (a) { a.addEventListener('click', function () { track(a.getAttribute('data-track'), { link_text: (a.textContent || '').trim().slice(0, 60) }); }); });

  /* ---------- Quote form: validation + async submit ---------- */
  /* Same limits and option lists as api/_lib/quote-core.js; the server is the source of truth. */
  var PROJECT_TYPES = ['kitchen', 'bathroom', 'whole-home', 'adu-garage', 'pool-backyard', 'landscape', 'repair', 'commercial', 'other'];
  var BUDGETS = ['under-10k', '10k-30k', '30k-75k', '75k-plus', 'not-sure'];
  function usPhone(v) { var n = v.replace(/\D/g, ''); if (n.length === 11 && n.charAt(0) === '1') n = n.slice(1); return n.length === 10 ? n : ''; }
  var RULES = {
    name: function (v) { v = v.trim(); if (v.length < 2) return 'Enter your full name.'; if (v.length > 80) return 'Keep your name to 80 characters or fewer.'; return true; },
    phone: function (v) { if (!v.trim()) return 'Enter your phone number so we can call you back.'; return !!usPhone(v) || 'Enter a 10-digit US phone number.'; },
    email: function (v) { v = v.trim(); if (!v) return 'Enter your email address.'; return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || 'Enter a valid email address, like name@example.com.'; },
    city: function (v) { v = v.trim(); if (v.length < 2) return 'Enter the city where the project is.'; if (v.length > 60) return 'Keep the city name to 60 characters or fewer.'; return true; },
    project_type: function (v) { return PROJECT_TYPES.indexOf(v) !== -1 || 'Choose the type of project.'; },
    budget: function (v) { return BUDGETS.indexOf(v) !== -1 || 'Choose a budget range. Not sure yet is fine.'; },
    message: function (v) { v = v.trim(); if (v.length < 10) return 'Tell us what you need, in at least a few words.'; if (v.length > 2000) return 'Keep your message to 2,000 characters or fewer.'; return true; },
    source: function (v) { return v.trim().length <= 80 || 'Keep this to 80 characters or fewer.'; }
  };
  $$('form[data-quote-form]').forEach(function (form) {
    var ts = form.querySelector('input[name="_ts"]'); if (ts) ts.value = String(Date.now());
    var pg = form.querySelector('input[name="_page"]'); if (pg) pg.value = location.pathname;
    var status = form.querySelector('[data-form-status]');
    var submitBtn = form.querySelector('[type="submit"]');
    function errEl(name) { return form.querySelector('[data-error-for="' + name + '"]'); }
    function setError(el, msg) {
      var name = el.name, box = errEl(name);
      if (box) { box.textContent = msg || ''; box.hidden = !msg; }
      el.setAttribute('aria-invalid', msg ? 'true' : 'false');
      (el.closest('.field') || el.parentElement).classList.toggle('has-error', !!msg);
    }
    function validateField(el) {
      var rule = RULES[el.name]; if (!rule) return true;
      var r = rule(el.value, el); setError(el, r === true ? '' : r); return r === true;
    }
    form.setAttribute('novalidate', 'novalidate');
    $$('input, select, textarea', form).forEach(function (el) {
      el.addEventListener('blur', function () { validateField(el); });
      el.addEventListener('input', function () { if (el.getAttribute('aria-invalid') === 'true') validateField(el); });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true, first = null;
      $$('input, select, textarea', form).forEach(function (el) { if (!validateField(el)) { ok = false; first = first || el; } });
      if (!ok) { if (first) first.focus(); if (status) { status.textContent = 'Please fix the highlighted fields.'; status.className = 'form-status is-error'; } return; }
      if (d.querySelector('meta[name="preview-mode"]')) {
        if (status) { status.textContent = 'This is a preview of the new site, so the form is not connected yet. Please call (949) 939-6445 or email contact@newhorizonrepairservices.com.'; status.className = 'form-status is-pending'; }
        return;
      }
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      if (status) { status.textContent = 'Sending your request…'; status.className = 'form-status is-pending'; }
      if (submitBtn) { submitBtn.disabled = true; submitBtn.setAttribute('aria-busy', 'true'); }
      fetch(form.getAttribute('action') || '/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
        .then(function (x) {
          if (x.j && x.j.ok) {
            track('generate_lead', { project_type: data.project_type || '', budget: data.budget || '' });
            if (status) { status.textContent = 'Thanks. We received your request and will be in touch soon. Need it sooner? Call (949) 939-6445.'; status.className = 'form-status is-success'; }
            w.location.assign(x.j.redirect || '/thank-you');
            return;
          }
          if (x.j && x.j.errors) { Object.keys(x.j.errors).forEach(function (k) { var el = form.querySelector('[name="' + k + '"]'); if (el) setError(el, x.j.errors[k]); }); }
          if (status) { status.textContent = (x.j && x.j.error) || 'Something went wrong. Please try again or call (949) 939-6445.'; status.className = 'form-status is-error'; }
          if (w.turnstile && form.querySelector('.cf-turnstile')) { try { w.turnstile.reset(); } catch (err) {} }
        })
        .catch(function () { if (status) { status.textContent = 'We could not send your request. Please call (949) 939-6445 or email contact@newhorizonrepairservices.com.'; status.className = 'form-status is-error'; } })
        .then(function () { if (submitBtn) { submitBtn.disabled = false; submitBtn.removeAttribute('aria-busy'); } });
    });
  });

  /* ---------- Quote modal (GoHighLevel form) ----------
     Every "Get a Free Estimate" button carries data-quote-open. With JavaScript it opens the
     dialog and loads the hosted form in an iframe on first open. Without JavaScript the same
     button stays a plain link to that hosted form, so the call to action never dead-ends. */
  var modal = $('[data-quote-modal]');
  if (modal) {
    var frame = $('[data-quote-frame]', modal);
    var loading = $('[data-quote-loading]', modal);
    var frameLoaded = false;
    var lastFocus = null;
    var hideLoading = function () { if (loading) loading.hidden = true; };
    if (frame) frame.addEventListener('load', function () { if (frameLoaded) hideLoading(); });

    var openModal = function (trigger) {
      lastFocus = trigger || d.activeElement;
      if (!frameLoaded && frame) { frameLoaded = true; frame.src = frame.getAttribute('data-src'); w.setTimeout(hideLoading, 8000); }
      if (typeof modal.showModal === 'function') modal.showModal(); else modal.setAttribute('open', '');
      d.documentElement.classList.add('modal-open');
      track('open_quote_form', { link_text: trigger ? (trigger.textContent || '').trim().slice(0, 60) : '' });
    };
    var closeModal = function () {
      if (typeof modal.close === 'function') modal.close(); else modal.removeAttribute('open');
      d.documentElement.classList.remove('modal-open');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    };
    d.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var opener = t.closest('[data-quote-open]');
      if (opener) { e.preventDefault(); openModal(opener); return; }
      if (t.closest('[data-quote-close]')) { e.preventDefault(); closeModal(); return; }
      if (t === modal) { // click landed on the backdrop, not on the dialog box
        var b = modal.getBoundingClientRect();
        if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) closeModal();
      }
    });
    modal.addEventListener('close', function () { d.documentElement.classList.remove('modal-open'); });
    modal.addEventListener('cancel', function () { d.documentElement.classList.remove('modal-open'); });
    if (/[?&]quote(=|&|$)/.test(location.search) || location.hash === '#quote') {
      w.addEventListener('load', function () { openModal(null); });
    }
  }

  /* ---------- Decode lazy photos as they arrive, so the before/after handle never reveals a half-decoded frame ---------- */
  $$('main img[loading="lazy"]').forEach(function (img) {
    function go() { if (img.decode) img.decode().catch(function () {}); }
    if (img.complete && img.naturalWidth) go(); else img.addEventListener('load', go, { once: true });
  });

  /* ---------- Before / after comparison slider ---------- */
  $$('[data-compare]').forEach(function (box) {
    var range = box.querySelector('input[type="range"]'), after = box.querySelector('[data-compare-after]');
    if (!range || !after) return;
    var update = function () { after.style.width = range.value + '%'; box.style.setProperty('--pos', range.value + '%'); };
    range.addEventListener('input', update); update();
  });

  /* ---------- Leave-a-review: star picker ---------- */
  /* 5 stars is a plain link to Google. 1 to 4 reveal the private form in place, without a reload,
     and stamp the rating onto the form so the owner sees which one was picked. Without JavaScript
     the same links still work: they carry ?r=N and the #private anchor, which CSS :target reveals. */
  var picker = $('.rating-picker');
  if (picker) {
    var panel = document.getElementById('private');
    var star = '<svg class="icon" aria-hidden="true"><use href="#i-star"/></svg>';
    var openPrivate = function (n) {
      if (!panel) return;
      var field = $('[data-rating-field]'); if (field) field.value = n;
      var echo = $('[data-rating-echo]');
      if (echo) {
        var stars = $('[data-rating-stars]', echo), label = $('[data-rating-label]', echo);
        if (stars) { stars.innerHTML = new Array(Number(n) + 1).join(star); stars.setAttribute('aria-label', n + ' out of 5'); }
        if (label) label.textContent = n === '1' ? 'You picked 1 star' : 'You picked ' + n + ' stars';
        echo.hidden = false;
      }
      panel.classList.add('is-open');
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var first = $('#f-name'); if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 350);
    };
    picker.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[data-rating]') : null;
      if (!a) return;
      var n = a.getAttribute('data-rating');
      if (n === '5') return;               // deixa o link para o Google seguir normalmente
      e.preventDefault();
      openPrivate(n);
    });
    // chegada direta em ?r=N (sem JS no clique anterior, ou link colado)
    var m = /[?&]r=([1-4])\b/.exec(location.search);
    if (m) openPrivate(m[1]);
  }

  /* ---------- Contact page: show server-side error after non-JS redirect ---------- */
  if (/[?&]error=1/.test(location.search)) { var s = $('[data-form-status]'); if (s) { s.textContent = 'We could not send your request. Please check the form and try again, or call (949) 939-6445.'; s.className = 'form-status is-error'; } }
})();

/* ---------- GHL chat widget: keep the bubble above the fixed .mobile-cta bar on phones ----------
   The widget renders inside a shadow root, so page CSS cannot reach it; we inject a <style> there. */
(function () {
  var CSS = '@media(max-width:899px){.nh-chat-lift{bottom:92px!important}}';
  function lift(host) {
    var sr = host.shadowRoot; if (!sr) return false;
    if (!sr.querySelector('style[data-nh-chat-lift]')) { var st = document.createElement('style'); st.setAttribute('data-nh-chat-lift', ''); st.textContent = CSS; sr.appendChild(st); }
    sr.querySelectorAll('*').forEach(function (el) {
      if (el.classList.contains('nh-chat-lift') || el.tagName === 'STYLE') return;
      var cs = getComputedStyle(el);
      if (cs.position === 'fixed' && parseFloat(cs.bottom) < 48) el.classList.add('nh-chat-lift');
    });
    if (!sr.__nhObserved) { sr.__nhObserved = true; new MutationObserver(function () { lift(host); }).observe(sr, { childList: true, subtree: true }); }
    return true;
  }
  var tries = 0, t = setInterval(function () {
    var host = document.querySelector('chat-widget');
    if ((host && lift(host)) || ++tries > 60) clearInterval(t);
  }, 500);
})();
