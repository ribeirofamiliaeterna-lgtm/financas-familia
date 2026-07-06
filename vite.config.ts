import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' permite hospedar no GitHub Pages em qualquer subcaminho
export default defineConfig({
  plugins: [react()],
  base: './',
})
