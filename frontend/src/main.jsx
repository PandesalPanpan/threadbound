import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BattlePrototypeApp } from './BattlePrototypeApp.jsx';
import { CodexApp } from './CodexApp.jsx';
import { GameShellApp } from './GameShellApp.jsx';
import './styles.css';

const ActiveTimingCombatPrototypeApp = lazy(() => import('./ActiveTimingCombatPrototypeApp.jsx').then((module) => ({ default: module.ActiveTimingCombatPrototypeApp })));
const ArenaCombatPrototypeApp = lazy(() => import('./ArenaCombatPrototypeApp.jsx').then((module) => ({ default: module.ArenaCombatPrototypeApp })));

const view = new URLSearchParams(window.location.search).get('view');
const codexMode = ['/codex', '/codex-react'].includes(window.location.pathname) || view === 'codex';
const timingMode = !codexMode && (window.location.pathname === '/active-timing' || view === 'timing');
const arenaMode = !codexMode && !timingMode && (window.location.pathname === '/arena-combat' || view === 'arena');
const battleMode = !codexMode && !timingMode && !arenaMode && view === 'battle';

createRoot(document.getElementById('root')).render(<StrictMode>{codexMode ? <CodexApp /> : arenaMode ? <Suspense fallback={<main className="game-shell-loading" role="status">Loading the Arena Lab…</main>}><ArenaCombatPrototypeApp /></Suspense> : timingMode ? <Suspense fallback={<main className="game-shell-loading" role="status">Loading the Combat Lab…</main>}><ActiveTimingCombatPrototypeApp /></Suspense> : battleMode ? <BattlePrototypeApp /> : <GameShellApp />}</StrictMode>);
