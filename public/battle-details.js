const EFFECT_LABELS = Object.freeze({
  fire: 'Fire',
  poison: 'Poison',
  ice: 'Ice',
  psychic: 'Psychic',
});

function requireElement(value) {
  if (!(value instanceof Element)) throw new Error('Battle Details requires a host element.');
  return value;
}

function requireProjection(value) {
  if (!value || typeof value !== 'object' || !value.receipt || !value.details) {
    throw new Error('Battle Details requires an automatic battle read-model projection.');
  }
  if (!Array.isArray(value.details.turns)) throw new Error('Battle Details requires projected turns.');
  return value;
}

function effectLabel(effect) {
  const key = String(effect || '').toLowerCase();
  return EFFECT_LABELS[key] || 'Effect';
}

function appendText(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function eventText(event) {
  if (!event || typeof event !== 'object') return 'Battle event';
  switch (event.kind) {
    case 'effect-damage':
      return `${effectLabel(event.effect)} · −${Number(event.damage) || 0} HP${event.stacks ? ` · ${event.stacks} stacks` : ''}`;
    case 'effect-expired':
      return `${effectLabel(event.effect)} expired`;
    case 'effect-applied':
      return `${effectLabel(event.effect)} applied · potency ${Number(event.appliedPotency) || 0}${event.resistanceLevel && event.resistanceLevel !== 'normal' ? ` · ${event.resistanceLevel}` : ''}`;
    case 'effect-blocked':
      return `${effectLabel(event.effect)} blocked · ${event.resistanceLevel || 'immune'}`;
    default:
      return String(event.label || event.summary || 'Battle event');
  }
}

function createTurnRow(turn) {
  const row = document.createElement('li');
  row.className = 'battle-details-turn';
  row.dataset.turnNumber = String(turn.turnNumber ?? '');

  const heading = document.createElement('div');
  heading.className = 'battle-details-turn-heading';
  appendText(heading, 'strong', '', `Turn ${turn.turnNumber}`);
  if (turn.consecutiveAction) appendText(heading, 'span', 'battle-details-speed-chip', '⚡ Speed extra action');
  if (turn.critical) appendText(heading, 'span', 'battle-details-crit-chip', '✦ Critical');
  row.append(heading);

  appendText(row, 'p', 'battle-details-turn-summary', turn.summary || 'Battle turn');

  if (Array.isArray(turn.events) && turn.events.length) {
    const events = document.createElement('ul');
    events.className = 'battle-details-events';
    for (const event of turn.events) appendText(events, 'li', `battle-details-event battle-details-event-${event.kind || 'generic'}`, eventText(event));
    row.append(events);
  }
  return row;
}

function createDialog(projection, trigger) {
  const dialog = document.createElement('dialog');
  dialog.className = 'battle-details-dialog';
  dialog.dataset.testid = 'battle-details-dialog';
  dialog.setAttribute('aria-labelledby', 'battle-details-title');

  const panel = document.createElement('div');
  panel.className = 'battle-details-panel';

  const header = document.createElement('header');
  header.className = 'battle-details-header';
  const heading = document.createElement('div');
  appendText(heading, 'span', 'battle-details-kicker', 'BATTLE DETAILS');
  const title = appendText(heading, 'h3', '', projection.receipt.headline || 'Automatic battle');
  title.id = 'battle-details-title';
  appendText(heading, 'p', 'battle-details-summary', `${projection.receipt.turnCount ?? projection.details.turns.length} turns · authoritative battle log`);
  header.append(heading);

  const close = appendText(header, 'button', 'battle-details-close', '×');
  close.type = 'button';
  close.dataset.testid = 'battle-details-close';
  close.setAttribute('aria-label', 'Close battle details');
  header.append(close);
  panel.append(header);

  const turns = document.createElement('ol');
  turns.className = 'battle-details-turns';
  turns.dataset.testid = 'battle-details-turns';
  for (const turn of projection.details.turns) turns.append(createTurnRow(turn));
  panel.append(turns);
  dialog.append(panel);

  const closeDialog = () => {
    if (dialog.open) dialog.close();
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus({ preventScroll: true });
  };
  close.addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDialog();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener('close', () => trigger.setAttribute('aria-expanded', 'false'));
  return dialog;
}

/**
 * Presentation-only Battle Details expansion for an Adventure Stream receipt.
 * Consumes the M3-07 read model and never calculates combat outcomes.
 */
export function attachBattleDetails(host, projection) {
  const entry = requireElement(host);
  const model = requireProjection(projection);
  if (entry.querySelector('[data-testid="battle-details-trigger"]')) return entry;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'battle-details-trigger';
  trigger.dataset.testid = 'battle-details-trigger';
  trigger.textContent = 'Battle details';
  trigger.setAttribute('aria-expanded', 'false');

  const dialog = createDialog(model, trigger);
  trigger.addEventListener('click', () => {
    trigger.setAttribute('aria-expanded', 'true');
    dialog.showModal();
  });

  entry.append(trigger, dialog);
  return entry;
}
