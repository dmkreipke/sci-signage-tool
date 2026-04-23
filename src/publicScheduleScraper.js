const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const CACHE_FILE = path.join(__dirname, '..', 'data', 'public-signage-cache.json');
const CALENDAR_BASE = 'https://www.sciowa.org/programs-and-events/event-calendar/';
const USER_AGENT = 'SCI-Signage-Tool/1.0 (+internal)';
const FETCH_TIMEOUT_MS = 15000;

let cache = loadCacheFromDisk();

function loadCacheFromDisk() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return {
      fetchedAt: null,
      forDate: null,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      etag: null,
      lastModified: null,
      events: [],
    };
  }
}

function persistCache() {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.error('[scraper] failed to write cache:', err.message);
  }
}

function todayLocal() {
  const d = new Date();
  return {
    y: d.getFullYear(),
    m: d.getMonth() + 1,
    d: d.getDate(),
    iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  };
}

function calendarUrlFor(t) {
  return `${CALENDAR_BASE}?date=${t.y}-${t.m}-${t.d}`;
}

function parseTimeTo24h(raw) {
  const m = String(raw || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = (m[3] || '').toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function parseTimeRange(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(/[–-]/).map(s => s.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const start = parseTimeTo24h(parts[0]);
  const end = parseTimeTo24h(parts[1]);
  if (!start || !end) return null;
  return { startTime: start, endTime: end };
}

function parseEventsHTML(html) {
  const $ = cheerio.load(html);
  const events = [];
  $('article.event').each((_, el) => {
    const $el = $(el);
    const timeText = $el.find('li.time').first().text();
    const title = $el.find('li.title h3').first().text().trim();
    const location = $el.find('li.location').first().text().trim();
    const category = $el.find('li.categories a').first().text().trim();
    const description = $el.find('.grid .mce-content p').first().text().trim();

    if (!location || !title) return;
    const range = parseTimeRange(timeText);
    if (!range) return;

    events.push({
      source: 'website',
      startTime: range.startTime,
      endTime: range.endTime,
      title,
      location,
      category: category || 'Program',
      description,
    });
  });
  return events;
}

async function refresh() {
  const t = todayLocal();
  const url = calendarUrlFor(t);
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml',
  };
  if (cache.etag && cache.forDate === t.iso) headers['If-None-Match'] = cache.etag;
  if (cache.lastModified && cache.forDate === t.iso) headers['If-Modified-Since'] = cache.lastModified;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);

    const now = new Date().toISOString();

    if (res.status === 304 && cache.forDate === t.iso) {
      cache.fetchedAt = now;
      cache.lastSuccessAt = now;
      persistCache();
      return { ok: true, changed: false, count: cache.events.length };
    }

    if (!res.ok) {
      cache.lastErrorAt = now;
      cache.lastErrorMessage = `HTTP ${res.status}`;
      persistCache();
      return { ok: false, error: cache.lastErrorMessage };
    }

    const html = await res.text();
    const events = parseEventsHTML(html);

    cache = {
      fetchedAt: now,
      forDate: t.iso,
      lastSuccessAt: now,
      lastErrorAt: cache.lastErrorAt,
      lastErrorMessage: cache.lastErrorMessage,
      etag: res.headers.get('etag') || null,
      lastModified: res.headers.get('last-modified') || null,
      events,
    };
    persistCache();
    return { ok: true, changed: true, count: events.length };
  } catch (err) {
    clearTimeout(timer);
    const now = new Date().toISOString();
    cache.lastErrorAt = now;
    cache.lastErrorMessage = err.name === 'AbortError' ? 'Fetch timeout' : err.message;
    persistCache();
    return { ok: false, error: cache.lastErrorMessage };
  }
}

function getCached() {
  const t = todayLocal();
  const stale = cache.forDate && cache.forDate !== t.iso;
  return {
    events: stale ? [] : cache.events,
    forDate: cache.forDate,
    today: t.iso,
    stale,
    fetchedAt: cache.fetchedAt,
    lastSuccessAt: cache.lastSuccessAt,
    lastErrorAt: cache.lastErrorAt,
    lastErrorMessage: cache.lastErrorMessage,
  };
}

module.exports = { refresh, getCached };
