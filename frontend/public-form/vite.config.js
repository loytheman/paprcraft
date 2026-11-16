import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [vue(), tailwindcss(), basicSsl()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@ds': fileURLToPath(new URL('../design-system', import.meta.url)),
    },
    // ../design-system has no node_modules of its own; resolve vue from this project.
    dedupe: ['vue'],
  },
  server: {
    // HTTPS on 6300 (6100 is the dashboard, 6200 the landing site). The local API (https :3006) must
    // list https://localhost:6300 in ALLOWED_ORIGIN (backend/api/src/.env.local).
    port: 6300,
    strictPort: true,
    host: true,
    https: true,
    fs: { allow: ['..'] },
  },
});
