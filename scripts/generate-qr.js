const QRCode = require('qrcode');
const path = require('path');

const url = process.argv[2];
if (!url) {
  console.error('usage: node scripts/generate-qr.js <url>');
  process.exit(1);
}

const out = path.join(__dirname, '..', 'public', 'display', 'assets', 'facility-map-qr.png');

QRCode.toFile(out, url, {
  margin: 1,
  width: 512,
  color: { dark: '#1a2030', light: '#ffffff' },
})
  .then(() => console.log(`Wrote ${out}\nEncodes: ${url}`))
  .catch(err => { console.error(err); process.exit(1); });
