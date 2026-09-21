import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
const buildVersion = `${pkg.version}-${Date.now()}`;
const buildTimeIso = new Date().toISOString();

function versionGeneratorPlugin(): Plugin {
  return {
    name: 'version-generator',
    buildStart() {
      const versionData = JSON.stringify({ version: buildVersion, buildTime: buildTimeIso });
      try {
        writeFileSync(fileURLToPath(new URL('./public/version.json', import.meta.url)), versionData);
      } catch (err) {
        console.error('Failed to write public/version.json', err);
      }
    },
    writeBundle() {
      const versionData = JSON.stringify({ version: buildVersion, buildTime: buildTimeIso });
      try {
        writeFileSync(fileURLToPath(new URL('./dist/version.json', import.meta.url)), versionData);
      } catch (err) {
        // dist might not exist yet if not in build mode
      }
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), versionGeneratorPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion),
    __APP_BUILD__: JSON.stringify(pkg.version),
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
