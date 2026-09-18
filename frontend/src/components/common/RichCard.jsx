export function RichCard({ kind, kicker = 'SHARED THREAD', title, subtitle, children, actions = null, testId, className = '' }) {
  return (
    <article className={`shell-rich-card shell-rich-card--${kind || 'default'} ${className}`.trim()} data-rich-card-kind={kind || 'default'} data-testid={testId || 'stream-command-card'}>
      <header className="shell-rich-card__header">
        <div>
          <span className="shell-kicker">{kicker}</span>
          {title ? <h2>{title}</h2> : null}
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="shell-rich-card__header-actions">{actions}</div> : null}
      </header>
      <div className="shell-rich-card__body">{children}</div>
    </article>
  );
}

export function PanelButton({ children, onClick, disabled = false, primary = false, danger = false, testId, type = 'button', title }) {
  return (
    <button
      className={`shell-button${primary ? ' shell-button--primary' : ''}${danger ? ' shell-button--danger' : ''}`}
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      title={title}
    >
      {children}
    </button>
  );
}

export function StateMessage({ title, copy, tone = 'empty', action = null }) {
  return (
    <div className={`shell-state shell-state--${tone}`}>
      <span className="shell-state__mark" aria-hidden="true">{tone === 'error' ? '!' : tone === 'loading' ? '◌' : '✦'}</span>
      <strong>{title}</strong>
      <p>{copy}</p>
      {action}
    </div>
  );
}
