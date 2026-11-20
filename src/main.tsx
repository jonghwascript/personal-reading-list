import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Placeholder entry so the toolchain builds on its own; the app is mounted here once the UI lands.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main>Bookshelf</main>
  </StrictMode>,
);
