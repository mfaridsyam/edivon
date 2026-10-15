import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/fonts.css';
import '../styles/tokens.css';
import '../styles/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemen #root tidak ditemukan.');

createRoot(root).render(
  <StrictMode>
    <main className="placeholder t-body">Galeri komponen menyusul di fase 2.</main>
  </StrictMode>,
);
