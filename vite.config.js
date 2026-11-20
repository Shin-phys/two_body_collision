import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages: https://shin-phys.github.io/two_body_collision/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/two_body_collision/',
})
