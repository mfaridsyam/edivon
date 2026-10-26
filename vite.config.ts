import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Kebijakan konten untuk build produksi: tidak ada skrip atau koneksi ke luar origin sendiri.
// Media hanya dibaca lewat blob: URL lokal. Server dev tidak memakai ini karena butuh skrip inline untuk HMR.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "connect-src 'self' blob: data:",
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

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/**
 * Membuat service worker untuk web app yang bisa dipasang dan dibuka tanpa internet.
 * Daftar precache berisi semua berkas hasil build dan isi public/; versinya dari hash daftar itu.
 */
function serviceWorker(): Plugin {
  const root = import.meta.dirname;
  return {
    name: 'klip-service-worker',
    apply: 'build',
    // Setelah plugin HTML Vite, agar index.html hasil build sudah ada di bundle.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const publicDir = resolve(root, 'public');
      const publicFiles = listFiles(publicDir).map((file) => relative(publicDir, file).split(sep).join('/'));
      const files = [...Object.keys(bundle), ...publicFiles]
        .filter((name) => !name.endsWith('.txt') && name !== 'sw.js')
        .sort();
      const template = readFileSync(resolve(root, 'src/sw-template.js'), 'utf8');
      const hash = createHash('sha256').update(template);
      for (const name of Object.keys(bundle).sort()) hash.update(name);
      for (const name of publicFiles) hash.update(name).update(readFileSync(join(publicDir, name)));
      const urls = ['/', ...new Set(['index.html', ...files].map((name) => `/${name}`))];
      const source = template
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__PRECACHE__', JSON.stringify(urls));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), contentSecurityPolicy(), serviceWorker()],
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
