import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BattlePrototypeApp } from './BattlePrototypeApp.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<StrictMode><BattlePrototypeApp /></StrictMode>);
