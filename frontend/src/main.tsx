import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { registerCustomOverlays } from './overlays';
import { initSavedPineIndicators } from './services/pineEngine';

registerCustomOverlays();
initSavedPineIndicators();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
