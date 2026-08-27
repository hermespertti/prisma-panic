import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5191,
    host: true,
    allowedHosts: ['cachyos-soyo.tail6d900.ts.net'],
  },
});
