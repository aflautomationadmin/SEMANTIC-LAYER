import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',   // supports top-level await
  },
  base: '/downloadui/',
  server: {
    port: 3000,
    proxy: {
      '/cubejs-api': 'http://localhost:4000',
    },
  },
})
