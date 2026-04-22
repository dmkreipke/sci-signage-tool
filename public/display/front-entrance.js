const POLL_INTERVAL = 60 * 1000;
const PX_PER_SECOND = 60;         // scroll speed — increase to go faster
const PREVIEW_MODE = new URLSearchParams(location.search).has('preview');

let groups = [];
let lastGroupsJson = '';           // detect data changes so we don't re-render needlessly
let scrollX = 0;                   // current scroll offset in px
let halfWidth = 0;                 // width of one set of cards (loop boundary)
let rafId = null;
let lastTime = null;

// --- Clock ---
function updateClock() {
  const now = new Date();
  let h = now.getHours();
  const m = now.getMinutes();
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  document.getElementById('clock').textContent =
    `${h}:${String(m).padStart(2, '0')} ${period}`;
}
setInterval(updateClock, 1000);
updateClock();

// --- Preview banner ---
if (PREVIEW_MODE) {
  document.getElementById('preview-banner').hidden = false;
  document.getElementById('preview-banner').textContent = 'PREVIEW MODE — All groups shown';
}

// --- RAF scroll loop ---
function scrollTick(ts) {
  if (halfWidth <= 0) { rafId = requestAnimationFrame(scrollTick); return; }
  if (lastTime !== null) {
    const delta = (ts - lastTime) / 1000;   // seconds since last frame
    scrollX += PX_PER_SECOND * delta;
    if (scrollX >= halfWidth) scrollX -= halfWidth;   // seamless reset
    document.getElementById('card-track').style.transform = `translateX(-${scrollX}px)`;
  }
  lastTime = ts;
  rafId = requestAnimationFrame(scrollTick);
}

function startScroll() {
  if (rafId) cancelAnimationFrame(rafId);
  lastTime = null;
  rafId = requestAnimationFrame(scrollTick);
}

function stopScroll() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}

// --- Fetch ---
async function fetchSchedule() {
  try {
    const res = await fetch('/api/schedule/front-entrance');
    if (!res.ok) return;
    const data = await res.json();
    const newJson = JSON.stringify(data.rows || []);
    if (newJson === lastGroupsJson) return;   // data unchanged — don't re-render
    lastGroupsJson = newJson;
    groups = data.rows || [];
    render();
  } catch (e) { /* keep current display on error */ }
}

// --- Render helpers ---
function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function emptyCell() {
  return '<span class="empty-cell">&mdash;</span>';
}

function renderProgramItem(p) {
  return `
    <div class="program-item">
      <span class="program-time">${esc(p.time || '—')}</span>
      <span class="program-name">${esc(p.name)}</span>
      ${p.location ? `<span class="program-loc">${esc(p.location)}</span>` : ''}
    </div>
  `;
}

function renderLunchItem(l) {
  return `
    <div class="lunch-item">
      <span class="lunch-time">${esc(l.time || '—')}</span>
      ${l.location ? `<span class="lunch-loc">${esc(l.location)}</span>` : ''}
    </div>
  `;
}

function renderCard(g) {
  const arriveTag = g.arriveTime
    ? `<span class="card-arrive">${esc(g.arriveTime)} Arrival</span>`
    : '';
  const lunches = g.lunches && g.lunches.length
    ? `<div class="card-lunches">${g.lunches.map(renderLunchItem).join('')}</div>`
    : emptyCell();
  const programs = g.programs && g.programs.length
    ? `<div class="card-programs">${g.programs.map(renderProgramItem).join('')}</div>`
    : emptyCell();

  return `
    <div class="card">
      <div class="card-cell card-group-name">
        <span class="card-group-label">${esc(g.groupName || 'Group')}</span>
        ${arriveTag}
      </div>
      <div class="card-cell">${lunches}</div>
      <div class="card-cell">${programs}</div>
    </div>
  `;
}

// --- Render ---
function render() {
  const track = document.getElementById('card-track');
  const empty = document.getElementById('empty-state');

  stopScroll();

  if (!groups.length) {
    track.innerHTML = '';
    track.style.transform = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const maxPrograms = Math.max(1, ...groups.map(g => g.programs ? g.programs.length : 0));
  const maxLunches  = Math.max(1, ...groups.map(g => g.lunches  ? g.lunches.length  : 0));
  const programsRowMin = Math.max(160, 48 + maxPrograms * 88);
  const lunchRowMin    = Math.max(70, 24 + Math.min(maxLunches, 3) * 52);
  document.documentElement.style.setProperty('--row-programs', `minmax(${programsRowMin}px, 2fr)`);
  document.documentElement.style.setProperty('--row-lunch',    `minmax(${lunchRowMin}px, 1fr)`);

  const cardsHtml = groups.map(renderCard).join('');
  track.innerHTML = cardsHtml + cardsHtml;   // duplicate for seamless loop
  track.style.transform = `translateX(-${scrollX}px)`;

  requestAnimationFrame(() => {
    const lane = document.getElementById('card-lane');
    halfWidth = track.scrollWidth / 2;
    if (halfWidth > lane.clientWidth) {
      // Clamp scrollX in case the new set is shorter than the old one
      if (scrollX >= halfWidth) scrollX = scrollX % halfWidth;
      startScroll();
    } else {
      // All cards fit without scrolling — show them once, no duplicates
      track.innerHTML = cardsHtml;
      halfWidth = 0;
      scrollX = 0;
    }
  });
}

// --- Remove CSS animation class — we drive scroll via JS now ---
document.getElementById('card-track').classList.remove('scrolling');

// --- Init ---
fetchSchedule();
setInterval(fetchSchedule, POLL_INTERVAL);
