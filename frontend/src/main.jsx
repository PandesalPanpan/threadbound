import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BattlePrototypeApp } from './BattlePrototypeApp.jsx';
import { CodexApp } from './CodexApp.jsx';
import { GameShellApp } from './GameShellApp.jsx';
import './styles.css';

const view = new URLSearchParams(window.location.search).get('view');
const codexMode = ['/codex', '/codex-react'].includes(window.location.pathname) || view === 'codex';
const battleMode = !codexMode && view === 'battle';

createRoot(document.getElementById('root')).render(<StrictMode>{codexMode ? <CodexApp /> : battleMode ? <BattlePrototypeApp /> : <GameShellApp />}</StrictMode>);
