const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '..', 'data', 'public-signage.json');
const SPECIAL_IMAGES_DIR = path.join(__dirname, '..', 'data', 'special-event-images');

const ALLOWED_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);

const DEFAULTS = {
  publishedAt: null,
  qrUrl: 'https://www.sciowa.org/programs-and-events/event-calendar/',
  qrLabel: 'sciowa.org/event-calendar',
  tickerText:
    "Welcome to the Science Center of Iowa — Programs run throughout the day, no reservation required for general admission · " +
    "Planetarium shows seat on a first-come basis, arrive 5 minutes early · " +
    "Ask any staff member in a green shirt for today's program locations · " +
    "Members visit free — join at the A-ha! Store · " +
    "401 W Martin Luther King Jr. Parkway · Des Moines, IA 50309 · 515.274.6868",
  titles: [],
  locations: ['Star Theater Planetarium', 'SCI Live Theater', 'What on Earth?', 'Innovation Lab'],
  categories: ['Planetarium', 'Live Programs', 'Special Events'],
  closingTime: '17:00',
  manualEvents: [],
  specialEvents: [],
  hiddenWebsiteEvents: {},
};

function signatureFor(ev) {
  return [ev.startTime || '', ev.endTime || '', ev.title || '', ev.location || ''].join('|');
}

function normalizeHiddenMap(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out = {};
  for (const [date, sigs] of Object.entries(input)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!Array.isArray(sigs)) continue;
    const seen = new Set();
    const clean = [];
    for (const s of sigs) {
      const v = typeof s === 'string' ? s : '';
      if (!v || seen.has(v)) continue;
      seen.add(v);
      clean.push(v);
    }
    if (clean.length) out[date] = clean;
  }
  return out;
}

function normalizeList(input) {
  if (!Array.isArray(input)) return null;
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    const v = String(raw == null ? '' : raw).trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function read() {
  try {
    const content = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(content);
    return {
      ...DEFAULTS,
      ...parsed,
      manualEvents: parsed.manualEvents || [],
      specialEvents: Array.isArray(parsed.specialEvents) ? parsed.specialEvents : [],
      titles: Array.isArray(parsed.titles) ? parsed.titles : DEFAULTS.titles,
      locations: Array.isArray(parsed.locations) ? parsed.locations : DEFAULTS.locations,
      categories: Array.isArray(parsed.categories) ? parsed.categories : DEFAULTS.categories,
      hiddenWebsiteEvents: normalizeHiddenMap(parsed.hiddenWebsiteEvents),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeAll(data) {
  const out = {
    ...data,
    publishedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(out, null, 2), 'utf8');
  return out;
}

function getConfig() {
  const data = read();
  return {
    qrUrl: data.qrUrl,
    qrLabel: data.qrLabel,
    tickerText: data.tickerText,
    titles: data.titles,
    locations: data.locations,
    categories: data.categories,
    closingTime: data.closingTime,
    publishedAt: data.publishedAt,
  };
}

function saveConfig(patch) {
  const data = read();
  if (typeof patch.qrUrl === 'string') data.qrUrl = patch.qrUrl.trim();
  if (typeof patch.qrLabel === 'string') data.qrLabel = patch.qrLabel.trim();
  if (typeof patch.tickerText === 'string') data.tickerText = patch.tickerText;
  if (typeof patch.closingTime === 'string') data.closingTime = patch.closingTime.trim();
  if ('titles' in patch) {
    const norm = normalizeList(patch.titles);
    if (norm !== null) data.titles = norm;
  }
  if ('locations' in patch) {
    const norm = normalizeList(patch.locations);
    if (norm !== null) data.locations = norm;
  }
  if ('categories' in patch) {
    const norm = normalizeList(patch.categories);
    if (norm !== null) data.categories = norm;
  }
  return writeAll(data);
}

function listManual() {
  return read().manualEvents;
}

function validateManual(input) {
  const errors = [];
  const date = String(input.date || '').trim();
  const startTime = String(input.startTime || '').trim();
  const endTime = String(input.endTime || '').trim();
  const title = String(input.title || '').trim();
  const location = String(input.location || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('date must be YYYY-MM-DD');
  if (!/^\d{2}:\d{2}$/.test(startTime)) errors.push('startTime must be HH:MM (24-hour)');
  if (!/^\d{2}:\d{2}$/.test(endTime)) errors.push('endTime must be HH:MM (24-hour)');
  if (!title) errors.push('title is required');
  if (!location) errors.push('location is required');
  return errors;
}

function normalizeManual(input, id) {
  return {
    id,
    source: 'manual',
    date: String(input.date).trim(),
    startTime: String(input.startTime).trim(),
    endTime: String(input.endTime).trim(),
    title: String(input.title).trim(),
    location: String(input.location).trim(),
    category: String(input.category || 'Live Programs').trim(),
    description: String(input.description || '').trim(),
  };
}

function addManual(input) {
  const errors = validateManual(input);
  if (errors.length) return { ok: false, errors };
  const data = read();
  const id = `manual-${crypto.randomUUID()}`;
  const evt = normalizeManual(input, id);
  data.manualEvents.push(evt);
  writeAll(data);
  return { ok: true, event: evt };
}

function updateManual(id, patch) {
  const data = read();
  const idx = data.manualEvents.findIndex(e => e.id === id);
  if (idx === -1) return { ok: false, errors: ['not found'] };
  const merged = { ...data.manualEvents[idx], ...patch, id };
  const errors = validateManual(merged);
  if (errors.length) return { ok: false, errors };
  data.manualEvents[idx] = normalizeManual(merged, id);
  writeAll(data);
  return { ok: true, event: data.manualEvents[idx] };
}

function removeManual(id) {
  const data = read();
  const before = data.manualEvents.length;
  data.manualEvents = data.manualEvents.filter(e => e.id !== id);
  if (data.manualEvents.length === before) return { ok: false };
  writeAll(data);
  return { ok: true };
}

function manualForDate(iso) {
  return read().manualEvents
    .filter(e => e.date === iso)
    .map(({ date, ...rest }) => rest);
}

function sanitizeImageExt(ext) {
  const cleaned = String(ext || '').trim().toLowerCase().replace(/^\./, '');
  return ALLOWED_IMAGE_EXTS.has(cleaned) ? cleaned : null;
}

function writeSpecialImage(id, buffer, ext) {
  const safeExt = sanitizeImageExt(ext);
  if (!safeExt) return null;
  fs.mkdirSync(SPECIAL_IMAGES_DIR, { recursive: true });
  const filename = `${id}.${safeExt}`;
  fs.writeFileSync(path.join(SPECIAL_IMAGES_DIR, filename), buffer);
  return filename;
}

function deleteSpecialImage(filename) {
  if (!filename) return;
  const safeName = path.basename(String(filename));
  const fullPath = path.join(SPECIAL_IMAGES_DIR, safeName);
  try { fs.unlinkSync(fullPath); } catch { /* file may already be gone */ }
}

function specialBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'on' || s === 'yes';
}

function normalizeSpecial(input, id, existing) {
  const fitRaw = String(input.fit || '').trim().toLowerCase();
  return {
    id,
    title: String(input.title || '').trim(),
    subtitle: String(input.subtitle || '').trim(),
    dateLabel: String(input.dateLabel || '').trim(),
    location: String(input.location || '').trim(),
    url: String(input.url || '').trim(),
    fit: fitRaw === 'contain' ? 'contain' : 'cover',
    transparent: specialBool(input.transparent),
    hidden: specialBool(input.hidden),
    imageFilename: existing && existing.imageFilename ? existing.imageFilename : '',
    createdAt: existing && existing.createdAt ? existing.createdAt : new Date().toISOString(),
  };
}

function listSpecial() {
  return read().specialEvents;
}

function addSpecial(input, imageBuffer, imageExt) {
  const title = String(input.title || '').trim();
  if (!title) return { ok: false, errors: ['title is required'] };
  const data = read();
  const id = `special-${crypto.randomUUID()}`;
  let imageFilename = '';
  if (imageBuffer && imageBuffer.length) {
    imageFilename = writeSpecialImage(id, imageBuffer, imageExt) || '';
  }
  const evt = normalizeSpecial(input, id, { imageFilename, createdAt: null });
  data.specialEvents.push(evt);
  writeAll(data);
  return { ok: true, event: evt };
}

function updateSpecial(id, patch, imageBuffer, imageExt, removeImage) {
  const data = read();
  const idx = data.specialEvents.findIndex(e => e.id === id);
  if (idx === -1) return { ok: false, errors: ['not found'] };
  const current = data.specialEvents[idx];
  const merged = { ...current, ...patch };
  const title = String(merged.title || '').trim();
  if (!title) return { ok: false, errors: ['title is required'] };

  let nextImageFilename = current.imageFilename || '';
  if (imageBuffer && imageBuffer.length) {
    if (current.imageFilename) deleteSpecialImage(current.imageFilename);
    nextImageFilename = writeSpecialImage(id, imageBuffer, imageExt) || '';
  } else if (removeImage && current.imageFilename) {
    deleteSpecialImage(current.imageFilename);
    nextImageFilename = '';
  }

  data.specialEvents[idx] = normalizeSpecial(merged, id, {
    imageFilename: nextImageFilename,
    createdAt: current.createdAt,
  });
  writeAll(data);
  return { ok: true, event: data.specialEvents[idx] };
}

function removeSpecial(id) {
  const data = read();
  const target = data.specialEvents.find(e => e.id === id);
  if (!target) return { ok: false };
  if (target.imageFilename) deleteSpecialImage(target.imageFilename);
  data.specialEvents = data.specialEvents.filter(e => e.id !== id);
  writeAll(data);
  return { ok: true };
}

function duplicateSpecial(id) {
  const data = read();
  const idx = data.specialEvents.findIndex(e => e.id === id);
  if (idx === -1) return { ok: false, errors: ['not found'] };
  const source = data.specialEvents[idx];
  const newId = `special-${crypto.randomUUID()}`;
  let newImageFilename = '';
  if (source.imageFilename) {
    const srcPath = path.join(SPECIAL_IMAGES_DIR, path.basename(source.imageFilename));
    try {
      const buffer = fs.readFileSync(srcPath);
      const extMatch = source.imageFilename.match(/\.([a-zA-Z0-9]+)$/);
      const ext = extMatch ? extMatch[1] : '';
      newImageFilename = writeSpecialImage(newId, buffer, ext) || '';
    } catch {
      newImageFilename = '';
    }
  }
  const newEvent = {
    ...source,
    id: newId,
    imageFilename: newImageFilename,
    createdAt: new Date().toISOString(),
  };
  data.specialEvents.splice(idx + 1, 0, newEvent);
  writeAll(data);
  return { ok: true, event: newEvent };
}

function reorderSpecial(ids) {
  if (!Array.isArray(ids)) return { ok: false, errors: ['ids array required'] };
  const data = read();
  const byId = new Map(data.specialEvents.map(e => [e.id, e]));
  const seen = new Set();
  const next = [];
  for (const id of ids) {
    if (typeof id !== 'string') continue;
    if (seen.has(id)) continue;
    const ev = byId.get(id);
    if (!ev) continue;
    seen.add(id);
    next.push(ev);
  }
  for (const ev of data.specialEvents) {
    if (!seen.has(ev.id)) next.push(ev);
  }
  data.specialEvents = next;
  writeAll(data);
  return { ok: true, events: next };
}

function getHiddenSignatures(dateISO) {
  const data = read();
  const list = data.hiddenWebsiteEvents[dateISO] || [];
  return new Set(list);
}

function setHidden(dateISO, signature, hidden) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
    return { ok: false, errors: ['date must be YYYY-MM-DD'] };
  }
  if (typeof signature !== 'string' || !signature) {
    return { ok: false, errors: ['signature required'] };
  }
  const data = read();
  const pruned = {};
  if (Array.isArray(data.hiddenWebsiteEvents[dateISO])) {
    pruned[dateISO] = data.hiddenWebsiteEvents[dateISO].slice();
  }
  const current = new Set(pruned[dateISO] || []);
  if (hidden) current.add(signature);
  else current.delete(signature);
  if (current.size) pruned[dateISO] = Array.from(current);
  else delete pruned[dateISO];
  data.hiddenWebsiteEvents = pruned;
  writeAll(data);
  return { ok: true };
}

module.exports = {
  read,
  getConfig,
  saveConfig,
  listManual,
  addManual,
  updateManual,
  removeManual,
  manualForDate,
  signatureFor,
  getHiddenSignatures,
  setHidden,
  listSpecial,
  addSpecial,
  updateSpecial,
  removeSpecial,
  duplicateSpecial,
  reorderSpecial,
};
