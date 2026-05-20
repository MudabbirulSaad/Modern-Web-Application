import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createAppShellServiceWorkerPlugin } from './src/pwa/viteAppShellServiceWorker.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), createAppShellServiceWorkerPlugin()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
})
