export const HUNT_COOLDOWN_SECONDS = 15;

function toDate(value, label) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date.`);
  return date;
}

export function nextHuntReadyAt({ now = new Date(), cooldownSeconds = HUNT_COOLDOWN_SECONDS } = {}) {
  const current = toDate(now, 'Hunt cooldown now');
  const seconds = Math.max(0, Math.floor(Number(cooldownSeconds)));
  return new Date(current.getTime() + seconds * 1000).toISOString();
}

export function projectHuntCooldown({ readyAt = null, now = new Date() } = {}) {
  const current = toDate(now, 'Hunt cooldown now');
  if (!readyAt) {
    return Object.freeze({ ready: true, nextReadyAt: null, remainingSeconds: 0 });
  }
  const ready = toDate(readyAt, 'Hunt cooldown readyAt');
  const remainingMs = Math.max(0, ready.getTime() - current.getTime());
  return Object.freeze({
    ready: remainingMs === 0,
    nextReadyAt: ready.toISOString(),
    remainingSeconds: Math.ceil(remainingMs / 1000),
  });
}
