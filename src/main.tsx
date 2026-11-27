import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

// Lazy-split the 3 Electron window entrypoints so Launcher & Reference Window boot near-instantly!
const App = lazy(() => import('./App'));
const LauncherApp = lazy(() =>
  import('./components/LauncherApp').then((m) => ({ default: m.LauncherApp }))
);
const ReferenceWindow = lazy(() =>
  import('./components/ReferenceWindow').then((m) => ({ default: m.ReferenceWindow }))
);

const mode = new URLSearchParams(window.location.search).get('mode');

const BootFallback: React.FC = () => (
  <div
    style={{
      width: '100vw',
      height: '100vh',
      background: mode === 'launcher' ? '#13151a' : '#181a20'
    }}
  />
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={<BootFallback />}>
      {mode === 'launcher' ? (
        <LauncherApp />
      ) : mode === 'reference' ? (
        <ReferenceWindow standalone />
      ) : (
        <App />
      )}
    </Suspense>
  </React.StrictMode>
);
