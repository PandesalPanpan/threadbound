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

function manifestVersionLabel(manifest = parsedManifest) {
  if (manifest?.manifestVersion === 2) return 'v2 · world package';
  if (manifest?.manifestVersion === 1) return 'v1 · legacy-compatible package';
  return manifest?.manifestVersion ? `v${escapeHtml(manifest.manifestVersion)}` : 'unknown version';
}

function renderValidation(validation, manifest = parsedManifest) {
  const errors = validation?.errors || [];
  const warnings = validation?.warnings || [];
  validationNode.innerHTML = `
    <h3>${validation?.valid ? '✓ Manifest is valid' : '✕ Manifest is invalid'}</h3>
    <p><span class="pill">${manifestVersionLabel(manifest)}</span> <strong>${errors.length}</strong> errors · <strong>${warnings.length}</strong> warnings</p>
    ${errors.length ? `<h4>Errors</h4><ul>${errors.map((entry) => `<li><code>${escapeHtml(entry.path || '$')}</code> — ${escapeHtml(entry.message)}</li>`).join('')}</ul>` : ''}
    ${warnings.length ? `<h4>Warnings</h4><ul>${warnings.map((entry) => `<li><code>${escapeHtml(entry.path || '$')}</code> — ${escapeHtml(entry.message)}</li>`).join('')}</ul>` : ''}
  `;
  saveButton.disabled = !validation?.valid;
}

function names(entries, field = 'name') {
  return (entries || []).map((entry) => entry?.[field]).filter(Boolean).map(escapeHtml).join(' · ');
}

function totalItems(manifest) {
  return manifest.itemPools?.reduce((total, pool) => total + (pool.items?.length || 0), 0) || 0;
}

function previewStat(value, label) {
  return `<div><strong>${value || 0}</strong><span>${escapeHtml(label)}</span></div>`;
}

function previewNames(label, entries, field = 'name') {
  const value = names(entries, field);
  return value ? `<p><strong>${escapeHtml(label)}:</strong> ${value}</p>` : '';
}

function renderVNextPreview(manifest) {
  if (manifest.manifestVersion !== 2) return '';
  const recipeCount = (manifest.craftingRecipes?.length || 0) + (manifest.cookingRecipes?.length || 0);
  return `
    <section data-testid="vnext-world-preview">
      <h4>World package</h4>
      <div class="preview-grid">
        ${previewStat(manifest.areas?.length, 'Areas')}
        ${previewStat(manifest.towns?.length, 'Towns')}
        ${previewStat(manifest.npcs?.length, 'NPCs')}
        ${previewStat(manifest.quests?.length, 'Quests')}
        ${previewStat(manifest.shops?.length, 'Shops')}
        ${previewStat(recipeCount, 'Recipes')}
        ${previewStat(manifest.progressionChallenges?.length, 'Progression challenges')}
      </div>
      ${previewNames('Areas', manifest.areas)}
      ${previewNames('Towns', manifest.towns)}
      ${previewNames('NPCs', manifest.npcs)}
      ${previewNames('Quests', manifest.quests, 'title')}
      ${previewNames('Shops', manifest.shops)}
      ${previewNames('Crafting', manifest.craftingRecipes)}
      ${previewNames('Cooking', manifest.cookingRecipes)}
      ${previewNames('Progression', manifest.progressionChallenges, 'id')}
      <p class="muted">v2 world references, recipes, progression challenges, and combat resistances are revalidated server-side before a draft can be saved or published.</p>
    </section>
  `;
}

function renderPreview(manifest) {
  if (!manifest?.arc) {
    previewNode.innerHTML = '<p class="muted">No manifest loaded.</p>';
    return;
  }
  previewNode.innerHTML = `
    <p><span class="pill" data-testid="manifest-version">${manifestVersionLabel(manifest)}</span></p>
    <h3>${escapeHtml(manifest.arc.title)}</h3>
    <p>${escapeHtml(manifest.arc.premise)}</p>
    <div class="preview-grid">
      ${previewStat(manifest.dungeons?.length, 'Dungeons')}
      ${previewStat(manifest.enemies?.length, 'Enemies')}
      ${previewStat(manifest.bosses?.length, 'Bosses')}
      ${previewStat(totalItems(manifest), 'Item templates')}
      ${previewStat((manifest.storyQuests?.length || 0) + (manifest.quests?.length || 0), 'Quests')}
      ${previewStat(manifest.lore?.length, 'Lore pages')}
      ${previewStat(manifest.achievements?.length, 'Achievements')}
    </div>
    ${previewNames('Dungeons', manifest.dungeons)}
    ${previewNames('Enemies', manifest.enemies)}
    ${previewNames('Bosses', manifest.bosses)}
    ${previewNames('Story Quests', manifest.storyQuests, 'title')}
    ${previewNames('Achievements', manifest.achievements, 'title')}
    ${renderVNextPreview(manifest)}
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
      <div><strong>${escapeHtml(entry.manifest.arc.title)}</strong> <span class="pill">${escapeHtml(entry.status)}</span> <span class="pill">${manifestVersionLabel(entry.manifest)}</span></div>
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
  saveButton.disabled = true;
  try {
    parsedManifest = JSON.parse(text);
    renderPreview(parsedManifest);
    setStatus(`Loaded ${file.name} (${manifestVersionLabel(parsedManifest)}). Validate it before saving.`);
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
    renderPreview(null);
  }
});

validateButton.addEventListener('click', async () => {
  try {
    const manifest = readEditor();
    setStatus('Validating…');
    const { validation } = await request('/api/arc-workshop/validate', { method: 'POST', body: JSON.stringify({ manifest }) });
    renderValidation(validation, manifest);
    renderPreview(manifest);
    setStatus(validation.valid ? `Validation passed for ${manifestVersionLabel(manifest)}. You may save this as a draft.` : 'Validation failed. Fix the reported errors before saving.');
  } catch (error) {
    renderValidation(error.body?.validation || { valid: false, errors: [{ path: '$', message: error.message }], warnings: [] }, parsedManifest);
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
    if (error.body?.validation) renderValidation(error.body.validation, parsedManifest);
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
      renderValidation(record.validation, record.manifest);
      setStatus(`Loaded ${record.manifest.arc.title} revision ${record.revision}.`);
    }
    if (button.dataset.action === 'publish') {
      setStatus('Revalidating and publishing…');
      const { record } = await request(`/api/arc-workshop/manifests/${encodeURIComponent(button.dataset.id)}/publish`, { method: 'POST', body: '{}' });
      setStatus(`Published ${record.manifest.arc.title} revision ${record.revision}. Its validated Arc content is now live.`);
      await loadManifests();
    }
  } catch (error) {
    if (error.body?.validation) renderValidation(error.body.validation, parsedManifest);
    setStatus(error.message);
  }
});

document.querySelector('#download-context').addEventListener('click', () => window.location.assign('/api/arc-workshop/context?download=1'));
document.querySelector('#download-schema').addEventListener('click', () => window.location.assign('/api/arc-workshop/schema?download=1'));

loadManifests().then(() => setStatus('Arc Workshop ready. Generate anywhere, validate here.')).catch((error) => setStatus(error.message));
