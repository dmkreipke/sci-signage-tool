/* Star Theater — Public Day Signage
 * - Polls /api/public-signage/today every 60s
 * - Filters merged (website + manual) events to those occurring in the Star Theater
 * - Hero shows the current program (or next-up if nothing is playing)
 * - Marquee scrolls the remaining upcoming programs
 *
 * Time-override is provided by the shared time-override.js shim (window.__nowDate).
 */

const POLL_INTERVAL_MS = 60 * 1000;
const CLOCK_TICK_MS = 1000;
const RENDER_INTERVAL_MS = 15 * 1000;

const PROGRAM_LIBRARY = {
  'Story Time Under the Stars': 'Our youngest visitors can bring their imaginations as an SCI Programs Team member reads under the starry skies.',
  'Iowa Skies Tonight': 'Locate constellations, planets and deep space objects and hear myths of the night sky in this live planetarium program.',
  'Solar Odyssey': 'Help guide a breathtaking journey through our solar system, exploring the unique features, mysteries, and wonders of its most important celestial bodies.',
  'Black Holes': 'Explore the most extreme objects in the universe — singularities where space, time and gravity collapse into one.',
  'Pink Floyd: Dark Side of the Moon': 'A full-dome immersive light show set to the iconic album. Recommended for ages 12+.',
};

const STAR_THEATER_LOCATIONS = [
  'star theater',
  'star theater planetarium',
  'star theater planitarium', // typo seen in real scraped data
  'planetarium',
];

let state = {
  events: [],
  config: {
    qrUrl: 'https://www.sciowa.org/programs-and-events/event-calendar/',
    tickerText: '',
  },
};

function toMin(t) {
  if (!t || typeof t !== 'string') return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}
function fmt12(totMin) {
  let h = Math.floor(totMin / 60) % 24;
  const m = totMin % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return { h, m, ampm, pretty: `${h}:${String(m).padStart(2, '0')}` };
}
function nowDate() {
  return typeof window.__nowDate === 'function' ? window.__nowDate() : new Date();
}
function nowMinutes() {
  const d = nowDate();
  return d.getHours() * 60 + d.getMinutes();
}
function dayName() {
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][nowDate().getDay()];
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function isStarTheater(loc) {
  const l = String(loc || '').toLowerCase();
  return STAR_THEATER_LOCATIONS.some(s => l.includes(s));
}
function cleanTitle(raw) {
  return String(raw || '').replace(/^\d{1,2}:\d{2}\s*[ap]\.?m\.?\s*[-–—]\s*/i, '').trim();
}
function lookupDesc(title) {
  const key = Object.keys(PROGRAM_LIBRARY).find(k => title.toLowerCase().includes(k.toLowerCase()));
  return key ? PROGRAM_LIBRARY[key] : '';
}

async function fetchData() {
  try {
    const res = await fetch('/api/public-signage/today', { cache: 'no-store' });
    if (!res.ok) throw new Error('not-ok');
    const data = await res.json();
    const planetarium = (data.events || [])
      .filter(e => !e.hidden)
      .filter(e => isStarTheater(e.location))
      .map(e => ({
        ...e,
        title: cleanTitle(e.title),
        description: e.description || lookupDesc(cleanTitle(e.title)),
      }))
      .sort((a, b) => toMin(a.startTime) - toMin(b.startTime));

    state.events = planetarium;
    state.config = data.config || state.config;
  } catch {
    /* keep existing state on network error */
  }
  render();
}

function renderClock() {
  const d = nowDate();
  const c = fmt12(d.getHours() * 60 + d.getMinutes());
  document.getElementById('clock-time').textContent = c.pretty;
  document.getElementById('clock-ampm').textContent = c.ampm;
  document.getElementById('clock-day').textContent = dayName();
}

function renderHero(current, upcoming) {
  const hero = document.getElementById('hero');
  const labelEl = document.getElementById('hero-label');
  const labelText = document.getElementById('hero-label-text');
  const titleEl = document.getElementById('hero-title');
  const descEl = document.getElementById('hero-desc');
  const startEl = document.getElementById('hero-start');
  const endEl = document.getElementById('hero-end');
  const durEl = document.getElementById('hero-dur');
  const cdEl = document.getElementById('hero-countdown');
  const progEl = document.getElementById('hero-progress');
  const pfill = document.getElementById('hero-pfill');
  const pleft = document.getElementById('hero-pleft');
  const pright = document.getElementById('hero-pright');

  let ev, mode;
  if (current.length) { ev = current[0]; mode = 'now'; }
  else if (upcoming.length) { ev = upcoming[0]; mode = 'next'; }
  else {
    hero.classList.add('is-concluded');
    titleEl.textContent = 'That’s a wrap for today';
    descEl.textContent = 'Thank you for visiting the Star Theater. Come back tomorrow for more cosmic adventures under our 50-foot dome.';
    startEl.innerHTML = '—';
    endEl.innerHTML = '—';
    durEl.innerHTML = '—';
    cdEl.innerHTML = '';
    labelText.textContent = 'See You Tomorrow';
    labelEl.classList.remove('next');
    progEl.hidden = true;
    return;
  }
  hero.classList.remove('is-concluded');

  const startMin = toMin(ev.startTime);
  const endMin = toMin(ev.endTime);
  const dur = Math.max(1, endMin - startMin);
  const sf = fmt12(startMin), ef = fmt12(endMin);

  titleEl.textContent = ev.title;
  descEl.textContent = ev.description || lookupDesc(ev.title) || 'Live planetarium program in the Star Theater dome.';
  startEl.innerHTML = `${sf.pretty} <small>${sf.ampm}</small>`;
  endEl.innerHTML = `${ef.pretty} <small>${ef.ampm}</small>`;
  durEl.innerHTML = `${dur} <small>min</small>`;

  if (mode === 'now') {
    labelText.textContent = 'Now Showing';
    labelEl.classList.remove('next');
    const remain = Math.max(0, endMin - nowMinutes());
    const pct = Math.max(0, Math.min(100, ((nowMinutes() - startMin) / dur) * 100));
    progEl.hidden = false;
    pfill.style.width = pct.toFixed(1) + '%';
    pleft.textContent = `In Progress · ${Math.round(pct)}%`;
    pright.textContent = remain <= 1 ? 'Wrapping up' : `${remain} min remaining`;
    cdEl.innerHTML = remain <= 1 ? '<b>Wrapping up</b>' : `Ends in <b>${remain}</b> min`;
  } else {
    labelText.textContent = 'Next Up';
    labelEl.classList.add('next');
    const mins = Math.max(0, startMin - nowMinutes());
    progEl.hidden = true;
    if (mins <= 1) cdEl.innerHTML = '<b>Starting now</b>';
    else if (mins < 60) cdEl.innerHTML = `Starts in <b>${mins}</b> min`;
    else {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      cdEl.innerHTML = `Starts in <b>${h}h ${m}m</b>`;
    }
  }
}

// Paginated schedule strip — 3 cards visible, cross-fade swap every PAGE_MS.
// Pure CSS opacity transition; no rAF, no DOM cloning, no width measurement.
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

function buildStripCard(ev) {
  const startMin = toMin(ev.startTime);
  const endMin = toMin(ev.endTime);
  const dur = Math.max(0, endMin - startMin);
  const sf = fmt12(startMin);
  const card = document.createElement('div');
  card.className = 'strip-card';
  card.innerHTML = `
    <div class="time-row">
      <div class="stime">${sf.pretty}<span class="ampm">${sf.ampm}</span></div>
      <div class="sdur">${dur} min</div>
    </div>
    <div class="stitle">${esc(ev.title)}</div>
  `;
  return card;
}

function fitStripTitle(titleEl) {
  // Strip card inner width is ~250px (1080 stage − 64*2 outer pad − 22*2 gaps,
  // /3 columns, − 26*2 inner pad). Duke Fill uppercase ≈ 0.55em per cap, so
  // chars-per-line ≈ 250 / (size * 0.6). At 3 lines max, picking by char count
  // is accurate enough and avoids layout-thrashing offsetHeight reads on Pi4.
  const len = (titleEl.textContent || '').length;
  let size;
  if (len <= 26) size = 42;
  else if (len <= 36) size = 38;
  else if (len <= 48) size = 34;
  else if (len <= 64) size = 30;
  else if (len <= 80) size = 26;
  else size = 22;
  titleEl.style.fontSize = size + 'px';
}

function paintStripPage(rowEl, dotsEl, pages, pageIdx) {
  rowEl.innerHTML = '';
  pages[pageIdx].forEach((ev) => rowEl.appendChild(buildStripCard(ev)));
  dotsEl.innerHTML = '';
  if (pages.length > 1) {
    for (let i = 0; i < pages.length; i++) {
      const dot = document.createElement('span');
      dot.className = 'dot' + (i === pageIdx ? ' active' : '');
      dotsEl.appendChild(dot);
    }
  }
  requestAnimationFrame(() => {
    rowEl.querySelectorAll('.stitle').forEach(fitStripTitle);
  });
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
    // Double-rAF lets the browser commit the is-fading style before flipping
    // it off, so the fade-in transition runs without a synchronous reflow.
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

function renderScheduleStrip(upcoming) {
  const rowEl = document.getElementById('strip-row');
  const dotsEl = document.getElementById('strip-dots');
  const countEl = document.getElementById('upcoming-count');

  if (!upcoming.length) {
    countEl.textContent = 'No more shows today';
    rowEl.classList.remove('is-fading');
    rowEl.innerHTML = '';
    dotsEl.innerHTML = '';
    stopStripCycle();
    _stripState = null;
    return;
  }

  countEl.textContent = `${upcoming.length} program${upcoming.length === 1 ? '' : 's'} remaining`;

  // If the list hasn't changed since last render, leave the cycle running undisturbed.
  if (_stripState && sameUpcomingList(_stripState.items, upcoming)) return;

  // List changed — restart from page 0 with a fresh paint and timer.
  stopStripCycle();
  rowEl.classList.remove('is-fading');
  const pages = chunkPages(upcoming, STRIP_PER_PAGE);
  _stripState = { items: upcoming.slice(), pages, pageIdx: 0 };
  paintStripPage(rowEl, dotsEl, pages, 0);
  scheduleStripAdvance();
}

function renderQR() {
  const box = document.getElementById('qr-box');
  const url = state.config.qrUrl || 'https://www.sciowa.org/';
  if (box.dataset.url === url) return;
  box.dataset.url = url;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
    const svg = box.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
  } catch {
    box.textContent = 'QR error';
  }
}

function renderTicker() {
  const inner = document.getElementById('ticker-inner');
  const messages = [
    state.config.tickerText && state.config.tickerText.replace(/\s*·\s*/g, ' · '),
    'Welcome to the Star Theater · Iowa’s premier digital planetarium',
    'Doors open 5 minutes before each show · First-come, first-served seating',
    'Looking for the full schedule? Scan the QR code to view today’s events',
    'Members visit free — join at the A-ha! Store',
  ].filter(Boolean);
  const key = messages.join('|');
  if (inner.dataset.key === key) return;
  inner.dataset.key = key;
  const blob = messages.map(m => `<span>${esc(m)}</span>`).join('');
  inner.innerHTML = blob + blob;
}

function render() {
  const now = nowMinutes();
  const events = state.events || [];
  const remaining = events.filter(e => toMin(e.endTime) > now);
  const current = remaining.filter(e => toMin(e.startTime) <= now);
  const upcoming = remaining.filter(e => toMin(e.startTime) > now);

  renderHero(current, upcoming);
  // If the hero is showing "Up Next", the first upcoming event is featured
  // there — drop it from the strip.
  const stripList = current.length ? upcoming : upcoming.slice(1);
  renderScheduleStrip(stripList);
  renderQR();
  renderTicker();
}

function fitStage() {
  const stage = document.getElementById('stage');
  if (!stage) return;
  const w = window.innerWidth, h = window.innerHeight;
  if (!w || !h) { requestAnimationFrame(fitStage); return; }
  const scale = Math.min(w / 1080, h / 1920) || 1;
  stage.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', fitStage);
window.addEventListener('load', fitStage);
requestAnimationFrame(fitStage);

renderClock();
(document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(fetchData);
setInterval(renderClock, CLOCK_TICK_MS);
setInterval(render, RENDER_INTERVAL_MS);
setInterval(fetchData, POLL_INTERVAL_MS);
window.addEventListener('timeoverridechange', () => { renderClock(); render(); });
