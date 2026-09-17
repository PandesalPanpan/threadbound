import { BattleUnit } from './BattleUnit.jsx';

function ActionButton({ children, onClick, disabled, testId, variant = '' }) {
  return <button className={`battle-action ${variant ? `battle-action--${variant}` : ''}`} type="button" onClick={onClick} disabled={disabled} data-testid={testId}>{children}</button>;
}

export function BattleArena({ battle, skills, runUpgrades, phase, busy, onStart, onAttack, onSkill, onDecision, onBack }) {
  const run = battle.run;
  const skill = skills?.find((candidate) => candidate.kind === 'damage') || null;
  const focus = battle.attacker.focus;
  const skillReady = skill && focus >= Number(skill.cost || 0) && Number(run?.viewer?.skillCooldowns?.[skill.id] || 0) <= 0;
  const choices = run?.phase === 'event' ? run.runEvent?.choices || [] : run?.phase === 'upgrade' ? runUpgrades || [] : [];
  const isDecision = phase === 'decision';
  const canAct = phase === 'live' && Boolean(run?.id) && !busy;

  return (
    <section className="battle-card" data-testid="battle-card" data-battle-phase={phase}>
      <header className="battle-card__header">
        <div>
          <span className="battle-card__eyebrow">FRAYED HOLLOW · PROTOTYPE</span>
          <h1>Threadbound battle</h1>
        </div>
        <div className="battle-card__status" data-testid="battle-phase-label"><span className="status-dot" />{battle.phaseLabel}</div>
      </header>

      {phase === 'preBattle' ? (
        <div className="battle-empty" data-testid="battle-pre-battle">
          <div className="battle-empty__sigil" aria-hidden="true"><span>✦</span></div>
          <span className="battle-card__eyebrow">01 · PRE-BATTLE</span>
          <h2>Enter the hollow</h2>
          <p>Start a real dungeon run. Every strike below is resolved by Threadbound, then animated here from its committed result.</p>
          <ActionButton onClick={onStart} disabled={busy} testId="battle-start" variant="primary">Start battle</ActionButton>
          <button className="quiet-link" type="button" onClick={onBack}>Return to the Adventure Stream</button>
        </div>
      ) : (
        <>
          <div className={`battle-stage battle-stage--${phase}`} data-testid="battle-stage" aria-label={`${battle.phaseLabel} battle arena`}>
            <div className="stage-grid" aria-hidden="true" />
            <div className="stage-glow stage-glow--attacker" aria-hidden="true" />
            <div className="stage-glow stage-glow--target" aria-hidden="true" />
            <BattleUnit unit={battle.attacker} side="attacker" beforeHp={battle.previousAttackerHp} phase={phase} />
            <div className="battle-trajectory" aria-hidden="true"><span className="trajectory__beam" /><span className="trajectory__core" /><span className="trajectory__burst" /><span className="trajectory__ring trajectory__ring--one" /><span className="trajectory__ring trajectory__ring--two" /></div>
            <BattleUnit unit={battle.target} side="target" beforeHp={battle.previousTargetHp} phase={phase} />
            {battle.action?.damage > 0 && phase !== 'live' ? <div className={`damage-float ${battle.action.critical ? 'damage-float--critical' : ''}`} data-testid="battle-floating-damage">−{battle.action.damage}</div> : null}
            {phase === 'skillCast' ? <div className="skill-banner" data-testid="battle-skill-banner"><span>SKILL CAST</span><strong>{skill?.name || 'Combat skill'}</strong></div> : null}
            {phase === 'result' ? <div className="result-stamp" data-testid="battle-result-stamp"><span>{run?.phase === 'failed' ? 'RUN LOST' : 'HOLLOW CLEARED'}</span><strong>{run?.phase === 'failed' ? 'The thread went quiet.' : 'The path opens.'}</strong></div> : null}
          </div>

          <div className="battle-readout">
            <div><span>ENCOUNTER</span><strong>{run?.encounterIndex == null ? '—' : `${Number(run.encounterIndex) + 1} / ${run?.dungeonDefinition?.encounters?.length || 3}`}</strong></div>
            <div><span>THREAD</span><strong>{run?.version == null ? '—' : `v${run.version}`}</strong></div>
            <div><span>STATUS</span><strong>{run?.phase === 'boss' ? 'Boss' : run?.phase === 'complete' ? 'Complete' : run?.phase === 'failed' ? 'Failed' : run?.phase || 'Ready'}</strong></div>
          </div>

          {isDecision ? (
            <div className="decision-panel" data-testid="battle-decision">
              <span className="battle-card__eyebrow">{run?.phase === 'event' ? 'RUN EVENT' : 'RUN UPGRADE'}</span>
              <h2>{run?.runEvent?.name || 'Choose the next thread'}</h2>
              <p>{run?.runEvent?.prompt || 'The backend has paused the run for a meaningful choice.'}</p>
              <div className="decision-grid">{choices.map((choice) => <button key={choice.id} className="decision-choice" type="button" onClick={() => onDecision(choice.id)} disabled={busy} data-testid={`battle-decision-${choice.id}`}><strong>{choice.name || choice.label}</strong><span>{choice.summary || choice.description || choice.effectSummary?.join(' · ') || 'Authoritative run choice'}</span></button>)}</div>
            </div>
          ) : null}

          <div className="battle-controls" aria-label="Battle actions">
            <ActionButton onClick={onAttack} disabled={!canAct} testId="battle-attack" variant="primary">Attack <kbd>A</kbd></ActionButton>
            {skill ? <ActionButton onClick={() => onSkill(skill.id)} disabled={!canAct || !skillReady} testId={`battle-skill-${skill.id}`} variant="skill">{skill.name} <span>{skill.cost} Focus</span></ActionButton> : null}
            {phase === 'result' ? <ActionButton onClick={onBack} disabled={busy} testId="battle-result-back">Open Adventure Stream</ActionButton> : null}
          </div>
          <p className="battle-hint" data-testid="battle-hint">{busy ? 'Waiting for the committed result…' : phase === 'result' ? 'This result stays in the shared stream.' : phase === 'decision' ? 'Choose from the options the server offered.' : skill && !skillReady ? `Build ${skill.cost} Focus to cast ${skill.name}.` : 'Actions are sent to the existing Threadbound run.'}</p>
        </>
      )}
    </section>
  );
}
