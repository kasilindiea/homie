import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  resolve: { alias: { three: fileURLToPath(new URL('./sandbox-prototype/house-modeling/viewer/vendor/three.module.js', import.meta.url)) } },
  build: { target: 'es2022' },
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    watch: { ignored: ['**/.tools/**', '**/android/**', '**/artifacts/**'] },
  },
});
