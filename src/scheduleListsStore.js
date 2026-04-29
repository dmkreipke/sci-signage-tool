const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'schedule-lists.json');

const PERMANENT_LOCATIONS = [
  'Innovation Hallway',
  'SCI Live Theater',
  'Star Theater Planetarium',
  'Full Facility',
];

const PERMANENT_PROGRAMS = [
  'Fire Works',
  'Deep Freeze',
  'Zap',
  'Cold Blooded Critters',
  'Iowa Skies Tonight',
  'Discovering Deep Skies',
  'Solar Odyssey',
  'Meet Stuffee',
  'School SCI Exploration',
  'School Lunch',
];

function normalizeList(input) {
  if (!Array.isArray(input)) return [];
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

function withPermanentLocations(locations) {
  const seen = new Set(PERMANENT_LOCATIONS.map(v => v.toLowerCase()));
  const tail = (locations || []).filter(v => {
    const key = String(v).trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...PERMANENT_LOCATIONS, ...tail];
}

function withPermanentPrograms(programs) {
  const seen = new Set(PERMANENT_PROGRAMS.map(v => v.toLowerCase()));
  const tail = (programs || []).filter(v => {
    const key = String(v).trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...PERMANENT_PROGRAMS, ...tail];
}

function readRaw() {
  try {
    const content = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(content);
    return {
      publishedAt: parsed.publishedAt || null,
      programs: normalizeList(parsed.programs),
      groups: normalizeList(parsed.groups),
      locations: normalizeList(parsed.locations),
    };
  } catch {
    return { publishedAt: null, programs: [], groups: [], locations: [] };
  }
}

function read() {
  const data = readRaw();
  return {
    publishedAt: data.publishedAt,
    programs: withPermanentPrograms(data.programs),
    groups: data.groups,
    locations: withPermanentLocations(data.locations),
  };
}

function writeAll({ programs, groups, locations }) {
  const out = {
    publishedAt: new Date().toISOString(),
    programs: withPermanentPrograms(normalizeList(programs)),
    groups: normalizeList(groups),
    locations: withPermanentLocations(normalizeList(locations)),
  };
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(out, null, 2), 'utf8');
  return out;
}

function saveLists(patch) {
  const current = readRaw();
  return writeAll({
    programs: 'programs' in patch ? patch.programs : current.programs,
    groups: 'groups' in patch ? patch.groups : current.groups,
    locations: 'locations' in patch ? patch.locations : current.locations,
  });
}

function extractFromRows(rows) {
  const programs = [];
  const groups = [];
  const locations = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row && typeof row === 'object') {
      programs.push(row.programName);
      groups.push(row.groupName);
      locations.push(row.location);
    }
  }
  return { programs, groups, locations };
}

function mergeFromRows(rows) {
  const current = readRaw();
  const fromRows = extractFromRows(rows);
  return writeAll({
    programs: [...current.programs, ...fromRows.programs],
    groups: [...current.groups, ...fromRows.groups],
    locations: [...current.locations, ...fromRows.locations],
  });
}

function replaceFromRows(rows) {
  const fromRows = extractFromRows(rows);
  return writeAll(fromRows);
}

function resetToPermanentOnly() {
  return writeAll({ programs: [], groups: [], locations: [] });
}

module.exports = {
  read,
  saveLists,
  mergeFromRows,
  replaceFromRows,
  resetToPermanentOnly,
  PERMANENT_LOCATIONS,
  PERMANENT_PROGRAMS,
};
