const express = require('express');
const path = require('path');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRoutes);

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SCI Signage Tool running at http://localhost:${PORT}`);
  console.log(`  Admin portal: http://localhost:${PORT}/admin`);
  console.log(`  Star Theater: http://localhost:${PORT}/display/star-theater.html`);
});
