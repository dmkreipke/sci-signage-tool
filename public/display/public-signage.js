const POLL_INTERVAL_MS = 60 * 1000;
const CLOCK_TICK_MS = 1000;
const NEXT_UP_LOOKAHEAD_MIN = 45;
const STRIP_MAX_CARDS = 6;

let currentData = {
  events: [],
  config: { qrUrl: '', qrLabel: '', tickerText: '' },
};
let lastQrUrl = null;
let lastTickerText = null;

const SPECIAL_QR_MS = 12000;
const SPECIAL_PANEL_MS = SPECIAL_QR_MS;
let specialEvents = [];
let nextSpecialIndex = 0;
let lastShowedQr = true;
let specialTimer = null;
let lastSpecialFingerprint = '';

function toMin(t) {
  if (!t || typeof t !== 'string') return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function fmt12(totMin) {
  let h = Math.floor(totMin / 60) % 24;
  const m = totMin % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return { h, m, ampm, pretty: `${h}:${String(m).padStart(2, '0')}` };
}
function nowMinutes() {
  const d = window.__nowDate();
  return d.getHours() * 60 + d.getMinutes();
}
function dayName() {
  return ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][window.__nowDate().getDay()];
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function catClass(c) {
  const x = String(c || '').toLowerCase();
  if (x.includes('planet')) return 'cat-planetarium';
  if (x.includes('special')) return 'cat-special';
  return 'cat-live';
}

function renderQR(url) {
  const box = document.getElementById('qr-box');
  if (!url || url === lastQrUrl) return;
  lastQrUrl = url;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
    const svg = box.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
    }
  } catch {
    box.textContent = 'QR error';
  }
}

function renderTicker(text) {
  if (text === lastTickerText) return;
  lastTickerText = text;
  document.getElementById('ticker-text').textContent = text || '';
}

function renderClock() {
  const now = nowMinutes();
  const c = fmt12(now);
  document.getElementById('clock-time').textContent = c.pretty;
  document.getElementById('clock-ampm').textContent = c.ampm;
}

function makeNowCard(ev) {
  const startMin = toMin(ev.startTime);
  const endMin = toMin(ev.endTime);
  const now = nowMinutes();
  const total = Math.max(1, endMin - startMin);
  const pct = Math.max(0, Math.min(100, ((now - startMin) / total) * 100));
  const remain = Math.max(0, endMin - now);
  const sf = fmt12(startMin);
  const ef = fmt12(endMin);
  const el = document.createElement('div');
  el.className = 'now-card ' + catClass(ev.category);
  el.innerHTML = `
    <div class="now-kicker"><span class="bar"></span> Now Showing <span class="accent-dots"><i></i><i></i></span></div>
    <div class="now-title">${esc(ev.title)}</div>
    <div class="now-meta">
      <div class="item"><span class="label">Location</span><span class="value">${esc(ev.location)}</span></div>
      <div class="item"><span class="label">Started</span><span class="value">${sf.pretty} ${sf.ampm}</span></div>
      <div class="item"><span class="label">Ends</span><span class="value">${ef.pretty} ${ef.ampm}</span></div>
    </div>
    ${ev.description ? `<p class="now-desc">${esc(ev.description)}</p>` : ''}
    <div class="prog-wrap">
      <div class="prog-top">
        <span class="l">In progress · ${Math.round(pct)}%</span>
        <span class="r">${remain <= 1 ? 'Wrapping up' : `${remain} min remaining`}</span>
      </div>
      <div class="prog-track"><div class="prog-fill" style="width:${pct.toFixed(1)}%"></div></div>
    </div>
  `;
  return el;
}

function makeNextUpCard(ev) {
  const startMin = toMin(ev.startTime);
  const endMin = toMin(ev.endTime);
  const minsUntil = Math.max(0, startMin - nowMinutes());
  const sf = fmt12(startMin);
  const ef = fmt12(endMin);
  const countdown = minsUntil < 1
    ? 'Starting soon'
    : `starts in ${minsUntil} minute${minsUntil === 1 ? '' : 's'}`;
  const el = document.createElement('div');
  el.className = 'now-card next-up-card ' + catClass(ev.category);
  el.innerHTML = `
    <div class="now-kicker"><span class="bar"></span> Next Up <span class="accent-dots"><i></i><i></i></span></div>
    <div class="now-title">${esc(ev.title)}</div>
    <div class="now-meta">
      <div class="item"><span class="label">Location</span><span class="value">${esc(ev.location)}</span></div>
      <div class="item"><span class="label">Starts</span><span class="value">${sf.pretty} ${sf.ampm}</span></div>
      <div class="item"><span class="label">Ends</span><span class="value">${ef.pretty} ${ef.ampm}</span></div>
    </div>
    ${ev.description ? `<p class="now-desc">${esc(ev.description)}</p>` : ''}
    <div class="prog-wrap">
      <div class="prog-top">
        <span class="l">Up next</span>
        <span class="r">${countdown}</span>
      </div>
      <div class="prog-track"><div class="prog-fill" style="width:0%"></div></div>
    </div>
  `;
  return el;
}

function fitNowTitle(titleEl, isCompact) {
  const sizes = isCompact ? [56, 48, 42, 38, 34] : [96, 84, 72, 64, 56, 48];
  for (const size of sizes) {
    titleEl.style.fontSize = size + 'px';
    if (titleEl.offsetHeight <= size * 0.92 * 2 + 2) return;
  }
  titleEl.style.display = '-webkit-box';
  titleEl.style.webkitLineClamp = '2';
  titleEl.style.webkitBoxOrient = 'vertical';
  titleEl.style.overflow = 'hidden';
}

function renderNowArea(current, upcoming) {
  const area = document.getElementById('now-area');
  const doneArea = document.getElementById('done-area');
  const cardsEl = document.getElementById('now-cards');
  const overflowEl = document.getElementById('overflow-strip');

  area.classList.remove('now-1up', 'now-2up', 'now-upcoming-only');

  if (current.length === 0 && upcoming.length === 0) {
    area.style.display = 'none';
    doneArea.style.display = 'grid';
    return;
  }

  if (current.length === 0) {
    area.style.display = 'flex';
    doneArea.style.display = 'none';
    area.classList.add('now-1up', 'now-upcoming-only');
    cardsEl.innerHTML = '';
    cardsEl.appendChild(makeNextUpCard(upcoming[0]));
    overflowEl.hidden = true;
    overflowEl.innerHTML = '';
    requestAnimationFrame(() => {
      cardsEl.querySelectorAll('.now-title').forEach(t => fitNowTitle(t, false));
    });
    return;
  }

  area.style.display = 'flex';
  doneArea.style.display = 'none';

  const sorted = [...current].sort((a, b) => toMin(b.endTime) - toMin(a.endTime));
  const primary = sorted.slice(0, 2);
  const overflow = sorted.slice(2);

  const nextEvent = upcoming[0];
  const showNextUp =
    primary.length === 1 &&
    !!nextEvent &&
    (toMin(nextEvent.startTime) - nowMinutes()) <= NEXT_UP_LOOKAHEAD_MIN;

  const totalCards = primary.length + (showNextUp ? 1 : 0);
  area.classList.toggle('now-1up', totalCards === 1);
  area.classList.toggle('now-2up', totalCards === 2);

  cardsEl.innerHTML = '';
  primary.forEach(ev => cardsEl.appendChild(makeNowCard(ev)));
  if (showNextUp) cardsEl.appendChild(makeNextUpCard(nextEvent));

  if (overflow.length > 0) {
    overflowEl.hidden = false;
    overflowEl.innerHTML =
      `<span class="label">Also running</span>` +
      overflow.map(ev => {
        const ef = fmt12(toMin(ev.endTime));
        return `<span class="chip"><strong>${esc(ev.title)}</strong>${esc(ev.location)}<em>ends ${ef.pretty} ${ef.ampm}</em></span>`;
      }).join('');
  } else {
    overflowEl.hidden = true;
    overflowEl.innerHTML = '';
  }

  requestAnimationFrame(() => {
    const isCompact = area.classList.contains('now-2up');
    cardsEl.querySelectorAll('.now-title').forEach(t => fitNowTitle(t, isCompact));
  });
}

function makeStripCard(ev) {
  const startMin = toMin(ev.startTime);
  const endMin = toMin(ev.endTime);
  const dur = Math.max(0, endMin - startMin);
  const sf = fmt12(startMin);
  const el = document.createElement('div');
  el.className = 'event-card ' + catClass(ev.category) + (ev.source === 'manual' ? ' manual' : '');
  el.innerHTML = `
    <div class="time-block">
      <div class="t">${sf.pretty}</div>
      <div class="ampm">${sf.ampm}</div>
      <div class="dur">${dur} MIN</div>
    </div>
    <div class="body">
      <div class="title">${esc(ev.title)}</div>
      <span class="cat">${esc(ev.category || 'Program')}</span>
      <div class="loc">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        ${esc(ev.location)}
      </div>
    </div>
  `;
  return el;
}

const STRIP_PAGE_MS = 7000;
const STRIP_FADE_MS = 600; // must match .strip-row CSS transition duration
const STRIP_PER_PAGE = 3;

let _stripState = null;
let _stripTimer = null;
let _stripFadeTimer = null;

function stopStripCycle() {
  if (_stripTimer) clearTimeout(_stripTimer);
  if (_stripFadeTimer) clearTimeout(_stripFadeTimer);
  _stripTimer = null;
  _stripFadeTimer = null;
}

function chunkPages(items, perPage) {
  const N = items.length;
  if (N <= perPage) return [items.slice()];
  const pages = Math.ceil(N / perPage);
  const base = Math.floor(N / pages);
  const rem = N % pages;
  const out = [];
  let i = 0;
  for (let p = 0; p < pages; p++) {
    const size = base + (p < rem ? 1 : 0);
    out.push(items.slice(i, i + size));
    i += size;
  }
  return out;
}

function paintStripPage(rowEl, dotsEl, pages, pageIdx) {
  rowEl.innerHTML = '';
  pages[pageIdx].forEach((ev) => rowEl.appendChild(makeStripCard(ev)));
  dotsEl.innerHTML = '';
  if (pages.length > 1) {
    for (let i = 0; i < pages.length; i++) {
      const dot = document.createElement('span');
      dot.className = 'dot' + (i === pageIdx ? ' active' : '');
      dotsEl.appendChild(dot);
    }
  }
}

function scheduleStripAdvance() {
  if (_stripTimer) clearTimeout(_stripTimer);
  if (!_stripState || _stripState.pages.length <= 1) return;
  _stripTimer = setTimeout(advanceStripPage, STRIP_PAGE_MS);
}

function advanceStripPage() {
  if (!_stripState || _stripState.pages.length <= 1) return;
  const rowEl = document.getElementById('strip-row');
  const dotsEl = document.getElementById('strip-dots');
  const next = (_stripState.pageIdx + 1) % _stripState.pages.length;
  rowEl.classList.add('is-fading');
  if (_stripFadeTimer) clearTimeout(_stripFadeTimer);
  _stripFadeTimer = setTimeout(() => {
    if (!_stripState) return;
    _stripState.pageIdx = next;
    paintStripPage(rowEl, dotsEl, _stripState.pages, next);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rowEl.classList.remove('is-fading');
        scheduleStripAdvance();
      });
    });
  }, STRIP_FADE_MS);
}

function sameUpcomingList(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].startTime !== b[i].startTime ||
        a[i].endTime !== b[i].endTime ||
        a[i].title !== b[i].title) return false;
  }
  return true;
}

function renderScheduleStrip(items, anyNowPlaying, totalUpcoming) {
  const rowEl = document.getElementById('strip-row');
  const dotsEl = document.getElementById('strip-dots');
  const countEl = document.getElementById('upnext-count');
  const headLeft = document.querySelector('.upnext-head .l');

  if (!items.length) {
    countEl.textContent = anyNowPlaying ? 'Last program of the day' : 'Today’s programs have concluded';
    if (headLeft) headLeft.style.display = 'none';
    rowEl.classList.remove('is-fading');
    rowEl.innerHTML = '';
    dotsEl.innerHTML = '';
    stopStripCycle();
    _stripState = null;
    return;
  }

  if (headLeft) headLeft.style.display = '';
  if (totalUpcoming > items.length) {
    countEl.textContent = `Next ${items.length} of ${totalUpcoming} programs`;
  } else {
    countEl.textContent = `${totalUpcoming} program${totalUpcoming === 1 ? '' : 's'} remaining today`;
  }

  if (_stripState && sameUpcomingList(_stripState.items, items)) return;

  stopStripCycle();
  rowEl.classList.remove('is-fading');
  const pages = chunkPages(items, STRIP_PER_PAGE);
  _stripState = { items: items.slice(), pages, pageIdx: 0 };
  paintStripPage(rowEl, dotsEl, pages, 0);
  scheduleStripAdvance();
}

function renderClosingCard(closingTime) {
  const card = document.getElementById('closing-card');
  if (!card) return;
  if (!closingTime || !/^\d{2}:\d{2}$/.test(closingTime)) { card.hidden = true; return; }
  const minutesUntilClose = toMin(closingTime) - nowMinutes();
  if (minutesUntilClose <= 0) { card.hidden = true; return; }
  const t = fmt12(toMin(closingTime));
  document.getElementById('closing-time-text').textContent = `${t.pretty} ${t.ampm}`;
  card.hidden = false;
}

function render() {
  const now = nowMinutes();
  const events = currentData.events || [];
  const remaining = events.filter(e => toMin(e.endTime) > now);
  const current = remaining.filter(e => toMin(e.startTime) <= now);
  const upcoming = remaining.filter(e => toMin(e.startTime) > now);

  // Match the hero's own "borrow next-up" condition so the strip doesn't
  // show the same event the hero is already featuring.
  const heroBorrowsNext =
    current.length === 1 &&
    !!upcoming[0] &&
    (toMin(upcoming[0].startTime) - now) <= NEXT_UP_LOOKAHEAD_MIN;
  const dedupedUpcoming = heroBorrowsNext ? upcoming.slice(1) : upcoming;
  const stripPool = dedupedUpcoming.slice(0, STRIP_MAX_CARDS);

  renderClock();
  renderNowArea(current, upcoming);
  renderScheduleStrip(stripPool, current.length > 0, dedupedUpcoming.length);
  renderQR(currentData.config.qrUrl);
  renderTicker(currentData.config.tickerText);
  renderClosingCard(currentData.config.closingTime);
}

async function fetchData() {
  try {
    const res = await fetch('/api/public-signage/today', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    currentData = {
      events: (data.events || []).filter(e => !e.hidden),
      config: data.config || currentData.config,
    };
    updateSpecialEvents(data.specialEvents || []);
    render();
  } catch {
    /* keep existing state on network error */
  }
}

function specialFingerprint(list) {
  return list.map(e => `${e.id}:${e.imageFilename || ''}:${e.title || ''}:${e.subtitle || ''}:${e.dateLabel || ''}:${e.location || ''}:${e.url || ''}:${e.fit || 'cover'}:${e.transparent ? 1 : 0}`).join('|');
}

function updateSpecialEvents(list) {
  const visible = (list || []).filter(e => !e.hidden);
  const fp = specialFingerprint(visible);
  if (fp === lastSpecialFingerprint) return;
  lastSpecialFingerprint = fp;
  specialEvents = visible;
  restartSpecialRotation();
}

function restartSpecialRotation() {
  if (specialTimer) { clearTimeout(specialTimer); specialTimer = null; }
  nextSpecialIndex = 0;
  lastShowedQr = true;
  showQrPanel();
  if (specialEvents.length === 0) return;
  specialTimer = setTimeout(advanceSpecial, SPECIAL_QR_MS);
}

function advanceSpecial() {
  if (specialEvents.length === 0) {
    showQrPanel();
    lastShowedQr = true;
    return;
  }
  if (lastShowedQr) {
    if (nextSpecialIndex >= specialEvents.length) nextSpecialIndex = 0;
    showSpecialPanel(specialEvents[nextSpecialIndex]);
    nextSpecialIndex += 1;
    lastShowedQr = false;
    specialTimer = setTimeout(advanceSpecial, SPECIAL_PANEL_MS);
  } else {
    showQrPanel();
    lastShowedQr = true;
    specialTimer = setTimeout(advanceSpecial, SPECIAL_QR_MS);
  }
}

function showQrPanel() {
  const def = document.getElementById('rail-panel-default');
  const sp = document.getElementById('rail-panel-special');
  if (def) def.classList.add('is-active');
  if (sp) sp.classList.remove('is-active');
}

function renderSpecialQr(url) {
  const box = document.getElementById('special-qr');
  const label = document.getElementById('special-qr-label');
  if (!box || !label) return;
  if (!url) {
    box.innerHTML = '';
    label.textContent = '';
    return;
  }
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    const svg = box.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
    }
    label.textContent = 'Scan for details';
  } catch {
    box.innerHTML = '';
    label.textContent = '';
  }
}

function showSpecialPanel(ev) {
  const def = document.getElementById('rail-panel-default');
  const sp = document.getElementById('rail-panel-special');
  if (!sp) return;
  const img = document.getElementById('special-image');
  const title = document.getElementById('special-title');
  const subtitle = document.getElementById('special-subtitle');
  const date = document.getElementById('special-date');
  const loc = document.getElementById('special-location');
  if (ev.imageFilename) {
    img.style.backgroundImage = `url('/special-event-images/${encodeURIComponent(ev.imageFilename)}')`;
    img.style.backgroundSize = ev.fit === 'contain' ? 'contain' : 'cover';
    sp.classList.remove('no-image');
  } else {
    img.style.backgroundImage = '';
    sp.classList.add('no-image');
  }
  if (ev.transparent) img.classList.add('transparent');
  else img.classList.remove('transparent');
  title.textContent = ev.title || '';
  subtitle.textContent = ev.subtitle || '';
  date.textContent = ev.dateLabel || '';
  loc.textContent = ev.location || '';
  renderSpecialQr(ev.url || '');
  if (def) def.classList.remove('is-active');
  sp.classList.add('is-active');
}

function fitStage() {
  const stage = document.getElementById('stage');
  const w = window.innerWidth, h = window.innerHeight;
  const scale = Math.min(w / 1920, h / 1080);
  stage.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', fitStage);

fitStage();
renderClock();
(document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(fetchData);
setInterval(fetchData, POLL_INTERVAL_MS);
setInterval(render, 15000);
setInterval(renderClock, CLOCK_TICK_MS);
window.addEventListener('timeoverridechange', () => { renderClock(); render(); });
