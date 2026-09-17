export function HealthBar({ value, max, tone = 'hp', label = 'HP', before = null, testId }) {
  const safeMax = Math.max(1, Number(max) || 1);
  const safeValue = Math.max(0, Math.min(safeMax, Number(value) || 0));
  const safeBefore = before == null ? safeValue : Math.max(0, Math.min(safeMax, Number(before) || 0));
  const percent = Math.round((safeValue / safeMax) * 100);
  const beforePercent = Math.round((safeBefore / safeMax) * 100);
  return (
    <div className={`meter meter--${tone}`} data-testid={testId} data-meter-before={`${beforePercent}%`} data-meter-after={`${percent}%`}>
      <div className="meter__track" aria-hidden="true">
        <span className="meter__fill" style={{ '--meter-progress': `${percent}%` }} />
      </div>
      <div className="meter__label"><span>{label}</span><strong>{safeValue}/{safeMax}</strong></div>
    </div>
  );
}
