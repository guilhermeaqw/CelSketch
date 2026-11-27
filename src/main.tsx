import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LauncherApp } from './components/LauncherApp';
import { ReferenceWindow } from './components/ReferenceWindow';
import './index.css';

const mode = new URLSearchParams(window.location.search).get('mode');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {mode === 'launcher' ? (
      <LauncherApp />
    ) : mode === 'reference' ? (
      <ReferenceWindow standalone />
    ) : (
      <App />
    )}
  </React.StrictMode>
);
