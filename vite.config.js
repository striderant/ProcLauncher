import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 3000,
    host: '127.0.0.1',
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
  envPrefix: ['VITE_', 'ELECTRON_'],
  watch: {
    ignored: ['**/dist/**', '**/release/**', '**/release-build/**', '**/node_modules/**'],
  },
})