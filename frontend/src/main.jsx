import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ActiveTimingCombatPrototypeApp } from './ActiveTimingCombatPrototypeApp.jsx';
import { BattlePrototypeApp } from './BattlePrototypeApp.jsx';
import { CodexApp } from './CodexApp.jsx';
import { GameShellApp } from './GameShellApp.jsx';
import './styles.css';

const view = new URLSearchParams(window.location.search).get('view');
const codexMode = ['/codex', '/codex-react'].includes(window.location.pathname) || view === 'codex';
const timingMode = !codexMode && (window.location.pathname === '/active-timing' || view === 'timing');
const battleMode = !codexMode && !timingMode && view === 'battle';

createRoot(document.getElementById('root')).render(<StrictMode>{codexMode ? <CodexApp /> : timingMode ? <ActiveTimingCombatPrototypeApp /> : battleMode ? <BattlePrototypeApp /> : <GameShellApp />}</StrictMode>);
