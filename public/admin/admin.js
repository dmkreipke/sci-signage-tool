let parsedRows = [];
let managedRows = [];
let previewWarnings = [];
let sortState = { column: null, ascending: true };
let previewSortState = { column: null, ascending: true };

// --- Theme ---
const THEME_KEY = 'sci-admin-theme';
function applyTheme(theme) {
  const bright = theme === 'bright';
  document.body.classList.toggle('bright-mode', bright);
  const sw = document.getElementById('theme-switch');
  if (sw) {
    sw.classList.toggle('on', bright);
    sw.setAttribute('aria-checked', bright ? 'true' : 'false');
    sw.setAttribute('data-tooltip', bright ? 'Switch to dark mode' : 'Switch to bright mode');
  }
}
applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
document.getElementById('theme-switch').addEventListener('click', () => {
  const next = document.body.classList.contains('bright-mode') ? 'dark' : 'bright';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

// --- Time override (preview displays at a specific time, this browser only) ---
const TIME_OVERRIDE_KEY = 'sciTimeOverride';
const TIME_OVERRIDE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const toEl = {
  root: document.getElementById('time-override'),
  pill: document.getElementById('time-override-pill'),
  label: document.getElementById('time-override-label'),
  popover: document.getElementById('time-override-popover'),
  enabled: document.getElementById('time-override-enabled'),
  input: document.getElementById('time-override-input'),
  btnNow: document.getElementById('time-override-now'),
  btnClear: document.getElementById('time-override-clear'),
};

function readTimeOverride() {
  try {
    const raw = localStorage.getItem(TIME_OVERRIDE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.enabled) return null;
    if (!/^\d{2}:\d{2}$/.test(s.anchorDisplayTime || '')) return null;
    if (typeof s.anchorRealTime !== 'number') return null;
    if (Date.now() - s.anchorRealTime > TIME_OVERRIDE_MAX_AGE_MS) return null;
    return s;
  } catch { return null; }
}

function computeVirtualHHMM(state) {
  const [h, m] = state.anchorDisplayTime.split(':').map(Number);
  const anchorDisplay = new Date(state.anchorRealTime);
  anchorDisplay.setHours(h, m, 0, 0);
  const virtual = new Date(anchorDisplay.getTime() + (Date.now() - state.anchorRealTime));
  return `${String(virtual.getHours()).padStart(2, '0')}:${String(virtual.getMinutes()).padStart(2, '0')}`;
}

function refreshTimeOverridePill() {
  const state = readTimeOverride();
  if (state) {
    toEl.pill.classList.add('active');
    toEl.label.textContent = `Time: ${computeVirtualHHMM(state)}`;
  } else {
    toEl.pill.classList.remove('active');
    toEl.label.textContent = 'Time: LIVE';
  }
}

function loadTimeOverrideIntoForm() {
  const state = readTimeOverride();
  if (state) {
    toEl.enabled.checked = true;
    toEl.input.value = computeVirtualHHMM(state);
  } else {
    toEl.enabled.checked = false;
    const raw = localStorage.getItem(TIME_OVERRIDE_KEY);
    if (raw) {
      try {
        const s = JSON.parse(raw);
        if (s && /^\d{2}:\d{2}$/.test(s.anchorDisplayTime || '')) {
          toEl.input.value = s.anchorDisplayTime;
          return;
        }
      } catch { /* ignore */ }
    }
    const now = new Date();
    toEl.input.value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  }
}

function writeTimeOverride(enabled, hhmm) {
  const payload = {
    enabled: !!enabled,
    anchorDisplayTime: /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : '12:00',
    anchorRealTime: Date.now(),
  };
  localStorage.setItem(TIME_OVERRIDE_KEY, JSON.stringify(payload));
  if (typeof window.__timeOverrideNotify === 'function') window.__timeOverrideNotify();
  refreshTimeOverridePill();
}

function clearTimeOverride() {
  localStorage.removeItem(TIME_OVERRIDE_KEY);
  if (typeof window.__timeOverrideNotify === 'function') window.__timeOverrideNotify();
  refreshTimeOverridePill();
}

function setPopoverOpen(open) {
  toEl.popover.hidden = !open;
  toEl.pill.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) loadTimeOverrideIntoForm();
}

toEl.pill.addEventListener('click', (e) => {
  e.stopPropagation();
  setPopoverOpen(toEl.popover.hidden);
});

toEl.enabled.addEventListener('change', () => {
  writeTimeOverride(toEl.enabled.checked, toEl.input.value);
});

toEl.input.addEventListener('change', () => {
  writeTimeOverride(toEl.enabled.checked, toEl.input.value);
});

toEl.btnNow.addEventListener('click', () => {
  const now = new Date();
  toEl.input.value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  writeTimeOverride(toEl.enabled.checked, toEl.input.value);
});

toEl.btnClear.addEventListener('click', () => {
  toEl.enabled.checked = false;
  clearTimeOverride();
});

document.addEventListener('click', (e) => {
  if (toEl.popover.hidden) return;
  if (!toEl.root.contains(e.target)) setPopoverOpen(false);
});

window.addEventListener('storage', (e) => {
  if (e.key === TIME_OVERRIDE_KEY || e.key === null) refreshTimeOverridePill();
});

refreshTimeOverridePill();
setInterval(refreshTimeOverridePill, 1000);

const states = {
  upload: document.getElementById('state-upload'),
  preview: document.getElementById('state-preview'),
  confirm: document.getElementById('state-confirm'),
  published: document.getElementById('state-published'),
  manage: document.getElementById('state-manage'),
  publicSignage: document.getElementById('state-public-signage'),
};

function showState(name) {
  Object.entries(states).forEach(([key, el]) => el.classList.toggle('active', key === name));
}

// --- Tabs ---
const TAB_KEY = 'sci-admin-active-tab';
const tabPanels = {
  group: document.getElementById('tab-panel-group'),
  public: document.getElementById('tab-panel-public'),
};
const tabButtons = {
  group: document.getElementById('tab-group'),
  public: document.getElementById('tab-public'),
};

function activateTab(name) {
  if (!tabPanels[name]) name = 'group';
  Object.entries(tabPanels).forEach(([key, el]) => el.classList.toggle('active', key === name));
  Object.entries(tabButtons).forEach(([key, el]) => {
    el.classList.toggle('active', key === name);
    el.setAttribute('aria-selected', key === name ? 'true' : 'false');
  });
  localStorage.setItem(TAB_KEY, name);

  if (name === 'group') {
    const groupSubstates = ['upload', 'preview', 'published', 'manage'];
    const alreadyInGroup = groupSubstates.some(s => states[s]?.classList.contains('active'));
    if (!alreadyInGroup) loadManage();
  } else if (name === 'public') {
    loadPublicSignage();
  }
}

Object.entries(tabButtons).forEach(([name, btn]) => {
  btn.addEventListener('click', () => activateTab(name));
});

// --- Upload state ---
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadError = document.getElementById('upload-error');
const spinner = document.getElementById('spinner');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) uploadFile(file);
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) uploadFile(fileInput.files[0]); });

async function uploadFile(file) {
  uploadError.hidden = true;
  spinner.hidden = false;
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await fetch('/api/schedule/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    parsedRows = data.rows;
    previewWarnings = data.warnings || [];
    previewSortState = { column: null, ascending: true };
    renderPreview(data.rows, data.warnings);
    updatePreviewSortIndicators(null);
    showState('preview');
  } catch (err) {
    uploadError.textContent = err.message;
    uploadError.hidden = false;
  } finally {
    spinner.hidden = true;
    fileInput.value = '';
  }
}

// --- Preview/Edit state ---
function renderPreview(rows, warnings) {
  const body = document.getElementById('preview-body');
  const rowCount = document.getElementById('row-count');
  const warningCount = document.getElementById('warning-count');
  const warningsPanel = document.getElementById('warnings-panel');

  rowCount.textContent = `${rows.length} rows`;

  const warnSet = new Set(warnings.map(w => w.rowIndex));
  if (warnings.length > 0) {
    warningCount.textContent = `${warnings.length} warning${warnings.length > 1 ? 's' : ''}`;
    warningsPanel.hidden = false;
    warningsPanel.innerHTML = `<strong>Warnings — please review before publishing:</strong><ul>${
      warnings.map(w => `<li>Row ${w.rowIndex + 1} (ID ${w.id}): ${w.issue}</li>`).join('')
    }</ul>`;
  } else {
    warningCount.textContent = '';
    warningsPanel.hidden = true;
  }

  const sortedRows = rows.map((row, i) => ({ row, i }));
  if (previewSortState.column) {
    sortedRows.sort((a, b) => {
      let aVal = a.row[previewSortState.column] || '';
      let bVal = b.row[previewSortState.column] || '';
      if (previewSortState.column === 'startTime') {
        aVal = parseTime(aVal);
        bVal = parseTime(bVal);
      } else {
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
      }
      if (aVal < bVal) return previewSortState.ascending ? -1 : 1;
      if (aVal > bVal) return previewSortState.ascending ? 1 : -1;
      return 0;
    });
  }

  body.innerHTML = sortedRows.map(({ row, i }) => `
    <tr class="${warnSet.has(i) ? 'warn-row' : ''}" data-index="${i}">
      <td contenteditable="true" data-field="startTime">${esc(row.startTime)}</td>
      <td><input data-field="programName" list="gs-programs" value="${esc(row.programName)}"></td>
      <td><input data-field="groupName" list="gs-groups" value="${esc(row.groupName)}"></td>
      <td class="${!row.location ? 'warn-cell' : ''}"><input data-field="location" list="gs-locations" value="${esc(row.location)}"></td>
      <td><button class="btn-row-remove" data-remove-index="${i}" data-tooltip="Remove this row" aria-label="Remove this row">×</button></td>
    </tr>
  `).join('');
}

// Preview table header sort
const previewHeaders = document.querySelectorAll('#preview-table thead th');
['startTime', 'programName', 'groupName', 'location'].forEach((field, idx) => {
  previewHeaders[idx].addEventListener('click', () => {
    if (previewSortState.column === field) {
      previewSortState.ascending = !previewSortState.ascending;
    } else {
      previewSortState.column = field;
      previewSortState.ascending = true;
    }
    updatePreviewSortIndicators(field);
    renderPreview(parsedRows, previewWarnings);
  });
});

function updatePreviewSortIndicators(activeColumn) {
  const headers = document.querySelectorAll('#preview-table thead th');
  headers.forEach((th, idx) => {
    const fields = ['startTime', 'programName', 'groupName', 'location'];
    th.classList.remove('sort-asc', 'sort-desc');
    if (fields[idx] === activeColumn) {
      th.classList.add(previewSortState.ascending ? 'sort-asc' : 'sort-desc');
    }
  });
}

document.getElementById('preview-body').addEventListener('input', e => {
  const target = e.target.closest('[data-field]');
  if (!target) return;
  const tr = target.closest('tr[data-index]');
  if (!tr) return;
  const index = parseInt(tr.dataset.index, 10);
  const value = target.tagName === 'INPUT' ? target.value : target.textContent;
  parsedRows[index][target.dataset.field] = value.trim();
});

document.getElementById('preview-body').addEventListener('click', e => {
  const btn = e.target.closest('button[data-remove-index]');
  if (!btn) return;
  const index = parseInt(btn.dataset.removeIndex, 10);
  parsedRows.splice(index, 1);
  previewWarnings = previewWarnings
    .filter(w => w.rowIndex !== index)
    .map(w => w.rowIndex > index ? { ...w, rowIndex: w.rowIndex - 1 } : w);
  renderPreview(parsedRows, previewWarnings);
});

document.getElementById('btn-reset').addEventListener('click', () => showState('upload'));

document.getElementById('btn-publish').addEventListener('click', () => {
  const count = parsedRows.length;
  document.getElementById('confirm-msg').textContent =
    `You are about to publish ${count} row${count !== 1 ? 's' : ''}. All displays will update on their next refresh.`;
  showState('confirm');
});

// --- Confirm state ---
document.getElementById('btn-cancel').addEventListener('click', () => showState('preview'));

document.getElementById('btn-confirm').addEventListener('click', async () => {
  spinner.hidden = false;
  try {
    const res = await fetch('/api/schedule/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: parsedRows, mode: 'replace' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Publish failed');
    if (data.lists) {
      fillGsListsForm(data.lists);
      renderGsDatalists(data.lists);
    }
    document.getElementById('published-msg').textContent =
      `${data.count} rows published at ${new Date(data.publishedAt).toLocaleTimeString()}.`;
    showState('published');
  } catch (err) {
    alert(`Publish failed: ${err.message}`);
    showState('preview');
  } finally {
    spinner.hidden = true;
  }
});

// --- Published state ---
document.getElementById('btn-new').addEventListener('click', () => showState('upload'));
document.getElementById('btn-manage').addEventListener('click', () => loadManage());

// --- Wipe schedule (from within the Manage toolbar) ---
document.getElementById('btn-manage-wipe').addEventListener('click', async () => {
  if (!confirm('Wipe the published schedule? All displays will go blank until a new CSV is uploaded. Non-permanent dropdown list values will also be cleared.')) return;
  spinner.hidden = false;
  try {
    const res = await fetch('/api/schedule', { method: 'DELETE' });
    if (!res.ok) throw new Error('Wipe failed');
    const data = await res.json().catch(() => ({}));
    if (data && data.lists) {
      fillGsListsForm(data.lists);
      renderGsDatalists(data.lists);
    }
    parsedRows = [];
    managedRows = [];
    showState('upload');
    alert('Schedule wiped. Upload a new CSV to publish.');
  } catch (err) {
    alert(`Wipe failed: ${err.message}`);
  } finally {
    spinner.hidden = true;
  }
});

// --- Manage state ---
document.getElementById('btn-manage-upload').addEventListener('click', () => showState('upload'));
document.getElementById('btn-upload-manage').addEventListener('click', () => loadManage());

document.getElementById('btn-manage-add-row').addEventListener('click', () => {
  managedRows.unshift(blankRow());
  renderManageTable();
  const body = document.getElementById('manage-body');
  body.firstElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

async function loadManage() {
  spinner.hidden = false;
  try {
    const [scheduleRes, listsRes] = await Promise.all([
      fetch('/api/schedule'),
      fetch('/api/schedule/lists'),
    ]);
    const data = await scheduleRes.json();
    const lists = await listsRes.json();
    managedRows = data.rows || [];
    sortState = { column: null, ascending: true };
    document.getElementById('manage-published-at').textContent =
      data.publishedAt ? `Published ${new Date(data.publishedAt).toLocaleString()}` : '';
    fillGsListsForm(lists);
    renderGsDatalists(lists);
    renderManageTable();
    updateSortIndicators(null);
    showState('manage');
  } catch (err) {
    alert(`Failed to load schedule: ${err.message}`);
  } finally {
    spinner.hidden = true;
  }
}

function renderManageTable() {
  document.getElementById('manage-row-count').textContent =
    `${managedRows.length} row${managedRows.length !== 1 ? 's' : ''}`;

  const sortedRows = [...managedRows];
  if (sortState.column) {
    sortedRows.sort((a, b) => {
      let aVal = a[sortState.column] || '';
      let bVal = b[sortState.column] || '';

      if (sortState.column === 'startTime') {
        aVal = parseTime(aVal);
        bVal = parseTime(bVal);
      } else {
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
      }

      if (aVal < bVal) return sortState.ascending ? -1 : 1;
      if (aVal > bVal) return sortState.ascending ? 1 : -1;
      return 0;
    });
  }

  const body = document.getElementById('manage-body');
  body.innerHTML = sortedRows.map((row) => {
    const originalIndex = managedRows.indexOf(row);
    return `
    <tr data-manage-index="${originalIndex}" class="${row._new ? 'new-row' : ''}">
      <td contenteditable="true" data-field="startTime">${esc(row.startTime)}</td>
      <td><input data-field="programName" list="gs-programs" value="${esc(row.programName)}"></td>
      <td><input data-field="groupName" list="gs-groups" value="${esc(row.groupName)}"></td>
      <td class="${!row.location ? 'warn-cell' : ''}"><input data-field="location" list="gs-locations" value="${esc(row.location)}"></td>
      <td><button class="btn-row-remove" data-remove-index="${originalIndex}" data-tooltip="Remove this row" aria-label="Remove this row">×</button></td>
    </tr>
  `;
  }).join('');
}

// Manage table header sort
const manageHeaders = document.querySelectorAll('#state-manage table thead th');
['startTime', 'programName', 'groupName', 'location'].forEach((field, idx) => {
  manageHeaders[idx].style.cursor = 'pointer';
  manageHeaders[idx].addEventListener('click', () => {
    if (sortState.column === field) {
      sortState.ascending = !sortState.ascending;
    } else {
      sortState.column = field;
      sortState.ascending = true;
    }
    updateSortIndicators(field);
    renderManageTable();
  });
});

function updateSortIndicators(activeColumn) {
  const headers = document.querySelectorAll('#state-manage table thead th');
  headers.forEach((th, idx) => {
    const fields = ['startTime', 'programName', 'groupName', 'location'];
    th.classList.remove('sort-asc', 'sort-desc');
    if (fields[idx] === activeColumn) {
      th.classList.add(sortState.ascending ? 'sort-asc' : 'sort-desc');
    }
  });
}

// Single delegated listeners — attached once, not inside renderManageTable
document.getElementById('manage-body').addEventListener('input', e => {
  const target = e.target.closest('[data-field]');
  if (!target) return;
  const tr = target.closest('tr[data-manage-index]');
  if (!tr) return;
  const index = parseInt(tr.dataset.manageIndex, 10);
  const value = target.tagName === 'INPUT' ? target.value : target.textContent;
  managedRows[index][target.dataset.field] = value.trim();
});

document.getElementById('manage-body').addEventListener('click', e => {
  const btn = e.target.closest('button[data-remove-index]');
  if (!btn) return;
  const index = parseInt(btn.dataset.removeIndex, 10);
  managedRows.splice(index, 1);
  renderManageTable();
});

document.getElementById('btn-manage-save').addEventListener('click', async () => {
  spinner.hidden = false;
  try {
    const res = await fetch('/api/schedule/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: managedRows, mode: 'merge' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed');
    if (data.lists) {
      fillGsListsForm(data.lists);
      renderGsDatalists(data.lists);
    }
    managedRows = managedRows.map(r => { const c = { ...r }; delete c._new; return c; });
    renderManageTable();
    document.getElementById('manage-published-at').textContent =
      `Saved at ${new Date(data.publishedAt).toLocaleTimeString()}`;
    alert(`Saved. ${data.count} rows are now live.`);
  } catch (err) {
    alert(`Save failed: ${err.message}`);
  } finally {
    spinner.hidden = true;
  }
});

// --- Group Schedule dropdown lists ---
function parseGsList(textareaId) {
  return document.getElementById(textareaId).value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
}

function fillGsListsForm(lists) {
  document.getElementById('gs-list-programs').value = (lists.programs || []).join('\n');
  document.getElementById('gs-list-groups').value = (lists.groups || []).join('\n');
  document.getElementById('gs-list-locations').value = (lists.locations || []).join('\n');
}

function renderGsDatalists(lists) {
  const fill = (id, items) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = (items || []).map(v => `<option value="${esc(v)}"></option>`).join('');
  };
  fill('gs-programs', lists.programs);
  fill('gs-groups', lists.groups);
  fill('gs-locations', lists.locations);
}

document.getElementById('btn-gs-save-lists').addEventListener('click', async () => {
  const payload = {
    programs:  parseGsList('gs-list-programs'),
    groups:    parseGsList('gs-list-groups'),
    locations: parseGsList('gs-list-locations'),
  };
  const status = document.getElementById('gs-lists-status');
  status.textContent = '';
  spinner.hidden = false;
  try {
    const res = await fetch('/api/schedule/lists', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    fillGsListsForm(data);
    renderGsDatalists(data);
    status.textContent = `Saved ${new Date(data.publishedAt).toLocaleTimeString()}`;
  } catch (err) {
    alert(`Save failed: ${err.message}`);
  } finally {
    spinner.hidden = true;
  }
});

// --- Helpers ---
function blankRow() {
  return {
    id: `manual-${Date.now()}`,
    startTime: '',
    startTimeISO: '',
    programName: '',
    groupName: '',
    location: '',
    _new: true,
  };
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function parseTime(timeStr) {
  if (!timeStr) return '';
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s?(AM|PM)?/i);
  if (!match) return timeStr;
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3] ? match[3].toUpperCase() : '';
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return String(hours).padStart(2, '0') + ':' + minutes;
}

// ============================================================
// Public Day Signage
// ============================================================

let psManualLocal = [];   // working copy of manual events (may include unsaved edits)
let psTodayISO = null;

function psSignature(ev) {
  return [ev.startTime || '', ev.endTime || '', ev.title || '', ev.location || ''].join('|');
}

function psTimeTo12(hhmm) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return hhmm || '';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function psRelTime(iso) {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  const diff = Math.round((Date.now() - then) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  return `${Math.round(diff / 3600)} hr ago`;
}

async function loadPublicSignage() {
  spinner.hidden = false;
  try {
    const [todayRes, manualRes, configRes, specialRes] = await Promise.all([
      fetch('/api/public-signage/today'),
      fetch('/api/public-signage/manual'),
      fetch('/api/public-signage/config'),
      fetch('/api/public-signage/special'),
    ]);
    const today = await todayRes.json();
    const manual = await manualRes.json();
    const config = await configRes.json();
    const special = await specialRes.json();

    psTodayISO = today.today;
    psManualLocal = (manual.events || []).map(e => ({ ...e, _dirty: false, _new: false }));
    psSpecialLocal = (special.events || []).map(e => ({ ...e, _dirty: false, _new: false }));

    renderPsTodayTable(today);
    renderPsScrapeStatus(today.scrape, today.today);
    renderPsDatalists(config);
    renderPsManualList();
    renderPsSpecialList();
    fillPsConfigForm(config);
    showState('publicSignage');
  } catch (err) {
    alert(`Failed to load public signage: ${err.message}`);
  } finally {
    spinner.hidden = true;
  }
}

function renderPsTodayTable(data) {
  const body = document.getElementById('ps-today-body');
  const events = data.events || [];
  if (events.length === 0) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#8b949e;padding:20px">No events scheduled for today.</td></tr>`;
    return;
  }
  body.innerHTML = events.map(ev => {
    const isWebsite = ev.source !== 'manual';
    const badge = ev.source === 'manual'
      ? `<span class="ps-badge ps-badge-manual">Manual</span>`
      : `<span class="ps-badge ps-badge-website">Website</span>`;
    const rowClass = isWebsite && ev.hidden ? ' class="ps-row-hidden"' : '';
    const toggleCell = isWebsite
      ? `<td><label class="ps-hide-toggle tooltip-right" data-tooltip="Deselect to remove from displays. Select to keep on displays"><input type="checkbox" data-ps-hide-sig="${esc(psSignature(ev))}"${ev.hidden ? '' : ' checked'}></label></td>`
      : `<td style="text-align:center;color:#8b949e">—</td>`;
    return `
      <tr${rowClass}>
        ${toggleCell}
        <td>${badge}</td>
        <td>${esc(psTimeTo12(ev.startTime))} – ${esc(psTimeTo12(ev.endTime))}</td>
        <td>${esc(ev.title)}</td>
        <td>${esc(ev.location)}</td>
        <td>${esc(ev.category || '')}</td>
      </tr>
    `;
  }).join('');
}

function renderPsScrapeStatus(scrape, today) {
  const el = document.getElementById('ps-scrape-status');
  if (!scrape) { el.textContent = ''; return; }
  const parts = [`Today: ${today}`];
  if (scrape.lastSuccessAt) parts.push(`last scrape: ${psRelTime(scrape.lastSuccessAt)}`);
  else parts.push('no successful scrape yet');
  if (scrape.lastErrorAt && (!scrape.lastSuccessAt || new Date(scrape.lastErrorAt) > new Date(scrape.lastSuccessAt))) {
    parts.push(`⚠ ${scrape.lastErrorMessage || 'unknown error'}`);
  }
  el.textContent = parts.join(' · ');
  el.style.color = scrape.lastErrorAt && (!scrape.lastSuccessAt || new Date(scrape.lastErrorAt) > new Date(scrape.lastSuccessAt))
    ? '#d4a017' : '#8b949e';
}

function renderPsManualList() {
  const list = document.getElementById('ps-manual-list');
  if (psManualLocal.length === 0) {
    list.innerHTML = `<div class="ps-empty">No manual events yet. Click <strong>+ Add manual event</strong> to add one.</div>`;
    return;
  }
  const sorted = [...psManualLocal].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.startTime || '').localeCompare(b.startTime || '');
  });
  list.innerHTML = sorted.map(ev => {
    const idx = psManualLocal.indexOf(ev);
    const cls = ev._new ? 'ps-new' : (ev._dirty ? 'ps-dirty' : '');
    return `
      <div class="ps-manual-card ${cls}" data-ps-index="${idx}">
        <label class="ps-field"><span>Date</span>
          <input type="date" data-psf="date" value="${esc(ev.date)}">
        </label>
        <label class="ps-field"><span>Start</span>
          <input type="time" data-psf="startTime" value="${esc(ev.startTime)}">
        </label>
        <label class="ps-field"><span>End</span>
          <input type="time" data-psf="endTime" value="${esc(ev.endTime)}">
        </label>
        <label class="ps-field"><span>Title</span>
          <input type="text" data-psf="title" list="ps-titles" value="${esc(ev.title)}">
        </label>
        <label class="ps-field"><span>Location</span>
          <input type="text" data-psf="location" list="ps-locations" value="${esc(ev.location)}">
        </label>
        <label class="ps-field"><span>Category</span>
          <input type="text" data-psf="category" list="ps-categories" value="${esc(ev.category)}">
        </label>
        <div></div>
        <label class="ps-field ps-field-full"><span>Description</span>
          <textarea data-psf="description" rows="2" placeholder="Optional — shown on the 'Now Showing' card">${esc(ev.description)}</textarea>
        </label>
        <div class="ps-field-actions">
          ${ev._dirty ? '<span class="ps-dirty-note">unsaved changes</span>' : ''}
          ${ev._new
            ? `<button class="btn-secondary" data-ps-cancel="${idx}" data-tooltip="Discard and remove this new event">Cancel</button><button class="btn-primary" data-ps-save="${idx}" data-tooltip="Save this event to the signage">Save event</button>`
            : `<button class="btn-danger" data-ps-delete="${idx}" data-tooltip="Permanently delete this event">Delete</button>${ev._dirty ? `<button class="btn-primary" data-ps-save="${idx}" data-tooltip="Save changes to this event">Save changes</button>` : ''}`
          }
        </div>
      </div>
    `;
  }).join('');
}

function fillPsConfigForm(config) {
  const ticker = document.getElementById('ps-ticker');
  const qrUrl = document.getElementById('ps-qr-url');
  ticker.value = config.tickerText || '';
  ticker._savedValue = ticker.value;
  qrUrl.value = config.qrUrl || '';
  qrUrl._savedValue = qrUrl.value;
  document.getElementById('ps-config-dirty').hidden = true;
  const closingInput = document.getElementById('ps-closing-time');
  closingInput.value = config.closingTime || '';
  closingInput._savedValue = closingInput.value;
  document.getElementById('ps-closing-dirty').hidden = true;
  document.getElementById('ps-list-titles').value = (config.titles || []).join('\n');
  document.getElementById('ps-list-locations').value = (config.locations || []).join('\n');
  document.getElementById('ps-list-categories').value = (config.categories || []).join('\n');
}

function renderPsDatalists(config) {
  const fill = (id, items) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = (items || []).map(v => `<option value="${esc(v)}"></option>`).join('');
  };
  fill('ps-titles', config.titles);
  fill('ps-locations', config.locations);
  fill('ps-categories', config.categories);
}

function parsePsList(textareaId) {
  return document.getElementById(textareaId).value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
}

// Handlers
document.getElementById('ps-today-body').addEventListener('change', async e => {
  const input = e.target.closest('input[data-ps-hide-sig]');
  if (!input) return;
  const signature = input.getAttribute('data-ps-hide-sig');
  const shouldShow = input.checked;
  const hidden = !shouldShow;
  const tr = input.closest('tr');
  if (tr) tr.classList.toggle('ps-row-hidden', hidden);
  try {
    const res = await fetch('/api/public-signage/hidden', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: psTodayISO, signature, hidden }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    input.checked = shouldShow ? false : true;
    if (tr) tr.classList.toggle('ps-row-hidden', !hidden);
    alert(`Failed to update visibility: ${err.message}`);
  }
});

document.getElementById('btn-ps-refresh').addEventListener('click', async () => {
  spinner.hidden = false;
  try {
    const res = await fetch('/api/public-signage/refresh', { method: 'POST' });
    const data = await res.json();
    if (!data.ok) alert(`Refresh reported an error: ${data.error || 'unknown'}`);
    const todayRes = await fetch('/api/public-signage/today');
    const today = await todayRes.json();
    renderPsTodayTable(today);
    renderPsScrapeStatus(today.scrape, today.today);
  } catch (err) {
    alert(`Refresh failed: ${err.message}`);
  } finally {
    spinner.hidden = true;
  }
});

document.getElementById('btn-ps-add-manual').addEventListener('click', () => {
  psManualLocal.unshift({
    id: null,
    date: psTodayISO || new Date().toISOString().slice(0, 10),
    startTime: '',
    endTime: '',
    title: '',
    location: '',
    category: 'Live Programs',
    description: '',
    _new: true,
    _dirty: true,
  });
  renderPsManualList();
});

function handlePsManualFieldChange(e) {
  const input = e.target.closest('[data-psf]');
  if (!input) return;
  const card = input.closest('[data-ps-index]');
  if (!card) return;
  const idx = parseInt(card.dataset.psIndex, 10);
  const field = input.dataset.psf;
  psManualLocal[idx][field] = input.value;
  if (!psManualLocal[idx]._new) {
    if (!psManualLocal[idx]._dirty) {
      psManualLocal[idx]._dirty = true;
      card.classList.add('ps-dirty');
      const actions = card.querySelector('.ps-field-actions');
      if (actions && !actions.querySelector('[data-ps-save]')) {
        actions.insertAdjacentHTML('afterbegin', '<span class="ps-dirty-note">unsaved changes</span>');
        actions.insertAdjacentHTML('beforeend',
          `<button class="btn-primary" data-ps-save="${idx}">Save changes</button>`);
      }
    }
  }
}
document.getElementById('ps-manual-list').addEventListener('input', handlePsManualFieldChange);
document.getElementById('ps-manual-list').addEventListener('change', handlePsManualFieldChange);

document.getElementById('ps-manual-list').addEventListener('click', async e => {
  const saveBtn = e.target.closest('[data-ps-save]');
  const cancelBtn = e.target.closest('[data-ps-cancel]');
  const deleteBtn = e.target.closest('[data-ps-delete]');

  if (cancelBtn) {
    const idx = parseInt(cancelBtn.dataset.psCancel, 10);
    psManualLocal.splice(idx, 1);
    renderPsManualList();
    return;
  }

  if (deleteBtn) {
    const idx = parseInt(deleteBtn.dataset.psDelete, 10);
    const ev = psManualLocal[idx];
    if (!confirm(`Delete "${ev.title || '(untitled)'}"? This cannot be undone.`)) return;
    spinner.hidden = false;
    try {
      const res = await fetch(`/api/public-signage/manual/${encodeURIComponent(ev.id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      psManualLocal.splice(idx, 1);
      renderPsManualList();
      await refreshPsTodayView();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      spinner.hidden = true;
    }
    return;
  }

  if (saveBtn) {
    const idx = parseInt(saveBtn.dataset.psSave, 10);
    const ev = psManualLocal[idx];
    spinner.hidden = false;
    try {
      const payload = {
        date: ev.date, startTime: ev.startTime, endTime: ev.endTime,
        title: ev.title, location: ev.location,
        category: ev.category, description: ev.description,
      };
      let res, data;
      if (ev._new) {
        res = await fetch('/api/public-signage/manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/public-signage/manual/${encodeURIComponent(ev.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      data = await res.json();
      if (!res.ok) {
        const msg = data.details ? data.details.join('; ') : (data.error || `HTTP ${res.status}`);
        throw new Error(msg);
      }
      psManualLocal[idx] = { ...data, _dirty: false, _new: false };
      renderPsManualList();
      await refreshPsTodayView();
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    } finally {
      spinner.hidden = true;
    }
  }
});

async function refreshPsTodayView() {
  try {
    const res = await fetch('/api/public-signage/today');
    const today = await res.json();
    renderPsTodayTable(today);
    renderPsScrapeStatus(today.scrape, today.today);
  } catch { /* ignore */ }
}

// ---------- Special events ----------

let psSpecialLocal = [];

function renderPsSpecialList() {
  const list = document.getElementById('ps-special-list');
  if (psSpecialLocal.length === 0) {
    list.innerHTML = `<div class="ps-empty">No special events yet. Click <strong>+ Add special event</strong> to add one.</div>`;
    return;
  }
  list.innerHTML = psSpecialLocal.map((ev, idx) => {
    const stateCls = ev._new ? 'ps-new' : (ev._dirty ? 'ps-dirty' : '');
    const hiddenCls = ev.hidden ? 'ps-special-hidden' : '';
    const cls = [stateCls, hiddenCls].filter(Boolean).join(' ');
    const previewCls = [
      'ps-special-preview',
      ev.transparent ? 'preview-transparent' : 'preview-framed',
      ev.fit === 'contain' ? 'preview-contain' : 'preview-cover',
    ].join(' ');
    const imgPreview = ev.imageFilename
      ? `<img src="/special-event-images/${esc(ev.imageFilename)}?t=${Date.now()}" alt="" />`
      : `<div class="ps-special-noimg">No image<br><span class="ps-special-dims">480 × 640</span><span class="ps-special-dims-note">3:4 portrait</span></div>`;
    const imgButtons = ev._new
      ? `<button type="button" class="btn-secondary ps-file-label" data-ps-special-filepick="${idx}" data-tooltip="Upload a poster image for this event">Choose image</button>`
      : `<button type="button" class="btn-secondary ps-file-label" data-ps-special-filepick="${idx}" data-tooltip="Upload a new poster image">${ev.imageFilename ? 'Replace image' : 'Choose image'}</button>${ev.imageFilename ? `<button class="btn-secondary" data-ps-special-removeimg="${idx}" data-tooltip="Remove the image from this event">Remove image</button>` : ''}`;
    const pendingNote = ev._pendingImageName
      ? `<span class="ps-dirty-note">image ready: ${esc(ev._pendingImageName)}</span>`
      : (ev._pendingRemoveImage ? `<span class="ps-dirty-note">image will be removed</span>` : '');
    const hiddenBadge = ev.hidden ? '<span class="ps-special-hidden-badge">Hidden</span>' : '';
    return `
      <div class="ps-special-card ${cls}" data-ps-special-index="${idx}" data-ps-special-id="${esc(ev.id || '')}"${ev._new ? '' : ' draggable="true"'}>
        ${ev._new ? '<div class="ps-special-drag-handle ps-special-drag-disabled"></div>' : '<div class="ps-special-drag-handle" data-tooltip="Drag to reorder" aria-label="Drag to reorder">⋮⋮</div>'}
        <div class="ps-special-preview-col">
          <div class="${previewCls}">${imgPreview}${hiddenBadge}</div>
          <div class="ps-seg-group">
            <div class="ps-seg-label">Fit</div>
            <div class="ps-seg" role="group">
              <button type="button" class="ps-seg-btn ${ev.fit !== 'contain' ? 'is-active' : ''}" data-pssf-fit="${idx}" data-val="cover" data-tooltip="Crop image to fill the frame">Crop</button>
              <button type="button" class="ps-seg-btn ${ev.fit === 'contain' ? 'is-active' : ''}" data-pssf-fit="${idx}" data-val="contain" data-tooltip="Fit entire image within the frame">Fit</button>
            </div>
            <div class="ps-seg-label">Frame</div>
            <div class="ps-seg" role="group">
              <button type="button" class="ps-seg-btn ${!ev.transparent ? 'is-active' : ''}" data-pssf-transparent="${idx}" data-val="false" data-tooltip="Show a gold border frame around the image">Frame</button>
              <button type="button" class="ps-seg-btn ${ev.transparent ? 'is-active' : ''}" data-pssf-transparent="${idx}" data-val="true" data-tooltip="No frame, transparent background">None</button>
            </div>
          </div>
        </div>
        <div class="ps-special-fields">
          <label class="ps-field"><span>Title</span>
            <input type="text" data-pssf="title" value="${esc(ev.title)}">
          </label>
          <label class="ps-field"><span>Subtitle</span>
            <input type="text" data-pssf="subtitle" value="${esc(ev.subtitle || '')}">
          </label>
          <label class="ps-field"><span>Date label</span>
            <input type="text" data-pssf="dateLabel" value="${esc(ev.dateLabel || '')}">
          </label>
          <label class="ps-field"><span>Location</span>
            <input type="text" data-pssf="location" list="ps-locations" value="${esc(ev.location || '')}">
          </label>
          <label class="ps-field ps-field-full"><span>URL <small style="text-transform:none;letter-spacing:normal;color:#8b949e">(optional — generates a QR on the display)</small></span>
            <input type="text" data-pssf="url" value="${esc(ev.url || '')}">
          </label>
          <div class="ps-special-imgrow">
            ${imgButtons}
            ${pendingNote}
          </div>
          <div class="ps-field-actions">
            ${ev._new
              ? `<button class="btn-secondary" data-ps-special-cancel="${idx}" data-tooltip="Discard and remove this new event">Cancel</button><button class="btn-primary" data-ps-special-save="${idx}" data-tooltip="Save this event to the signage">Save event</button>`
              : `<button class="btn-danger" data-ps-special-delete="${idx}" data-tooltip="Permanently delete this event">Delete</button><button class="btn-secondary ps-special-dup-btn" data-ps-special-duplicate="${idx}" data-tooltip="Duplicate this event card">Duplicate</button><button class="${ev.hidden ? 'btn-primary' : 'btn-secondary'} ps-special-hide-btn" data-ps-special-toggle-hide="${idx}" data-tooltip="${ev.hidden ? 'Make this event visible on the public display' : 'Hide this event from the public display'}">${ev.hidden ? 'Unhide from Display' : 'Hide from Display'}</button>${ev._dirty ? `<button class="btn-primary ps-special-save-btn" data-ps-special-save="${idx}" data-tooltip="Save changes to this event">Save changes</button><span class="ps-dirty-note ps-dirty-note-right">unsaved changes</span>` : ''}`
            }
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function markPsSpecialDirty(idx) {
  const ev = psSpecialLocal[idx];
  if (!ev || ev._new) return;
  if (!ev._dirty) {
    ev._dirty = true;
    renderPsSpecialList();
  }
}

document.getElementById('btn-ps-add-special').addEventListener('click', () => {
  psSpecialLocal.unshift({
    id: null,
    title: '',
    subtitle: '',
    dateLabel: '',
    location: '',
    url: '',
    fit: 'cover',
    transparent: false,
    hidden: false,
    imageFilename: '',
    _new: true,
    _dirty: true,
  });
  renderPsSpecialList();
});

document.getElementById('ps-special-list').addEventListener('input', e => {
  const input = e.target.closest('[data-pssf]');
  if (!input) return;
  const card = input.closest('[data-ps-special-index]');
  if (!card) return;
  const idx = parseInt(card.dataset.psSpecialIndex, 10);
  psSpecialLocal[idx][input.dataset.pssf] = input.value;
  markPsSpecialDirty(idx);
});

// Single shared file picker — lives outside the list so re-renders never destroy it
let psSpecialFilePendingIdx = -1;
const psSpecialFilePicker = document.createElement('input');
psSpecialFilePicker.type = 'file';
psSpecialFilePicker.accept = 'image/jpeg,image/png,image/webp';
psSpecialFilePicker.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none';
document.body.appendChild(psSpecialFilePicker);

psSpecialFilePicker.addEventListener('change', () => {
  const idx = psSpecialFilePendingIdx;
  const file = psSpecialFilePicker.files && psSpecialFilePicker.files[0];
  psSpecialFilePicker.value = '';
  if (idx < 0 || !psSpecialLocal[idx] || !file) return;
  if (file.size > 25 * 1024 * 1024) {
    alert(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 25 MB.`);
    return;
  }
  psSpecialLocal[idx]._pendingImageFile = file;
  psSpecialLocal[idx]._pendingImageName = file.name;
  psSpecialLocal[idx]._pendingRemoveImage = false;
  if (!psSpecialLocal[idx]._new) psSpecialLocal[idx]._dirty = true;
  renderPsSpecialList();
});

document.getElementById('ps-special-list').addEventListener('click', async e => {
  const fitBtn = e.target.closest('[data-pssf-fit]');
  if (fitBtn) {
    const idx = parseInt(fitBtn.dataset.pssfFit, 10);
    if (psSpecialLocal[idx].fit !== fitBtn.dataset.val) {
      psSpecialLocal[idx].fit = fitBtn.dataset.val;
      markPsSpecialDirty(idx);
      renderPsSpecialList();
    }
    return;
  }
  const transBtn = e.target.closest('[data-pssf-transparent]');
  if (transBtn) {
    const idx = parseInt(transBtn.dataset.pssfTransparent, 10);
    const next = transBtn.dataset.val === 'true';
    if (psSpecialLocal[idx].transparent !== next) {
      psSpecialLocal[idx].transparent = next;
      markPsSpecialDirty(idx);
      renderPsSpecialList();
    }
    return;
  }
  const filePickBtn = e.target.closest('[data-ps-special-filepick]');
  if (filePickBtn) {
    psSpecialFilePendingIdx = parseInt(filePickBtn.dataset.psSpecialFilepick, 10);
    psSpecialFilePicker.click();
    return;
  }
  const cancelBtn = e.target.closest('[data-ps-special-cancel]');
  const removeImgBtn = e.target.closest('[data-ps-special-removeimg]');
  const deleteBtn = e.target.closest('[data-ps-special-delete]');
  const duplicateBtn = e.target.closest('[data-ps-special-duplicate]');
  const toggleHideBtn = e.target.closest('[data-ps-special-toggle-hide]');
  const saveBtn = e.target.closest('[data-ps-special-save]');

  if (duplicateBtn) {
    const idx = parseInt(duplicateBtn.dataset.psSpecialDuplicate, 10);
    const ev = psSpecialLocal[idx];
    spinner.hidden = false;
    try {
      const res = await fetch(`/api/public-signage/special/${encodeURIComponent(ev.id)}/duplicate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      psSpecialLocal.splice(idx + 1, 0, { ...data, _dirty: false, _new: false });
      renderPsSpecialList();
    } catch (err) {
      alert(`Duplicate failed: ${err.message}`);
    } finally {
      spinner.hidden = true;
    }
    return;
  }

  if (toggleHideBtn) {
    const idx = parseInt(toggleHideBtn.dataset.psSpecialToggleHide, 10);
    const ev = psSpecialLocal[idx];
    const newHidden = !ev.hidden;
    spinner.hidden = false;
    try {
      const formData = new FormData();
      formData.append('hidden', newHidden ? 'true' : 'false');
      const res = await fetch(`/api/public-signage/special/${encodeURIComponent(ev.id)}`, { method: 'PATCH', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      psSpecialLocal[idx] = { ...data, _dirty: false, _new: false };
      renderPsSpecialList();
    } catch (err) {
      alert(`Toggle failed: ${err.message}`);
    } finally {
      spinner.hidden = true;
    }
    return;
  }

  if (cancelBtn) {
    const idx = parseInt(cancelBtn.dataset.psSpecialCancel, 10);
    psSpecialLocal.splice(idx, 1);
    renderPsSpecialList();
    return;
  }

  if (removeImgBtn) {
    const idx = parseInt(removeImgBtn.dataset.psSpecialRemoveimg, 10);
    psSpecialLocal[idx]._pendingRemoveImage = true;
    psSpecialLocal[idx]._pendingImageFile = null;
    psSpecialLocal[idx]._pendingImageName = '';
    psSpecialLocal[idx]._dirty = true;
    renderPsSpecialList();
    return;
  }

  if (deleteBtn) {
    const idx = parseInt(deleteBtn.dataset.psSpecialDelete, 10);
    const ev = psSpecialLocal[idx];
    if (!confirm(`Delete "${ev.title || '(untitled)'}"? This cannot be undone.`)) return;
    spinner.hidden = false;
    try {
      const res = await fetch(`/api/public-signage/special/${encodeURIComponent(ev.id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      psSpecialLocal.splice(idx, 1);
      renderPsSpecialList();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      spinner.hidden = true;
    }
    return;
  }

  if (saveBtn) {
    const idx = parseInt(saveBtn.dataset.psSpecialSave, 10);
    const ev = psSpecialLocal[idx];
    if (!ev.title || !ev.title.trim()) {
      alert('Title is required.');
      return;
    }
    spinner.hidden = false;
    try {
      const formData = new FormData();
      formData.append('title', ev.title || '');
      formData.append('subtitle', ev.subtitle || '');
      formData.append('dateLabel', ev.dateLabel || '');
      formData.append('location', ev.location || '');
      formData.append('url', ev.url || '');
      formData.append('fit', ev.fit || 'cover');
      formData.append('transparent', ev.transparent ? 'true' : 'false');
      formData.append('hidden', ev.hidden ? 'true' : 'false');
      if (ev._pendingImageFile) formData.append('image', ev._pendingImageFile);
      if (ev._pendingRemoveImage) formData.append('removeImage', 'true');
      const url = ev._new
        ? '/api/public-signage/special'
        : `/api/public-signage/special/${encodeURIComponent(ev.id)}`;
      const method = ev._new ? 'POST' : 'PATCH';
      const res = await fetch(url, { method, body: formData });
      let data;
      try { data = await res.json(); } catch { data = {}; }
      if (!res.ok) {
        const msg = (data.details ? data.details.join('; ') : null) || data.error || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      psSpecialLocal[idx] = { ...data, _dirty: false, _new: false };
      renderPsSpecialList();
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    } finally {
      spinner.hidden = true;
    }
  }
});

function checkConfigDirty() {
  const ticker = document.getElementById('ps-ticker');
  const qrUrl = document.getElementById('ps-qr-url');
  const dirty = document.getElementById('ps-config-dirty');
  const changed = ticker.value !== (ticker._savedValue ?? '') || qrUrl.value !== (qrUrl._savedValue ?? '');
  dirty.hidden = !changed;
  if (changed) document.getElementById('ps-config-status').textContent = '';
}

document.getElementById('ps-ticker').addEventListener('input', checkConfigDirty);
document.getElementById('ps-qr-url').addEventListener('input', checkConfigDirty);

document.getElementById('btn-ps-save-config').addEventListener('click', async () => {
  const ticker = document.getElementById('ps-ticker');
  const qrUrl = document.getElementById('ps-qr-url');
  const payload = {
    tickerText: ticker.value,
    qrUrl: qrUrl.value,
  };
  const status = document.getElementById('ps-config-status');
  status.textContent = '';
  spinner.hidden = false;
  try {
    const res = await fetch('/api/public-signage/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    ticker._savedValue = ticker.value;
    qrUrl._savedValue = qrUrl.value;
    document.getElementById('ps-config-dirty').hidden = true;
    status.textContent = `Saved ${new Date(data.publishedAt).toLocaleTimeString()}`;
  } catch (err) {
    alert(`Save failed: ${err.message}`);
  } finally {
    spinner.hidden = true;
  }
});

document.getElementById('ps-closing-time').addEventListener('input', () => {
  const input = document.getElementById('ps-closing-time');
  const dirty = document.getElementById('ps-closing-dirty');
  dirty.hidden = input.value === (input._savedValue ?? '');
  if (!dirty.hidden) document.getElementById('ps-closing-status').textContent = '';
});

document.getElementById('btn-ps-save-closing').addEventListener('click', async () => {
  const input = document.getElementById('ps-closing-time');
  const payload = { closingTime: input.value };
  const status = document.getElementById('ps-closing-status');
  status.textContent = '';
  spinner.hidden = false;
  try {
    const res = await fetch('/api/public-signage/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    input._savedValue = input.value;
    document.getElementById('ps-closing-dirty').hidden = true;
    status.textContent = `Saved ${new Date(data.publishedAt).toLocaleTimeString()}`;
  } catch (err) {
    alert(`Save failed: ${err.message}`);
  } finally {
    spinner.hidden = true;
  }
});

document.getElementById('btn-ps-save-lists').addEventListener('click', async () => {
  const payload = {
    titles: parsePsList('ps-list-titles'),
    locations: parsePsList('ps-list-locations'),
    categories: parsePsList('ps-list-categories'),
  };
  const status = document.getElementById('ps-lists-status');
  status.textContent = '';
  spinner.hidden = false;
  try {
    const res = await fetch('/api/public-signage/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    renderPsDatalists(data.config);
    fillPsConfigForm(data.config);
    status.textContent = `Saved ${new Date(data.publishedAt).toLocaleTimeString()}`;
  } catch (err) {
    alert(`Save failed: ${err.message}`);
  } finally {
    spinner.hidden = true;
  }
});

// --- Drag-and-drop reorder for special events ---
(function () {
  const list = document.getElementById('ps-special-list');
  if (!list) return;
  let draggingId = null;

  list.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.ps-special-card[draggable="true"]');
    if (!card) { e.preventDefault(); return; }
    draggingId = card.dataset.psSpecialId;
    card.classList.add('dragging');
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', draggingId); } catch {}
  });

  list.addEventListener('dragend', () => {
    list.querySelectorAll('.dragging, .drag-over-top, .drag-over-bottom')
      .forEach(el => el.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom'));
    draggingId = null;
  });

  list.addEventListener('dragover', (e) => {
    const target = e.target.closest('.ps-special-card');
    if (!target || !draggingId) return;
    if (target.dataset.psSpecialId === draggingId) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch {}
    const rect = target.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    target.classList.toggle('drag-over-top', !after);
    target.classList.toggle('drag-over-bottom', after);
  });

  list.addEventListener('dragleave', (e) => {
    const target = e.target.closest('.ps-special-card');
    if (!target) return;
    target.classList.remove('drag-over-top', 'drag-over-bottom');
  });

  list.addEventListener('drop', async (e) => {
    const target = e.target.closest('.ps-special-card');
    if (!target || !draggingId) return;
    e.preventDefault();
    const targetId = target.dataset.psSpecialId;
    if (targetId === draggingId) return;
    const rect = target.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;

    const srcIdx = psSpecialLocal.findIndex(ev => ev.id === draggingId);
    const tgtIdx = psSpecialLocal.findIndex(ev => ev.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    const [moved] = psSpecialLocal.splice(srcIdx, 1);
    let insertAt = psSpecialLocal.findIndex(ev => ev.id === targetId);
    if (after) insertAt += 1;
    psSpecialLocal.splice(insertAt, 0, moved);
    renderPsSpecialList();

    const ids = psSpecialLocal.filter(ev => !ev._new).map(ev => ev.id);
    try {
      const res = await fetch('/api/public-signage/special/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      alert(`Reorder failed: ${err.message}. Reloading from server.`);
      loadPublicSignage();
    }
  });
})();

// --- Initial tab activation (runs once all functions are defined) ---
activateTab(localStorage.getItem(TAB_KEY) || 'group');
