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
    // HTTPS on 6100: backend/api's getFrontendUrl() sends local Google sign-ins back here, and the
    // session cookie (SameSite=Strict) only survives if this and the local API (https :3006) are
    // both HTTPS.
    port: 6100,
    strictPort: true,
    host: true,
    https: true,
    fs: { allow: ['..'] },
  },
});
