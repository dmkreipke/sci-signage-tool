const express = require('express');
const multer = require('multer');
const { parseCSV, parseTimeToISO } = require('../src/csvParser');
const store = require('../src/scheduleStore');
const { filterAndMerge } = require('../src/displayFilter');
const scraper = require('../src/publicScheduleScraper');
const publicStore = require('../src/publicSignageStore');
const scheduleListsStore = require('../src/scheduleListsStore');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const uploadImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const VALID_DISPLAYS = ['star-theater', 'sci-live', 'group-schedules'];

router.post('/schedule/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const { rows, warnings } = parseCSV(req.file.buffer);
    res.json({ rows, warnings });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

router.post('/schedule/publish', (req, res) => {
  const { rows, publishedBy, mode } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows must be an array' });
  const normalized = rows.map(row => ({
    ...row,
    startTimeISO: parseTimeToISO(row.startTime) || row.startTimeISO || '',
  }));
  const data = store.write(normalized, publishedBy || 'admin');
  const lists = mode === 'replace'
    ? scheduleListsStore.replaceFromRows(normalized)
    : scheduleListsStore.mergeFromRows(normalized);
  res.json({ ok: true, count: normalized.length, publishedAt: data.publishedAt, lists });
});

router.get('/schedule', (req, res) => {
  res.json(store.read());
});

router.get('/schedule/lists', (req, res) => {
  res.json(scheduleListsStore.read());
});

router.put('/schedule/lists', (req, res) => {
  const data = scheduleListsStore.saveLists(req.body || {});
  res.json({ ok: true, ...data });
});

router.get('/schedule/:display', (req, res) => {
  const { display } = req.params;
  if (!VALID_DISPLAYS.includes(display)) {
    return res.status(404).json({ error: `Unknown display: ${display}` });
  }
  const { rows, publishedAt } = store.read();
  const filtered = filterAndMerge(rows, display);
  res.json({ display, publishedAt, generatedAt: new Date().toISOString(), rows: filtered });
});

router.delete('/schedule', (req, res) => {
  store.clear();
  const lists = scheduleListsStore.resetToPermanentOnly();
  res.json({ ok: true, lists });
});

// ===== Public Day Signage =====

router.get('/public-signage/today', (req, res) => {
  const cached = scraper.getCached();
  const config = publicStore.getConfig();
  const manual = publicStore.manualForDate(cached.today);

  const hiddenSet = publicStore.getHiddenSignatures(cached.today);
  const website = cached.stale
    ? []
    : cached.events.map(ev => ({ ...ev, hidden: hiddenSet.has(publicStore.signatureFor(ev)) }));
  const merged = [...website, ...manual].sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  );

  res.json({
    generatedAt: new Date().toISOString(),
    today: cached.today,
    scrape: {
      lastSuccessAt: cached.lastSuccessAt,
      lastErrorAt: cached.lastErrorAt,
      lastErrorMessage: cached.lastErrorMessage,
      stale: cached.stale,
      forDate: cached.forDate,
    },
    config,
    events: merged,
    specialEvents: publicStore.listSpecial(),
  });
});

router.post('/public-signage/refresh', async (req, res) => {
  const result = await scraper.refresh();
  res.json({ ...result, cache: scraper.getCached() });
});

router.get('/public-signage/config', (req, res) => {
  res.json(publicStore.getConfig());
});

router.put('/public-signage/config', (req, res) => {
  const data = publicStore.saveConfig(req.body || {});
  res.json({ ok: true, publishedAt: data.publishedAt, config: publicStore.getConfig() });
});

router.get('/public-signage/manual', (req, res) => {
  res.json({ events: publicStore.listManual() });
});

router.post('/public-signage/manual', (req, res) => {
  const result = publicStore.addManual(req.body || {});
  if (!result.ok) return res.status(400).json({ error: 'Invalid event', details: result.errors });
  res.status(201).json(result.event);
});

router.patch('/public-signage/manual/:id', (req, res) => {
  const result = publicStore.updateManual(req.params.id, req.body || {});
  if (!result.ok) {
    const status = result.errors && result.errors[0] === 'not found' ? 404 : 400;
    return res.status(status).json({ error: 'Invalid event', details: result.errors });
  }
  res.json(result.event);
});

router.delete('/public-signage/manual/:id', (req, res) => {
  const result = publicStore.removeManual(req.params.id);
  if (!result.ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

router.put('/public-signage/hidden', (req, res) => {
  const { date, signature, hidden } = req.body || {};
  const result = publicStore.setHidden(date, signature, Boolean(hidden));
  if (!result.ok) return res.status(400).json({ error: 'Invalid request', details: result.errors });
  res.json({ ok: true });
});

function extFromFile(file) {
  if (!file || !file.originalname) return '';
  const m = String(file.originalname).match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1] : '';
}

router.get('/public-signage/special', (req, res) => {
  res.json({ events: publicStore.listSpecial() });
});

router.post('/public-signage/special', uploadImage.single('image'), (req, res) => {
  const buffer = req.file ? req.file.buffer : null;
  const ext = extFromFile(req.file);
  const result = publicStore.addSpecial(req.body || {}, buffer, ext);
  if (!result.ok) return res.status(400).json({ error: 'Invalid event', details: result.errors });
  res.status(201).json(result.event);
});

router.patch('/public-signage/special/:id', uploadImage.single('image'), (req, res) => {
  const buffer = req.file ? req.file.buffer : null;
  const ext = extFromFile(req.file);
  const removeImage = String((req.body || {}).removeImage || '').toLowerCase() === 'true';
  const result = publicStore.updateSpecial(req.params.id, req.body || {}, buffer, ext, removeImage);
  if (!result.ok) {
    const status = result.errors && result.errors[0] === 'not found' ? 404 : 400;
    return res.status(status).json({ error: 'Invalid event', details: result.errors });
  }
  res.json(result.event);
});

router.delete('/public-signage/special/:id', (req, res) => {
  const result = publicStore.removeSpecial(req.params.id);
  if (!result.ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

router.post('/public-signage/special/:id/duplicate', (req, res) => {
  const result = publicStore.duplicateSpecial(req.params.id);
  if (!result.ok) {
    const status = result.errors && result.errors[0] === 'not found' ? 404 : 400;
    return res.status(status).json({ error: 'Duplicate failed', details: result.errors });
  }
  res.status(201).json(result.event);
});

router.put('/public-signage/special/order', (req, res) => {
  const ids = req.body && Array.isArray(req.body.ids) ? req.body.ids : null;
  if (!ids) return res.status(400).json({ error: 'ids array required' });
  const result = publicStore.reorderSpecial(ids);
  if (!result.ok) return res.status(400).json({ error: 'Reorder failed', details: result.errors });
  res.json({ ok: true, events: result.events });
});

// Catch multer errors (e.g. LIMIT_FILE_SIZE) so they return JSON instead of HTML
router.use((err, req, res, next) => {
  console.error('[api error]', err);
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large (max 25 MB for images, 10 MB for CSV)' });
  }
  res.status(500).json({ error: err.message || 'Server error' });
});

module.exports = router;
