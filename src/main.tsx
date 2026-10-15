import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './app/App';

const root = document.getElementById('root');
if (!root) throw new Error('Elemen #root tidak ditemukan.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
