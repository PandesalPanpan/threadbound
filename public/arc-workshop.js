const statusNode = document.querySelector('#workshop-status');
const fileInput = document.querySelector('#manifest-file');
const editor = document.querySelector('#manifest-editor');
const validationNode = document.querySelector('#validation-result');
const draftsNode = document.querySelector('#manifest-list');
const previewNode = document.querySelector('#manifest-preview');
const validateButton = document.querySelector('#validate-manifest');
const saveButton = document.querySelector('#save-manifest');

let parsedManifest = null;

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || `Request failed (${response.status})`);
    error.body = body;
    throw error;
  }
  return body;
}

function pretty(value) { return JSON.stringify(value, null, 2); }

function setStatus(text) {
  statusNode.textContent = text;
}

function readEditor() {
  const text = editor.value.trim();
  if (!text) throw new Error('Choose a JSON file or paste an Arc Manifest first.');
  try {
    parsedManifest = JSON.parse(text);
    return parsedManifest;
  } catch (error) {
    throw new Error(`JSON parsing failed: ${error.message}`);
  }
}

function renderValidation(validation) {
  const errors = validation?.errors || [];
  const warnings = validation?.warnings || [];
  validationNode.innerHTML = `
    <h3>${validation?.valid ? '✓ Manifest is valid' : '✕ Manifest is invalid'}</h3>
    <p><strong>${errors.length}</strong> errors · <strong>${warnings.length}</strong> warnings</p>
    ${errors.length ? `<h4>Errors</h4><ul>${errors.map((entry) => `<li><code>${escapeHtml(entry.path || '$')}</code> — ${escapeHtml(entry.message)}</li>`).join('')}</ul>` : ''}
    ${warnings.length ? `<h4>Warnings</h4><ul>${warnings.map((entry) => `<li><code>${escapeHtml(entry.path || '$')}</code> — ${escapeHtml(entry.message)}</li>`).join('')}</ul>` : ''}
  `;
  saveButton.disabled = !validation?.valid;
}

function names(entries, field = 'name') {
  return (entries || []).map((entry) => entry?.[field]).filter(Boolean).map(escapeHtml).join(' · ');
}

function renderPreview(manifest) {
  if (!manifest?.arc) {
    previewNode.innerHTML = '<p class="muted">No manifest loaded.</p>';
    return;
  }
  const dungeonNames = names(manifest.dungeons);
  const enemyNames = names(manifest.enemies);
  const bossNames = names(manifest.bosses);
  const achievementNames = names(manifest.achievements, 'title');
  previewNode.innerHTML = `
    <h3>${escapeHtml(manifest.arc.title)}</h3>
    <p>${escapeHtml(manifest.arc.premise)}</p>
    <div class="preview-grid">
      <div><strong>${manifest.dungeons?.length || 0}</strong><span>Dungeons</span></div>
      <div><strong>${manifest.enemies?.length || 0}</strong><span>Enemies</span></div>
      <div><strong>${manifest.bosses?.length || 0}</strong><span>Bosses</span></div>
      <div><strong>${manifest.itemPools?.reduce((total, pool) => total + (pool.items?.length || 0), 0) || 0}</strong><span>Item templates</span></div>
      <div><strong>${manifest.lore?.length || 0}</strong><span>Lore pages</span></div>
      <div><strong>${manifest.achievements?.length || 0}</strong><span>Achievements</span></div>
    </div>
    ${dungeonNames ? `<p><strong>Dungeons:</strong> ${dungeonNames}</p>` : ''}
    ${enemyNames ? `<p><strong>Enemies:</strong> ${enemyNames}</p>` : ''}
    ${bossNames ? `<p><strong>Bosses:</strong> ${bossNames}</p>` : ''}
    ${achievementNames ? `<p><strong>Achievements:</strong> ${achievementNames}</p>` : ''}
  `;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

async function loadManifests() {
  const { manifests } = await request('/api/arc-workshop/manifests');
  if (!manifests.length) {
    draftsNode.innerHTML = '<p class="muted">No uploaded manifests yet.</p>';
    return;
  }
  draftsNode.innerHTML = manifests.map((entry) => `
    <article class="manifest-row" data-manifest-id="${escapeHtml(entry.id)}">
      <div><strong>${escapeHtml(entry.manifest.arc.title)}</strong> <span class="pill">${escapeHtml(entry.status)}</span></div>
      <small>${escapeHtml(entry.arcId)} · revision ${entry.revision} · ${escapeHtml(entry.source)}</small>
      <div class="actions">
        <button type="button" data-action="load" data-id="${escapeHtml(entry.id)}">Load</button>
        ${entry.status === 'draft' ? `<button type="button" data-action="publish" data-id="${escapeHtml(entry.id)}">Publish</button>` : ''}
      </div>
    </article>
  `).join('');
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (file.size > 512 * 1024) {
    setStatus('Manifest file is too large (512 KB maximum).');
    return;
  }
  const text = await file.text();
  editor.value = text;
  try {
    parsedManifest = JSON.parse(text);
    renderPreview(parsedManifest);
    setStatus(`Loaded ${file.name}. Validate it before saving.`);
  } catch (error) {
    parsedManifest = null;
    renderPreview(null);
    setStatus(`JSON parsing failed: ${error.message}`);
  }
});

editor.addEventListener('input', () => {
  saveButton.disabled = true;
  try {
    parsedManifest = JSON.parse(editor.value);
    renderPreview(parsedManifest);
  } catch {
    parsedManifest = null;
  }
});

validateButton.addEventListener('click', async () => {
  try {
    const manifest = readEditor();
    setStatus('Validating…');
    const { validation } = await request('/api/arc-workshop/validate', { method: 'POST', body: JSON.stringify({ manifest }) });
    renderValidation(validation);
    renderPreview(manifest);
    setStatus(validation.valid ? 'Validation passed. You may save this as a draft.' : 'Validation failed. Fix the reported errors before saving.');
  } catch (error) {
    renderValidation(error.body?.validation || { valid: false, errors: [{ path: '$', message: error.message }], warnings: [] });
    setStatus(error.message);
  }
});

saveButton.addEventListener('click', async () => {
  try {
    const manifest = readEditor();
    setStatus('Saving draft…');
    const { record } = await request('/api/arc-workshop/manifests', { method: 'POST', body: JSON.stringify({ manifest, source: 'manual-upload' }) });
    setStatus(`Saved ${record.manifest.arc.title} revision ${record.revision} as a draft.`);
    await loadManifests();
  } catch (error) {
    if (error.body?.validation) renderValidation(error.body.validation);
    setStatus(error.message);
  }
});

draftsNode.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  try {
    if (button.dataset.action === 'load') {
      const { record } = await request(`/api/arc-workshop/manifests/${encodeURIComponent(button.dataset.id)}`);
      editor.value = pretty(record.manifest);
      parsedManifest = record.manifest;
      renderPreview(record.manifest);
      renderValidation(record.validation);
      setStatus(`Loaded ${record.manifest.arc.title} revision ${record.revision}.`);
    }
    if (button.dataset.action === 'publish') {
      setStatus('Revalidating and publishing…');
      const { record } = await request(`/api/arc-workshop/manifests/${encodeURIComponent(button.dataset.id)}/publish`, { method: 'POST', body: '{}' });
      setStatus(`Published ${record.manifest.arc.title} revision ${record.revision}. Its dungeons and Codex entries are now live.`);
      await loadManifests();
    }
  } catch (error) {
    if (error.body?.validation) renderValidation(error.body.validation);
    setStatus(error.message);
  }
});

document.querySelector('#download-context').addEventListener('click', () => window.location.assign('/api/arc-workshop/context?download=1'));
document.querySelector('#download-schema').addEventListener('click', () => window.location.assign('/api/arc-workshop/schema?download=1'));

loadManifests().then(() => setStatus('Arc Workshop ready. Generate anywhere, validate here.')).catch((error) => setStatus(error.message));
