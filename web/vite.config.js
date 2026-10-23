import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://<user>.github.io/grain-of-salt/ on GitHub Pages; override with VITE_BASE for other hosts.
  base: process.env.VITE_BASE || '/grain-of-salt/',
  plugins: [react()],
})
