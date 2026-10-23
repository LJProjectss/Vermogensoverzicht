import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// De app draait in een submap van de Thuis-hub: https://<site>/vermogen/
const BASE = '/vermogen/';

const PUBLIC_FILES = [
  '',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32x32.png',
].map((f) => BASE + f);

// Genereert dist/sw.js met de lijst van alle gebouwde bestanden, zodat de app na de eerste
// keer openen volledig offline werkt.
function serviceWorker() {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'index.html').sort();
      const precache = [...PUBLIC_FILES, ...files.map((f) => BASE + f)];
      const version = createHash('sha256').update(files.join('|')).digest('hex').slice(0, 10);
      const source = readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8')
        .replace('= __VERSION__;', `= ${JSON.stringify(version)};`)
        .replace('= __PRECACHE__;', `= ${JSON.stringify(precache, null, 2)};`)
        .replace('= __BASE__;', `= ${JSON.stringify(BASE)};`);
      if (source.includes('__VERSION__') || source.includes('__PRECACHE__') || source.includes('__BASE__')) this.error('sw-template.js: placeholders niet vervangen');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// De grafiekbibliotheek (recharts) wordt via lazy-loading een apart bestand dat pas laadt
// als je Overzicht of Analyse opent.
export default defineConfig({
  base: BASE,
  plugins: [react(), serviceWorker()],
  server: { port: 5174 },
  build: { chunkSizeWarningLimit: 600 },
});
