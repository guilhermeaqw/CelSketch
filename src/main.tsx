import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LauncherApp } from './components/LauncherApp';
import './index.css';

const isLauncherMode = new URLSearchParams(window.location.search).get('mode') === 'launcher';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isLauncherMode ? <LauncherApp /> : <App />}
  </React.StrictMode>
);
