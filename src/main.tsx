import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Register the service worker so the app is installable and works offline.
import { registerSW } from 'virtual:pwa-register';
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
