import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service worker alleen in de productiebuild, zodat de app installeerbaar en offline bruikbaar is.
// Komt er een nieuwe versie online, dan neemt de nieuwe service worker het over en tonen we
// een melding "Nieuwe versie beschikbaar" (zie App.jsx).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return; // eerste installatie: geen melding
      window.__voUpdateReady = true;
      window.dispatchEvent(new Event('vo:update'));
    });
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((reg) => {
        // Regelmatig (en bij terugkeren naar de app) controleren op een nieuwe versie
        const check = () => reg.update().catch(() => {});
        setInterval(check, 60 * 60000);
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
      })
      .catch(() => {});
  });
}
