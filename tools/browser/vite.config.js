// Vite config for the static build: bundles main's server into the client with Node built-ins
// and Express swapped for the browser shims in ./shims.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';

const work = fileURLToPath(new URL('../', import.meta.url)); // build copy of main (client/..)
const shim = (name) => fileURLToPath(new URL(`./src/browser/shims/${name}.js`, import.meta.url));

// Server modules build file paths from import.meta.url; give each a stable file:///hh/ URL so
// Vite doesn't treat those paths as assets to bundle.
const serverPaths = {
  name: 'hh-server-paths',
  enforce: 'pre',
  transform(code, id) {
    if (!id.startsWith(`${work}server/`)) return null;
    return code.replaceAll('import.meta.url', JSON.stringify(`file:///hh/${relative(work, id)}`));
  },
};

export default defineConfig({
  base: './',
  plugins: [serverPaths, react()],
  resolve: { alias: { express: shim('express'), 'node:fs': shim('fs'), 'node:url': shim('url'), 'node:crypto': shim('crypto') } },
  define: {
    'process.env': JSON.stringify({ NODE_ENV: 'production', DEMO_MODE: 'true', FIS_BASE_URL: 'hh-local:/fis/v1' }),
    __HH_TODAY__: JSON.stringify(process.env.HH_TODAY),
    __HH_BUILD__: JSON.stringify(process.env.HH_BUILD),
  },
});
