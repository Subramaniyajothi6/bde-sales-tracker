import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs on :4000. Vite forwards /api there, so the
// browser sees one address and login cookies just work.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' }
  }
});
