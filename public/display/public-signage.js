const POLL_INTERVAL_MS = 60 * 1000;
const CLOCK_TICK_MS = 1000;
const NEXT_UP_LOOKAHEAD_MIN = 45;

let currentData = {
  events: [],
  config: { qrUrl: '', qrLabel: '', tickerText: '' },
};
let lastQrUrl = null;
let lastTickerText = null;

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

function makeMarqueeCard(ev, isNextUp) {
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

function renderMarquee(upcoming, anyNowPlaying) {
  const track = document.getElementById('track');
  const countEl = document.getElementById('upnext-count');
  const headLeft = document.querySelector('.upnext-head .l');
  track.innerHTML = '';

  if (upcoming.length === 0) {
    countEl.textContent = anyNowPlaying ? 'Last program of the day' : 'Today’s programs have concluded';
    track.style.animation = 'none';
    if (headLeft) headLeft.style.display = 'none';
    return;
  }

  if (headLeft) headLeft.style.display = '';
  countEl.textContent = `${upcoming.length} program${upcoming.length === 1 ? '' : 's'} remaining today`;

  if (upcoming.length <= 3) {
    upcoming.forEach(ev => track.appendChild(makeMarqueeCard(ev)));
    track.style.animation = 'none';
    track.style.removeProperty('--half-width');
    return;
  }

  const copies = Math.max(3, Math.ceil(10 / upcoming.length));
  for (let k = 0; k < copies; k++) {
    upcoming.forEach((ev, i) => {
      const isNextUp = !anyNowPlaying && i === 0 && k === 0;
      track.appendChild(makeMarqueeCard(ev, isNextUp));
    });
  }

  requestAnimationFrame(() => {
    const totalWidth = track.scrollWidth;
    const onePass = totalWidth / copies;
    track.style.setProperty('--half-width', onePass + 'px');
    const baseSpeed = 40;
    const scaled = Math.max(20, baseSpeed * (onePass / 1400));
    track.style.setProperty('--speed', scaled + 's');
    track.style.animation = 'none';
    void track.offsetWidth;
    track.style.animation = '';
  });
}

function renderClosingCard(closingTime) {
  const card = document.getElementById('closing-card');
  if (!card) return;
  if (!closingTime || !/^\d{2}:\d{2}$/.test(closingTime)) { card.hidden = true; return; }
  const minutesUntilClose = toMin(closingTime) - nowMinutes();
  if (minutesUntilClose <= 0 || minutesUntilClose > 180) { card.hidden = true; return; }
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

  renderClock();
  renderNowArea(current, upcoming);
  renderMarquee(upcoming, current.length > 0);
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
    render();
  } catch {
    /* keep existing state on network error */
  }
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
