const LOCATION_MAP = {
  'star-theater': 'Star Theater Planetarium',
  'sci-live': 'SCI Live Theater',
  'front-entrance': null, // null = all locations
};

function filterAndMerge(rows, display) {
  const targetLocation = LOCATION_MAP[display];

  const filtered = targetLocation
    ? rows.filter(r => r.location === targetLocation)
    : rows;

  const groups = new Map();
  for (const row of filtered) {
    const key = `${row.startTimeISO}||${row.programName}`;
    if (!groups.has(key)) {
      groups.set(key, { ...row, groups: [row.groupName] });
    } else {
      groups.get(key).groups.push(row.groupName);
    }
  }

  return Array.from(groups.values()).map(row => ({
    startTime: row.startTime,
    startTimeISO: row.startTimeISO,
    programName: row.programName,
    groups: row.groups,
    mergedGroupLabel: row.groups.join(' & '),
    location: row.location,
  }));
}

module.exports = { filterAndMerge };
