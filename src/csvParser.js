const { parse } = require('csv-parse/sync');

const COLUMN_MAP = {
  'BUSINESSPROCESSOUTPUT_PKID': 'id',
  'Itineraries\\Items\\Start time': 'startTime',
  'Itineraries\\Items\\Name': 'programName',
  'Name': 'groupName',
  'Itineraries\\Items\\Program\\Locations\\Name': 'location',
};

const KNOWN_LOCATIONS = ['Star Theater Planetarium', 'SCI Live Theater'];

function parseTimeToISO(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let [, hours, minutes, period] = match;
  hours = parseInt(hours, 10);
  minutes = parseInt(minutes, 10);
  if (period.toUpperCase() === 'AM') {
    if (hours === 12) hours = 0;
  } else {
    if (hours !== 12) hours += 12;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function scrubGroupName(name) {
  if (!name) return '';
  return name.replace(/\s*-.*$/, '').trim();
}

function normalizeHeaders(headers) {
  const map = {};
  for (const header of headers) {
    const normalized = header.replace(/\//g, '\\');
    for (const [key, field] of Object.entries(COLUMN_MAP)) {
      if (normalized.toLowerCase() === key.toLowerCase()) {
        map[header] = field;
        break;
      }
    }
  }
  return map;
}

function parseCSV(buffer) {
  const content = buffer.toString('utf8').replace(/^\uFEFF/, '');
  let records;
  try {
    records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    throw new Error(`CSV parse error: ${err.message}`);
  }

  if (records.length === 0) throw new Error('CSV file is empty');

  const headers = Object.keys(records[0]);
  const headerMap = normalizeHeaders(headers);

  const missingFields = Object.values(COLUMN_MAP).filter(
    field => !Object.values(headerMap).includes(field)
  );
  if (missingFields.length > 0) {
    throw new Error(`Missing required columns: ${missingFields.join(', ')}`);
  }

  const rows = [];
  const warnings = [];

  for (let i = 0; i < records.length; i++) {
    const raw = records[i];
    const row = {};
    for (const [rawKey, fieldName] of Object.entries(headerMap)) {
      row[fieldName] = raw[rawKey] || '';
    }

    row.groupName = scrubGroupName(row.groupName);
    if (!row.groupName) row.groupName = 'Private Show';

    const startTimeISO = parseTimeToISO(row.startTime);
    if (!startTimeISO) {
      warnings.push({ rowIndex: i, id: row.id, issue: `Invalid time format: "${row.startTime}"` });
    }
    row.startTimeISO = startTimeISO || '';

    if (!row.location) {
      warnings.push({ rowIndex: i, id: row.id, issue: 'Missing location' });
    } else if (!KNOWN_LOCATIONS.includes(row.location)) {
      warnings.push({ rowIndex: i, id: row.id, issue: `Unknown location: "${row.location}"` });
    }

    rows.push(row);
  }

  return { rows, warnings };
}

module.exports = { parseCSV };
