import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './ui/ui.css';
import { App } from './app/App';
import { setupInstall } from './app/install';

// Halaman internal komponen ada di /ui/. Server statis tertentu tidak menambahkan garis miring sendiri.
if (window.location.pathname === '/ui') {
  window.location.replace('/ui/');
} else {
  setupInstall();
  const root = document.getElementById('root');
  if (!root) throw new Error('Elemen #root tidak ditemukan.');
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
