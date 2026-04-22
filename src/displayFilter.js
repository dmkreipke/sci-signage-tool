const LOCATION_MAP = {
  'star-theater': 'Star Theater Planetarium',
  'sci-live': 'SCI Live Theater',
};

const ARRIVE_PROGRAM = 'School SCI Exploration';
const LUNCH_PROGRAM = 'School Lunch';

function mergeByTimeAndProgram(rows, targetLocation) {
  const filtered = rows.filter(r => r.location === targetLocation);
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

function aggregateByGroup(rows) {
  const groups = new Map();

  for (const row of rows) {
    if (!row.id) continue;
    if (!groups.has(row.id)) {
      groups.set(row.id, {
        id: row.id,
        groupName: row.groupName,
        arriveTime: '',
        arriveTimeISO: '',
        lunches: [],
        programs: [],
      });
    }
    const g = groups.get(row.id);

    if (!g.groupName && row.groupName) g.groupName = row.groupName;

    if (row.programName === ARRIVE_PROGRAM) {
      if (!g.arriveTimeISO || row.startTimeISO < g.arriveTimeISO) {
        g.arriveTime = row.startTime;
        g.arriveTimeISO = row.startTimeISO;
      }
    } else if (row.programName === LUNCH_PROGRAM) {
      g.lunches.push({
        time: row.startTime,
        timeISO: row.startTimeISO,
        location: row.location,
      });
    } else {
      g.programs.push({
        time: row.startTime,
        timeISO: row.startTimeISO,
        name: row.programName,
        location: row.location,
      });
    }
  }

  for (const g of groups.values()) {
    g.lunches.sort((a, b) => (a.timeISO || '').localeCompare(b.timeISO || ''));
    g.programs.sort((a, b) => (a.timeISO || '').localeCompare(b.timeISO || ''));
  }

  return Array.from(groups.values()).sort((a, b) => {
    const aKey = a.arriveTimeISO || '99:99';
    const bKey = b.arriveTimeISO || '99:99';
    return aKey.localeCompare(bKey);
  });
}

function filterAndMerge(rows, display) {
  if (display === 'group-schedules') {
    return aggregateByGroup(rows);
  }
  const targetLocation = LOCATION_MAP[display];
  if (!targetLocation) return [];
  return mergeByTimeAndProgram(rows, targetLocation);
}

module.exports = { filterAndMerge, aggregateByGroup };
