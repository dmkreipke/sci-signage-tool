let parsedRows = [];
let managedRows = [];

const states = {
  upload: document.getElementById('state-upload'),
  preview: document.getElementById('state-preview'),
  confirm: document.getElementById('state-confirm'),
  published: document.getElementById('state-published'),
  manage: document.getElementById('state-manage'),
};

function showState(name) {
  Object.entries(states).forEach(([key, el]) => el.classList.toggle('active', key === name));
}

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
    renderPreview(data.rows, data.warnings);
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

  body.innerHTML = rows.map((row, i) => `
    <tr class="${warnSet.has(i) ? 'warn-row' : ''}" data-index="${i}">
      <td contenteditable="true" data-field="startTime">${esc(row.startTime)}</td>
      <td contenteditable="true" data-field="programName">${esc(row.programName)}</td>
      <td contenteditable="true" data-field="groupName">${esc(row.groupName)}</td>
      <td contenteditable="true" data-field="location" class="${!row.location ? 'warn-cell' : ''}">${esc(row.location)}</td>
    </tr>
  `).join('');

  body.addEventListener('input', e => {
    const td = e.target.closest('td[data-field]');
    if (!td) return;
    const tr = td.closest('tr[data-index]');
    const index = parseInt(tr.dataset.index, 10);
    parsedRows[index][td.dataset.field] = td.textContent.trim();
  });
}

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

// --- Manage state ---
document.getElementById('btn-manage-header').addEventListener('click', () => loadManage());
document.getElementById('btn-manage-upload').addEventListener('click', () => showState('upload'));

async function loadManage() {
  spinner.hidden = false;
  try {
    const res = await fetch('/api/schedule');
    const data = await res.json();
    managedRows = data.rows || [];

    const empty = document.getElementById('manage-empty');
    const tableWrap = document.querySelector('#state-manage .table-scroll');
    if (managedRows.length === 0) {
      empty.hidden = false;
      tableWrap.style.display = 'none';
    } else {
      empty.hidden = true;
      tableWrap.style.display = '';
      document.getElementById('manage-row-count').textContent = `${managedRows.length} rows`;
      document.getElementById('manage-published-at').textContent =
        data.publishedAt ? `Published ${new Date(data.publishedAt).toLocaleString()}` : '';
      renderManageTable();
    }
    showState('manage');
  } catch (err) {
    alert(`Failed to load schedule: ${err.message}`);
  } finally {
    spinner.hidden = true;
  }
}

function renderManageTable() {
  const body = document.getElementById('manage-body');
  body.innerHTML = managedRows.map((row, i) => `
    <tr data-manage-index="${i}">
      <td contenteditable="true" data-field="startTime">${esc(row.startTime)}</td>
      <td contenteditable="true" data-field="programName">${esc(row.programName)}</td>
      <td contenteditable="true" data-field="groupName">${esc(row.groupName)}</td>
      <td contenteditable="true" data-field="location" class="${!row.location ? 'warn-cell' : ''}">${esc(row.location)}</td>
    </tr>
  `).join('');

  body.addEventListener('input', e => {
    const td = e.target.closest('td[data-field]');
    if (!td) return;
    const tr = td.closest('tr[data-manage-index]');
    const index = parseInt(tr.dataset.manageIndex, 10);
    managedRows[index][td.dataset.field] = td.textContent.trim();
  });
}

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
    document.getElementById('manage-published-at').textContent =
      `Saved at ${new Date(data.publishedAt).toLocaleTimeString()}`;
    alert(`Saved. ${data.count} rows are now live.`);
  } catch (err) {
    alert(`Save failed: ${err.message}`);
  } finally {
    spinner.hidden = true;
  }
});

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
