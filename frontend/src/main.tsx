import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { registerCustomOverlays } from './overlays';
import { initSavedPineIndicators, registerPineContextProvider } from './services/pineEngine';
import { useChartStore } from './store/useChartStore';

registerPineContextProvider(() => {
  const st = useChartStore.getState();
  return { symbolInfo: st.symbolInfo, timezone: st.timezone };
});
registerCustomOverlays();
initSavedPineIndicators();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
