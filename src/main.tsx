import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initPreferences } from './lib/preferences';
import './styles/global.css';

// Loads the dyslexia font if chosen and follows OS contrast changes.
initPreferences();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
