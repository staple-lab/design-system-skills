import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './inventory.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
