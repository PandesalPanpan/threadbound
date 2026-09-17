import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BattlePrototypeApp } from './BattlePrototypeApp.jsx';
import { GameShellApp } from './GameShellApp.jsx';
import './styles.css';

const battleMode = new URLSearchParams(window.location.search).get('view') === 'battle';

createRoot(document.getElementById('root')).render(<StrictMode>{battleMode ? <BattlePrototypeApp /> : <GameShellApp />}</StrictMode>);
