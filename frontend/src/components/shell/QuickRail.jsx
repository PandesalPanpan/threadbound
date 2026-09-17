import { QUICK_COMMANDS } from '../../shell/presentation.js';

export function QuickRail({ onCommand, dashboard }) {
  const party = dashboard?.party;
  return (
    <aside className="game-shell-quick-rail" aria-label="Quick commands">
      <div className="quick-rail__intro"><span className="shell-kicker">QUICK COMMANDS</span><p>Stay in the thread.</p></div>
      <nav className="quick-rail__nav">
        {QUICK_COMMANDS.map((item) => (
          <button key={item.command} type="button" className="quick-rail__button" onClick={() => onCommand(item.command)} data-testid={`quick-${item.command}`}>
            <span className="quick-rail__icon" aria-hidden="true">{item.icon}</span><span><strong>{item.label}</strong><small>{item.hint}</small></span><b aria-hidden="true">›</b>
          </button>
        ))}
      </nav>
      <div className="quick-rail__party">
        <span className="shell-kicker">PARTY</span>
        <strong>{party ? `${party.members?.length || 1} Weaver${party.members?.length === 1 ? '' : 's'}` : 'Solo thread'}</strong>
        <button type="button" onClick={() => onCommand('party')}>{party ? 'Open party' : 'Create a party'} <span>↗</span></button>
      </div>
    </aside>
  );
}
