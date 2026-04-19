const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'schedule.json');

function read() {
  try {
    const content = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    return { publishedAt: null, rows: [] };
  }
}

function write(rows, publishedBy = 'admin') {
  const data = {
    publishedAt: new Date().toISOString(),
    publishedBy,
    rows,
  };
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  return data;
}

function clear() {
  write([], 'admin');
}

module.exports = { read, write, clear };
