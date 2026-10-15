import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { YT_HELPER_ORIGIN, YT_THUMB_ORIGIN } from './src/state/youtubeLink.ts';

// Kebijakan konten untuk build produksi: tidak ada skrip atau koneksi ke luar origin sendiri.
// Media hanya dibaca lewat blob: URL lokal. Server dev tidak memakai ini karena butuh skrip inline untuk HMR.
// Pengecualian untuk fitur YouTube: helper lokal di 127.0.0.1 (`npm run yt`) dan thumbnail pratinjau.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${YT_THUMB_ORIGIN}`,
  "media-src 'self' blob:",
  "font-src 'self'",
  "worker-src 'self' blob:",
  `connect-src 'self' blob: data: ${YT_HELPER_ORIGIN}`,
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'klip-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        ui: resolve(import.meta.dirname, 'ui/index.html'),
      },
    },
  },
  worker: {
    format: 'es',
  },
});
