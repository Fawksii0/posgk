import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/newui/',
  plugins: [react()],
  server: {
    port: 3001,
    host: true
  }
})
