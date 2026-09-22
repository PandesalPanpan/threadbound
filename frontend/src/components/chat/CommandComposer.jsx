import { useMemo, useRef, useState } from 'react';
import { COMMAND_SUGGESTIONS } from '../../shell/presentation.js';

export function CommandComposer({ onSubmit, busy = false, contextualActions = [] }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);
  const suggestions = useMemo(() => {
    const query = value.trim().replace(/^\//, '').toLowerCase();
    if (!query) return [];
    return COMMAND_SUGGESTIONS.filter((command) => command.startsWith(query)).slice(0, 4);
  }, [value]);

  const submit = async (event) => {
    event.preventDefault();
    const next = value.trim();
    if (!next || busy) return;
    const submitter = event.nativeEvent?.submitter || null;
    const canRestoreDesktopFocus = window.matchMedia?.('(pointer: fine) and (hover: hover)').matches;
    const startedWithComposerFocus = document.activeElement === inputRef.current;
    const startedWithSendFocus = document.activeElement === submitter;
    setValue('');
    try {
      await onSubmit(next);
    } finally {
      if (!canRestoreDesktopFocus) {
        inputRef.current?.blur();
      } else if (startedWithComposerFocus || startedWithSendFocus) {
        const active = document.activeElement;
        if (active === document.body || active === submitter || active === inputRef.current) {
          inputRef.current?.focus({ preventScroll: true });
        }
      }
    }
  };

  return (
    <section className="shell-composer-wrap" aria-label="Adventure command composer">
      {contextualActions.length ? (
        <div className="shell-context-actions" aria-label="Suggested actions">
          {contextualActions.slice(0, 2).map((action) => (
            <button key={action.command} type="button" className="shell-suggestion-button" onClick={() => onSubmit(action.command)} disabled={busy} data-testid={`stream-context-${action.command}`}>
              <span>{action.label}</span><small>{action.hint}</small>
            </button>
          ))}
        </div>
      ) : null}
      <form className="shell-composer" onSubmit={submit} data-testid="stream-composer">
        <span className="shell-composer__mark" aria-hidden="true">›</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Message party or type /command…"
          aria-label="Adventure Stream command"
          autoComplete="off"
          data-testid="stream-message"
        />
        <button type="submit" className="shell-composer__send" aria-label="Send command" disabled={!value.trim() || busy} data-testid="stream-send">↗</button>
      </form>
      {suggestions.length ? (
        <div className="shell-command-suggestions" data-testid="stream-suggestions">
          {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => { setValue(suggestion); }}>/ {suggestion}</button>)}
        </div>
      ) : null}
      <p className="shell-composer__hint"><kbd>Enter</kbd> send · try <button type="button" onClick={() => onSubmit('help')}>help</button> for the full thread.</p>
    </section>
  );
}
