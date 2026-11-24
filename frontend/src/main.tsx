import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { KioskApp } from './kiosk/KioskApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <KioskApp />
  </StrictMode>,
);
