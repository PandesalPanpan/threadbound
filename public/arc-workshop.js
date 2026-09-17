const shell = document.querySelector('.workshop-shell');
const statusNode = document.querySelector('#workshop-status');
const fileInput = document.querySelector('#manifest-file');
const editor = document.querySelector('#manifest-editor');
const validationNode = document.querySelector('#validation-result');
const draftsNode = document.querySelector('#manifest-list');
const previewNode = document.querySelector('#manifest-preview');
const validateButton = document.querySelector('#validate-manifest');
const saveButton = document.querySelector('#save-manifest');
const saveSlot = document.querySelector('#save-manifest-slot');
const editorActions = document.querySelector('.workshop-editor-actions');
const reviewActions = document.querySelector('#review-actions');
const editorView = document.querySelector('#workshop-editor-view');
const editorImpactView = document.querySelector('#editor-impact-view');
const reviewView = document.querySelector('#workshop-review-view');
const editorPreviewSlot = document.querySelector('#editor-preview-slot');
const reviewPreviewSlot = document.querySelector('#review-preview-slot');
const pageEyebrow = document.querySelector('#workshop-page-eyebrow');
const pageTitle = document.querySelector('#workshop-page-title');
const pageSubtitle = document.querySelector('#workshop-page-subtitle');
const recordChip = document.querySelector('#workshop-record-chip');
const localChip = document.querySelector('#workshop-local-chip');
const notice = document.querySelector('.workshop-notice');
const resourceActions = document.querySelector('.workshop-resource-actions');
const reviewPublishActions = document.querySelector('#review-publish-actions');
const reviewPublishButton = document.querySelector('#review-publish');
const backToEditorButton = document.querySelector('#back-to-editor');

let parsedManifest = null;
let currentRecordId = null;
let currentRecord = null;

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

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function setStatus(text) {
  statusNode.textContent = text;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function manifestVersionLabel(manifest = parsedManifest) {
  if (manifest?.manifestVersion === 2) return 'v2 · world package';
  if (manifest?.manifestVersion === 1) return 'v1 · legacy-compatible package';
  return manifest?.manifestVersion ? `v${String(manifest.manifestVersion)}` : 'unknown version';
}

function setView(view) {
  const review = view === 'review';
  shell.dataset.workshopView = view;
  editorView.hidden = review;
  editorImpactView.hidden = review;
  reviewView.hidden = !review;
  if (review) {
    reviewPreviewSlot.append(previewNode);
    reviewActions.append(saveSlot);
  } else {
    editorPreviewSlot.append(previewNode);
    editorActions.append(saveSlot);
  }
  updateReviewActions();
}

function updateReviewActions() {
  const hasDraftRecord = Boolean(currentRecordId && currentRecord?.status === 'draft');
  const hasPersistedRecord = Boolean(currentRecordId);
  reviewPublishActions.hidden = !hasDraftRecord;
  saveSlot.hidden = hasPersistedRecord;
}

function setPageHeader(manifest = null, review = Boolean(manifest), record = currentRecord) {
  pageEyebrow.textContent = review ? 'DRAFT REVIEW' : 'WORLD AUTHORING';
  pageTitle.textContent = manifest?.arc?.title || 'Arc Workshop';
  pageSubtitle.textContent = review
    ? 'Review impact, verify safety, then publish into the local authoritative world.'
    : 'Bring a v2 Arc Manifest from any AI, local model, or human-written JSON file.';
  recordChip.hidden = !review;
  recordChip.textContent = review
    ? record?.revision ? `${String(record.status || 'draft').toUpperCase()} · REVISION ${record.revision}` : 'VALIDATED · UNSAVED'
    : '';
  localChip.textContent = review
    ? manifestVersionLabel(manifest)
    : window.matchMedia?.('(min-width: 43rem)').matches ? 'LOCAL DEVELOPMENT' : 'LOCAL DEV ONLY';
  localChip.dataset.variant = review ? 'version' : 'local';
  notice.hidden = review;
  resourceActions.hidden = review;
}

function readEditor() {
  const text = editor.value.trim();
  if (!text) throw new Error('Choose a JSON file or paste an Arc Manifest first.');
  try {
    parsedManifest = JSON.parse(text);
    return parsedManifest;
  } catch (error) {
    parsedManifest = null;
    throw new Error(`JSON parsing failed: ${error.message}`);
  }
}

function names(entries, field = 'name') {
  return (entries || []).map((entry) => entry?.[field]).filter(Boolean).join(' · ');
}

function itemTemplates(manifest) {
  return (manifest?.itemPools || []).flatMap((pool) => pool?.items || []);
}

function totalItems(manifest) {
  return itemTemplates(manifest).length;
}

function recipeCount(manifest) {
  return (manifest.craftingRecipes?.length || 0) + (manifest.cookingRecipes?.length || 0);
}

function previewStat(value, label) {
  return `<div class="workshop-stat"><strong>${escapeHtml(value ?? 0)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function previewNames(label, entries, field = 'name') {
  const value = names(entries, field);
  return value ? `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>` : '';
}

function previewFamily(label, entries, field = 'name') {
  const list = entries || [];
  const value = names(list, field);
  return `<p><strong>${escapeHtml(label)} (${list.length}):</strong>${value ? ` ${escapeHtml(value)}` : ' — none'}</p>`;
}

function renderVNextPreview(manifest) {
  if (manifest.manifestVersion !== 2) return '';
  return `
    <section class="workshop-world-package" data-testid="vnext-world-preview">
      <p class="workshop-package-label">World package</p>
      <div class="workshop-package-counts sr-only">
        ${previewStat(manifest.areas?.length, 'Areas')}
        ${previewStat(manifest.towns?.length, 'Towns')}
        ${previewStat(manifest.npcs?.length, 'NPCs')}
        ${previewStat(manifest.quests?.length, 'Quests')}
        ${previewStat(manifest.shops?.length, 'Shops')}
        ${previewStat(recipeCount(manifest), 'Recipes')}
        ${previewStat(manifest.progressionChallenges?.length, 'Progression challenges')}
      </div>
      <div class="workshop-package-summary">
        ${previewNames('Areas', manifest.areas)}
        ${previewNames('Towns', manifest.towns)}
        ${previewNames('Progression', manifest.progressionChallenges, 'id')}
      </div>
      <details class="workshop-package-details">
        <summary>View all v2 content</summary>
        <div class="workshop-package-copy">
          ${previewFamily('Areas', manifest.areas)}
          ${previewFamily('Towns', manifest.towns)}
          ${previewFamily('NPCs', manifest.npcs)}
          ${previewFamily('Quests', manifest.quests, 'title')}
          ${previewFamily('Shops', manifest.shops)}
          ${previewFamily('Shop stocks', manifest.shopStocks, 'id')}
          ${previewFamily('Crafting recipes', manifest.craftingRecipes)}
          ${previewFamily('Cooking recipes', manifest.cookingRecipes)}
          ${previewFamily('Progression challenges', manifest.progressionChallenges, 'id')}
          ${previewFamily('Dungeons', manifest.dungeons)}
          ${previewFamily('Enemies', manifest.enemies)}
          ${previewFamily('Bosses', manifest.bosses)}
          ${previewFamily('Item pools', manifest.itemPools, 'id')}
          ${previewFamily('Equipment templates', itemTemplates(manifest), 'namePattern')}
          ${previewFamily('Lore', manifest.lore, 'title')}
          ${previewFamily('Achievements', manifest.achievements, 'title')}
          ${previewFamily('Historical consequences', manifest.historicalConsequences, 'title')}
          <p class="muted">v2 world references, recipes, progression challenges, and combat resistances are revalidated server-side before a draft can be saved or published.</p>
        </div>
      </details>
    </section>
  `;
}

function statsMarkup(stats, className) {
  return `<div class="workshop-stat-grid ${className}">${stats.map(([value, label]) => previewStat(value, label)).join('')}</div>`;
}

function renderPreview(manifest) {
  if (!manifest?.arc) {
    delete previewNode.dataset.manifestVersion;
    previewNode.innerHTML = '<p class="muted">No manifest loaded.</p>';
    return;
  }

  const v2 = manifest.manifestVersion === 2;
  previewNode.dataset.manifestVersion = v2 ? '2' : '1';
  const questCount = (manifest.storyQuests?.length || 0) + (manifest.quests?.length || 0);
  const editorCombatStats = [
    [manifest.dungeons?.length, 'Dungeons'],
    [manifest.enemies?.length, 'Enemies'],
    [manifest.bosses?.length, 'Bosses'],
    [totalItems(manifest), 'Items'],
    [questCount, 'Quests'],
  ];
  const editorWorldStats = [
    [manifest.areas?.length, 'Areas'],
    [manifest.towns?.length, 'Towns'],
    [manifest.npcs?.length, 'NPCs'],
    [manifest.shops?.length, 'Shops'],
    [recipeCount(manifest), 'Recipes'],
  ];
  const reviewWorldStats = [
    [manifest.areas?.length, 'Areas'],
    [manifest.towns?.length, 'Towns'],
    [manifest.npcs?.length, 'NPCs'],
    [questCount, 'Quests'],
    [manifest.shops?.length, 'Shops'],
    [recipeCount(manifest), 'Recipes'],
    [manifest.progressionChallenges?.length, 'Progression'],
  ];
  const reviewContentStats = [
    [manifest.dungeons?.length, 'Dungeons'],
    [manifest.enemies?.length, 'Enemies'],
    [manifest.bosses?.length, 'Bosses'],
    [totalItems(manifest), 'Items'],
    [manifest.lore?.length, 'Lore'],
    [manifest.achievements?.length, 'Achievements'],
  ];

  previewNode.innerHTML = `
    <div class="workshop-preview-heading">
      <span class="workshop-version-chip" data-testid="manifest-version">${escapeHtml(manifestVersionLabel(manifest))}</span>
      <h3>${escapeHtml(manifest.arc.title)}</h3>
      <p>${escapeHtml(manifest.arc.premise)}</p>
    </div>
    <div class="workshop-preview-groups">
      <div class="workshop-stat-group workshop-editor-stats">
        ${statsMarkup(editorCombatStats, 'workshop-editor-combat-stats')}
        ${v2 ? statsMarkup(editorWorldStats, 'workshop-editor-world-stats') : ''}
      </div>
      <div class="workshop-stat-group workshop-review-stats">
        ${v2 ? '<p class="workshop-stat-group-label">World package</p>' : ''}
        ${v2 ? statsMarkup(reviewWorldStats, 'workshop-review-world-stats') : ''}
        ${v2 ? '<p class="workshop-stat-group-label">Combat + content</p>' : ''}
        ${statsMarkup(reviewContentStats, 'workshop-review-content-stats')}
      </div>
    </div>
    ${renderVNextPreview(manifest)}
    <details class="workshop-package-details workshop-legacy-details">
      <summary>View manifest content</summary>
      <div class="workshop-package-copy">
        ${previewFamily('Dungeons', manifest.dungeons)}
        ${previewFamily('Enemies', manifest.enemies)}
        ${previewFamily('Bosses', manifest.bosses)}
        ${previewFamily('Story Quests', manifest.storyQuests, 'title')}
        ${previewFamily('Quests', manifest.quests, 'title')}
        ${previewFamily('Item pools', manifest.itemPools, 'id')}
        ${previewFamily('Equipment templates', itemTemplates(manifest), 'namePattern')}
        ${previewFamily('Achievements', manifest.achievements, 'title')}
        ${previewFamily('Lore', manifest.lore, 'title')}
        ${previewFamily('Historical consequences', manifest.historicalConsequences, 'title')}
      </div>
    </details>
  `;
}

function issueDetails(label, entries, kind) {
  if (!entries.length) return '';
  return `<details class="workshop-issue-details workshop-issue-${kind}"><summary>${escapeHtml(label)} · ${entries.length}</summary><ul>${entries.map((entry) => `<li><code>${escapeHtml(entry.path || '$')}</code> — ${escapeHtml(entry.message)}</li>`).join('')}</ul></details>`;
}

function renderValidation(validation, manifest = parsedManifest) {
  const errors = validation?.errors || [];
  const warnings = validation?.warnings || [];
  const valid = Boolean(validation?.valid);
  const firstWarning = warnings[0]?.message;
  const firstError = errors[0]?.message;
  const warningText = firstWarning ? firstWarning.replace(/^warning:\s*/i, '') : '';

  validationNode.className = `workshop-validation-card ${valid ? 'is-valid' : 'is-invalid'}`;
  validationNode.innerHTML = `
    <h2>${valid ? '✓ Manifest is valid' : '✕ Manifest needs changes'}</h2>
    <p class="workshop-validation-counts"><strong>${errors.length}</strong> errors · <strong>${warnings.length}</strong> warning${warnings.length === 1 ? '' : 's'}</p>
    ${firstError ? `<p class="workshop-validation-error">${escapeHtml(firstError)}</p>` : ''}
    ${warningText ? `<p class="workshop-validation-warning">Warning: ${escapeHtml(warningText)}</p>` : ''}
    ${issueDetails('Errors', errors, 'error')}
    ${issueDetails('Warnings', warnings, 'warning')}
    <span class="sr-only">${escapeHtml(manifestVersionLabel(manifest))}</span>
  `;
  saveButton.disabled = !valid;
}

function renderDrafts(manifests) {
  if (!manifests.length) {
    draftsNode.innerHTML = '<p class="muted">No uploaded manifests yet.</p>';
    return;
  }
  draftsNode.innerHTML = manifests.map((entry) => {
    const title = entry.manifest?.arc?.title || entry.arcId || 'Untitled manifest';
    const status = String(entry.status || 'draft').toLowerCase();
    const version = manifestVersionLabel(entry.manifest);
    return `
      <article class="manifest-row workshop-draft-card" data-manifest-id="${escapeHtml(entry.id)}">
        <div class="workshop-draft-heading"><strong>${escapeHtml(title)}</strong><span class="workshop-status-chip" data-status="${escapeHtml(status)}">${escapeHtml(status.toUpperCase())}<span class="sr-only"> ${escapeHtml(status)}</span></span></div>
        <small>arc: ${escapeHtml(entry.arcId)} · revision ${escapeHtml(entry.revision)} · ${escapeHtml(entry.source)}</small>
        <div class="workshop-draft-actions">
          <button type="button" data-action="load" data-id="${escapeHtml(entry.id)}">Load</button>
          ${status === 'draft' ? `<button type="button" class="primary-action" data-action="publish" data-id="${escapeHtml(entry.id)}">Publish</button>` : ''}
        </div>
        <span class="sr-only">${escapeHtml(version)}</span>
      </article>
    `;
  }).join('');
}

async function loadManifests() {
  const { manifests } = await request('/api/arc-workshop/manifests');
  renderDrafts(manifests);
}

function showReview(manifest, validation) {
  setPageHeader(manifest, true);
  renderPreview(manifest);
  renderValidation(validation, manifest);
  setView('review');
}

function showEditor() {
  currentRecordId = null;
  currentRecord = null;
  setPageHeader(null);
  setView('editor');
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  showEditor();
  saveButton.disabled = true;
  if (file.size > 512 * 1024) {
    parsedManifest = null;
    editor.value = '';
    renderPreview(null);
    setStatus('Manifest file is too large (512 KB maximum).');
    return;
  }
  const text = await file.text();
  editor.value = text;
  try {
    parsedManifest = JSON.parse(text);
    renderPreview(parsedManifest);
    setPageHeader(null);
    setStatus(`Loaded ${file.name} (${manifestVersionLabel(parsedManifest)}). Validate it before saving.`);
  } catch (error) {
    parsedManifest = null;
    renderPreview(null);
    setStatus(`JSON parsing failed: ${error.message}`);
  }
});

editor.addEventListener('input', () => {
  showEditor();
  saveButton.disabled = true;
  try {
    parsedManifest = editor.value.trim() ? JSON.parse(editor.value) : null;
    renderPreview(parsedManifest);
    setStatus(parsedManifest ? 'JSON parsed. Validate it before saving.' : 'Paste an Arc Manifest JSON document to preview it.');
  } catch {
    parsedManifest = null;
    renderPreview(null);
    setStatus('JSON is incomplete. Finish editing, then validate.');
  }
});

validateButton.addEventListener('click', async () => {
  try {
    const manifest = readEditor();
    setStatus('Validating…');
    const { validation } = await request('/api/arc-workshop/validate', { method: 'POST', body: JSON.stringify({ manifest }) });
    showReview(manifest, validation);
    setStatus(validation.valid ? `Validation passed for ${manifestVersionLabel(manifest)}. You may save this as a draft.` : 'Validation failed. Fix the reported errors before saving.');
  } catch (error) {
    const validation = error.body?.validation || { valid: false, errors: [{ path: '$', message: error.message }], warnings: [] };
    showReview(parsedManifest, validation);
    setStatus(error.message);
  }
});

saveButton.addEventListener('click', async () => {
  try {
    const manifest = readEditor();
    setStatus('Saving draft…');
    const { record } = await request('/api/arc-workshop/manifests', { method: 'POST', body: JSON.stringify({ manifest, source: 'manual-upload' }) });
    saveButton.disabled = true;
    currentRecordId = record.id;
    currentRecord = record;
    setPageHeader(record.manifest, true, record);
    updateReviewActions();
    await loadManifests();
    setStatus(`Saved ${record.manifest.arc.title} revision ${record.revision} as a draft.`);
  } catch (error) {
    if (error.body?.validation) showReview(parsedManifest, error.body.validation);
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
      currentRecordId = record.id;
      currentRecord = record;
      showReview(record.manifest, record.validation);
      setStatus(`Loaded ${record.manifest.arc.title} revision ${record.revision}.`);
    }
    if (button.dataset.action === 'publish') {
      setStatus('Revalidating and publishing…');
      const { record } = await request(`/api/arc-workshop/manifests/${encodeURIComponent(button.dataset.id)}/publish`, { method: 'POST', body: '{}' });
      parsedManifest = record.manifest;
      currentRecordId = record.id;
      currentRecord = record;
      showReview(record.manifest, record.validation);
      await loadManifests();
      setStatus(`Published ${record.manifest.arc.title} revision ${record.revision}. Its validated Arc content is now live.`);
    }
  } catch (error) {
    if (error.body?.validation) showReview(parsedManifest, error.body.validation);
    setStatus(error.message);
  }
});

reviewPublishButton.addEventListener('click', async () => {
  if (!currentRecordId) return;
  try {
    setStatus('Revalidating and publishing…');
    const { record } = await request(`/api/arc-workshop/manifests/${encodeURIComponent(currentRecordId)}/publish`, { method: 'POST', body: '{}' });
    parsedManifest = record.manifest;
    currentRecord = record;
    showReview(record.manifest, record.validation);
    await loadManifests();
    setStatus(`Published ${record.manifest.arc.title} revision ${record.revision}. Its validated Arc content is now live.`);
  } catch (error) {
    if (error.body?.validation) showReview(parsedManifest, error.body.validation);
    setStatus(error.message);
  }
});

backToEditorButton.addEventListener('click', () => {
  showEditor();
  setStatus('Back in the editor. Validate again after making changes.');
});

document.querySelector('#download-context').addEventListener('click', () => window.location.assign('/api/arc-workshop/context?download=1'));
document.querySelector('#download-schema').addEventListener('click', () => window.location.assign('/api/arc-workshop/schema?download=1'));

showEditor();
loadManifests()
  .then(() => setStatus('Arc Workshop ready. Generate anywhere, validate here.'))
  .catch((error) => setStatus(error.message));
