import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'next/link': path.resolve(__dirname, './src/compat/next-link.tsx'),
      'next/navigation': path.resolve(__dirname, './src/compat/next-navigation.ts')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  }
})
