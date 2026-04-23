const express = require('express');
const path = require('path');
const apiRoutes = require('./routes/api');
const scraper = require('./src/publicScheduleScraper');

const app = express();
const PORT = process.env.PORT || 3000;
const SCRAPE_INTERVAL_MS = 60 * 1000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRoutes);

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SCI Signage Tool running at http://localhost:${PORT}`);
  console.log(`  Admin portal:    http://localhost:${PORT}/admin`);
  console.log(`  Star Theater:    http://localhost:${PORT}/display/star-theater.html`);
  console.log(`  SCI Live:        http://localhost:${PORT}/display/sci-live.html`);
  console.log(`  Group Schedules: http://localhost:${PORT}/display/group-schedules.html`);
  console.log(`  Public Signage:  http://localhost:${PORT}/display/public-signage.html`);

  scraper.refresh().then(r => {
    if (r.ok) console.log(`[scraper] initial fetch: ${r.count} events`);
    else console.warn(`[scraper] initial fetch failed: ${r.error}`);
  });
  setInterval(() => {
    scraper.refresh().then(r => {
      if (!r.ok) console.warn(`[scraper] refresh failed: ${r.error}`);
    });
  }, SCRAPE_INTERVAL_MS);
});
