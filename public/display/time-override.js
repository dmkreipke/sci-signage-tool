// Time override shim. Loaded before each display's main script so that
// `window.__nowDate()` is available as a drop-in for `new Date()`.
//
// State lives in localStorage under 'sciTimeOverride' (set by the admin page).
// Same-origin `storage` events propagate changes to open preview tabs instantly.

(function () {
  const KEY = 'sciTimeOverride';
  const MAX_ANCHOR_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours — stale overrides are ignored
  const BANNER_ID = 'time-override-banner';

  function readState() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.enabled) return null;
      if (typeof s.anchorDisplayTime !== 'string' || !/^\d{2}:\d{2}$/.test(s.anchorDisplayTime)) return null;
      if (typeof s.anchorRealTime !== 'number') return null;
      if (Date.now() - s.anchorRealTime > MAX_ANCHOR_AGE_MS) return null;
      return s;
    } catch {
      return null;
    }
  }

  function computeVirtualDate(state) {
    const [h, m] = state.anchorDisplayTime.split(':').map(Number);
    const anchorDisplay = new Date(state.anchorRealTime);
    anchorDisplay.setHours(h, m, 0, 0);
    const elapsed = Date.now() - state.anchorRealTime;
    return new Date(anchorDisplay.getTime() + elapsed);
  }

  window.__nowDate = function () {
    const s = readState();
    return s ? computeVirtualDate(s) : new Date();
  };

  window.__nowMinutes = function () {
    const d = window.__nowDate();
    return d.getHours() * 60 + d.getMinutes();
  };

  function fmtClock(d) {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  function ensureBanner(state) {
    let el = document.getElementById(BANNER_ID);
    if (!state) {
      if (el) el.remove();
      document.body && document.body.classList.remove('has-time-override-banner');
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = BANNER_ID;
      el.setAttribute('role', 'status');
      el.style.cssText = [
        'position:fixed', 'left:0', 'right:0',
        'background:#f1c40f', 'color:#000',
        'text-align:center', 'font-weight:700',
        'font-family:system-ui,sans-serif', 'font-size:14px',
        'letter-spacing:0.05em', 'padding:4px 8px',
        'z-index:9999', 'pointer-events:none',
        'box-shadow:0 2px 6px rgba(0,0,0,0.3)',
      ].join(';');
      // Stack below an existing .preview-banner if one is present.
      const hasPreview = !!document.querySelector('.preview-banner');
      el.style.top = hasPreview ? '30px' : '0';
      document.body.appendChild(el);
      document.body.classList.add('has-time-override-banner');
    }
    const virtual = computeVirtualDate(state);
    el.textContent = `TIME OVERRIDE — ${fmtClock(virtual)} (this browser only)`;
  }

  function onStateChange() {
    const s = readState();
    ensureBanner(s);
    window.dispatchEvent(new CustomEvent('timeoverridechange', { detail: s }));
  }

  // Initial banner render (deferred until body is available).
  function init() {
    ensureBanner(readState());
    // Keep the banner's displayed time fresh as the virtual clock advances.
    setInterval(() => {
      const s = readState();
      if (s) ensureBanner(s);
    }, 1000);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === null) onStateChange();
  });

  // Exposed so the admin page (same origin) can nudge previews after writing.
  window.__timeOverrideNotify = onStateChange;
})();
