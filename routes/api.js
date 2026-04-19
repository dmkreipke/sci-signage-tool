const express = require('express');
const multer = require('multer');
const { parseCSV } = require('../src/csvParser');
const store = require('../src/scheduleStore');
const { filterAndMerge } = require('../src/displayFilter');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const VALID_DISPLAYS = ['star-theater', 'sci-live', 'front-entrance'];

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
  const data = store.write(rows, publishedBy || 'admin');
  res.json({ ok: true, count: rows.length, publishedAt: data.publishedAt });
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

module.exports = router;
