import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// design-system.html (the token/component preview page) is served in dev only: the build's
// only input is index.html, so it never ships. Add more pages to `input` below.
export default defineConfig({
  plugins: [vue(), tailwindcss(), basicSsl()],
  resolve: {
    alias: {
      '@ds': fileURLToPath(new URL('../design-system', import.meta.url)),
    },
    // ../design-system has no node_modules of its own; resolve vue from this project.
    dedupe: ['vue'],
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
      },
    },
  },
  server: {
    port: 6200, // 6100 is the dashboard's (backend/api sends local sign-ins there)
    host: true,
    https: true,
    fs: { allow: ['..'] },
  },
});
