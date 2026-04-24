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
    sw.title = bright ? 'Switch to dark mode' : 'Switch to bright mode';
  }
}
applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
document.getElementById('theme-switch').addEventListener('click', () => {
  const next = document.body.classList.contains('bright-mode') ? 'dark' : 'bright';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

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
      <td contenteditable="true" data-field="programName">${esc(row.programName)}</td>
      <td contenteditable="true" data-field="groupName">${esc(row.groupName)}</td>
      <td contenteditable="true" data-field="location" class="${!row.location ? 'warn-cell' : ''}">${esc(row.location)}</td>
      <td><button class="btn-row-remove" data-remove-index="${i}" title="Remove this row">×</button></td>
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
  const td = e.target.closest('td[data-field]');
  if (!td) return;
  const tr = td.closest('tr[data-index]');
  const index = parseInt(tr.dataset.index, 10);
  parsedRows[index][td.dataset.field] = td.textContent.trim();
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
      body: JSON.stringify({ rows: parsedRows }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Publish failed');
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
  if (!confirm('Wipe the published schedule? All displays will go blank until a new CSV is uploaded.')) return;
  spinner.hidden = false;
  try {
    const res = await fetch('/api/schedule', { method: 'DELETE' });
    if (!res.ok) throw new Error('Wipe failed');
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

document.getElementById('btn-manage-add-row').addEventListener('click', () => {
  managedRows.push(blankRow());
  renderManageTable();
  // scroll new row into view
  const body = document.getElementById('manage-body');
  body.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

async function loadManage() {
  spinner.hidden = false;
  try {
    const res = await fetch('/api/schedule');
    const data = await res.json();
    managedRows = data.rows || [];
    sortState = { column: null, ascending: true };
    document.getElementById('manage-published-at').textContent =
      data.publishedAt ? `Published ${new Date(data.publishedAt).toLocaleString()}` : '';
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
      <td contenteditable="true" data-field="programName">${esc(row.programName)}</td>
      <td contenteditable="true" data-field="groupName">${esc(row.groupName)}</td>
      <td contenteditable="true" data-field="location" class="${!row.location ? 'warn-cell' : ''}">${esc(row.location)}</td>
      <td><button class="btn-row-remove" data-remove-index="${originalIndex}" title="Remove this row">×</button></td>
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
  const td = e.target.closest('td[data-field]');
  if (!td) return;
  const tr = td.closest('tr[data-manage-index]');
  const index = parseInt(tr.dataset.manageIndex, 10);
  managedRows[index][td.dataset.field] = td.textContent.trim();
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
      body: JSON.stringify({ rows: managedRows }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed');
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
    const [todayRes, manualRes, configRes] = await Promise.all([
      fetch('/api/public-signage/today'),
      fetch('/api/public-signage/manual'),
      fetch('/api/public-signage/config'),
    ]);
    const today = await todayRes.json();
    const manual = await manualRes.json();
    const config = await configRes.json();

    psTodayISO = today.today;
    psManualLocal = (manual.events || []).map(e => ({ ...e, _dirty: false, _new: false }));

    renderPsTodayTable(today);
    renderPsScrapeStatus(today.scrape, today.today);
    renderPsDatalists(config);
    renderPsManualList();
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
    body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#8b949e;padding:20px">No events scheduled for today.</td></tr>`;
    return;
  }
  body.innerHTML = events.map(ev => {
    const badge = ev.source === 'manual'
      ? `<span class="ps-badge ps-badge-manual">Manual</span>`
      : `<span class="ps-badge ps-badge-website">Website</span>`;
    return `
      <tr>
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
            ? `<button class="btn-secondary" data-ps-cancel="${idx}">Cancel</button><button class="btn-primary" data-ps-save="${idx}">Save event</button>`
            : `<button class="btn-danger" data-ps-delete="${idx}">Delete</button>${ev._dirty ? `<button class="btn-primary" data-ps-save="${idx}">Save changes</button>` : ''}`
          }
        </div>
      </div>
    `;
  }).join('');
}

function fillPsConfigForm(config) {
  document.getElementById('ps-ticker').value = config.tickerText || '';
  document.getElementById('ps-qr-url').value = config.qrUrl || '';
  document.getElementById('ps-qr-label').value = config.qrLabel || '';
  document.getElementById('ps-closing-time').value = config.closingTime || '';
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

document.getElementById('btn-ps-save-config').addEventListener('click', async () => {
  const payload = {
    tickerText: document.getElementById('ps-ticker').value,
    qrUrl: document.getElementById('ps-qr-url').value,
    qrLabel: document.getElementById('ps-qr-label').value,
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
    status.textContent = `Saved ${new Date(data.publishedAt).toLocaleTimeString()}`;
  } catch (err) {
    alert(`Save failed: ${err.message}`);
  } finally {
    spinner.hidden = true;
  }
});

document.getElementById('btn-ps-save-closing').addEventListener('click', async () => {
  const payload = { closingTime: document.getElementById('ps-closing-time').value };
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

// --- Initial tab activation (runs once all functions are defined) ---
activateTab(localStorage.getItem(TAB_KEY) || 'group');
