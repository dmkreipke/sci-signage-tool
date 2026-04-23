const express = require('express');
const multer = require('multer');
const { parseCSV, parseTimeToISO } = require('../src/csvParser');
const store = require('../src/scheduleStore');
const { filterAndMerge } = require('../src/displayFilter');
const scraper = require('../src/publicScheduleScraper');
const publicStore = require('../src/publicSignageStore');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
  const { rows, publishedBy } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows must be an array' });
  const normalized = rows.map(row => ({
    ...row,
    startTimeISO: parseTimeToISO(row.startTime) || row.startTimeISO || '',
  }));
  const data = store.write(normalized, publishedBy || 'admin');
  res.json({ ok: true, count: normalized.length, publishedAt: data.publishedAt });
});

router.get('/schedule', (req, res) => {
  res.json(store.read());
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
  res.json({ ok: true });
});

// ===== Public Day Signage =====

router.get('/public-signage/today', (req, res) => {
  const cached = scraper.getCached();
  const config = publicStore.getConfig();
  const manual = publicStore.manualForDate(cached.today);

  const website = cached.stale ? [] : cached.events;
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

module.exports = router;
