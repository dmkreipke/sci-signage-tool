const POLL_INTERVAL = 60 * 1000;
const EXPIRY_MINUTES = 20;
const SCROLL_SPEED = 0.4; // px per frame
const SCROLL_PAUSE_MS = 3000;
const PREVIEW_MODE = new URLSearchParams(location.search).has('preview');

let allRows = [];
let lastPublishedAt = null;
let scrollPaused = false;
let scrollPauseTimer = null;
let animFrameId = null;
let scrollOffset = 0;

// --- Clock ---
function updateClock() {
  const now = new Date();
  let h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  document.getElementById('clock').textContent =
    `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} ${period}`;
}
setInterval(updateClock, 1000);
updateClock();

// --- Time utilities ---
function isoToMinutes(iso) {
  const [h, m] = iso.split(':').map(Number);
  return h * 60 + m;
}

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function classifyRow(row) {
  if (!row.startTimeISO) return 'upcoming';
  const start = isoToMinutes(row.startTimeISO);
  const elapsed = nowMinutes() - start;
  if (elapsed < 0) return 'upcoming';
  if (elapsed < EXPIRY_MINUTES) return 'in-progress';
  return 'expired';
}

function progressPct(row) {
  const elapsed = nowMinutes() - isoToMinutes(row.startTimeISO);
  return Math.min(100, Math.max(0, Math.round((elapsed / EXPIRY_MINUTES) * 100)));
}

// --- Fetch ---
async function fetchSchedule() {
  try {
    const res = await fetch('/api/schedule/star-theater');
    if (!res.ok) return;
    const data = await res.json();
    allRows = data.rows || [];
    lastPublishedAt = data.publishedAt || null;
    render();
  } catch { /* keep existing display on network error */ }
}

// --- Preview banner ---
if (PREVIEW_MODE) {
  const banner = document.createElement('div');
  banner.className = 'preview-banner';
  banner.textContent = 'PREVIEW MODE — Times not enforced';
  document.querySelector('.screen').prepend(banner);
}

// --- Render ---
function render() {
  const now = nowMinutes();
  const firstShow = allRows.length > 0 ? isoToMinutes(allRows[0].startTimeISO) : null;
  const noShowsYet = !PREVIEW_MODE && firstShow !== null && now < firstShow - 240;

  const list = document.getElementById('schedule-list');

  const topCardsEl = document.getElementById('top-cards');

  if (allRows.length === 0 || noShowsYet) {
    topCardsEl.innerHTML = '';
    document.getElementById('coming-up-label').innerHTML = '';
    list.innerHTML = `<div class="empty-msg">${allRows.length === 0 ? 'No schedule published yet.' : 'No shows yet today.'}</div>`;
    resetScroll();
    return;
  }

  const playing = PREVIEW_MODE ? [] : allRows.filter(r => classifyRow(r) === 'in-progress');
  const upcoming = PREVIEW_MODE ? allRows : allRows.filter(r => classifyRow(r) === 'upcoming');

  if (!PREVIEW_MODE && playing.length === 0 && upcoming.length === 0) {
    topCardsEl.innerHTML = '';
    document.getElementById('coming-up-label').innerHTML = '';
    list.innerHTML = `<div class="empty-msg">All shows have concluded.</div>`;
    resetScroll();
    return;
  }

  const topCards = [];
  const comingUpParts = [];
  const nowPlaying = playing.length > 0;

  for (const row of playing) {
    const pct = progressPct(row);
    topCards.push(`
      <div class="card">
        <div class="card-label">Now Playing</div>
        <div class="card-program">${esc(row.programName)}</div>
        <div class="card-row">
          <span class="card-group">${esc(row.mergedGroupLabel)}</span>
          <span class="card-time">${esc(row.startTime)}</span>
        </div>
        <div class="progress-row">
          <span class="progress-label">Show in progress</span>
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
          <span class="progress-pct">${pct}%</span>
        </div>
      </div>
    `);
  }

  if (!nowPlaying && upcoming.length > 0) {
    const nextUp = upcoming[0];
    topCards.push(`
      <div class="card">
        <div class="card-label">Next Up</div>
        <div class="card-program">${esc(nextUp.programName)}</div>
        <div class="card-row">
          <span class="card-group">${esc(nextUp.mergedGroupLabel)}</span>
          <span class="card-time">${esc(nextUp.startTime)}</span>
        </div>
        <div class="card-footer">Please wait for the theater doors to open</div>
      </div>
    `);
  }

  document.getElementById('top-cards').innerHTML = topCards.join('');

  // Coming Up: all upcoming when now playing, or rest when next up is shown
  const comingUp = nowPlaying ? upcoming : upcoming.slice(1);
  document.getElementById('coming-up-label').innerHTML =
    comingUp.length > 0 ? `<div class="section-label">Coming Up</div>` : '';
  if (comingUp.length > 0) {
    for (const row of comingUp) {
      comingUpParts.push(`
        <div class="row-item">
          <div class="row-left">
            <div class="row-program">${esc(row.programName)}</div>
            <div class="row-group">${esc(row.mergedGroupLabel)}</div>
          </div>
          <div class="row-time">${esc(row.startTime)}</div>
        </div>
      `);
    }
  }

  list.innerHTML = comingUpParts.join('');
  initScroll();
}

// --- Scroll ---
function resetScroll() {
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  clearTimeout(scrollPauseTimer);
  scrollPaused = false;
  scrollOffset = 0;
  const list = document.getElementById('schedule-list');
  if (list) list.style.transform = 'translateY(0)';
}

function initScroll() {
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  clearTimeout(scrollPauseTimer);
  scrollOffset = 0;
  scrollPaused = true;
  scrollPauseTimer = setTimeout(() => {
    scrollPaused = false;
    animFrameId = requestAnimationFrame(scrollTick);
  }, SCROLL_PAUSE_MS);
}

function scrollTick() {
  const container = document.getElementById('schedule-container');
  const list = document.getElementById('schedule-list');
  if (!container || !list) return;

  if (scrollPaused) {
    animFrameId = requestAnimationFrame(scrollTick);
    return;
  }

  const maxScroll = list.scrollHeight - container.clientHeight;
  if (maxScroll <= 0) return;

  scrollOffset += SCROLL_SPEED;

  if (scrollOffset >= maxScroll) {
    scrollOffset = 0;
    scrollPaused = true;
    clearTimeout(scrollPauseTimer);
    scrollPauseTimer = setTimeout(() => { scrollPaused = false; }, SCROLL_PAUSE_MS);
  }

  list.style.transform = `translateY(-${scrollOffset}px)`;
  animFrameId = requestAnimationFrame(scrollTick);
}

// --- Helpers ---
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// --- Init ---
fetchSchedule();
setInterval(() => {
  fetchSchedule();
  render(); // re-render in place to update progress bar and expiry without waiting for next fetch
}, POLL_INTERVAL);
