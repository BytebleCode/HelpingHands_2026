import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // reachable from an iPhone on the same Wi-Fi
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
});
