import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    'global': 'globalThis',
  'process.env': {},
  },
  resolve: {
    alias: {
      // Ensure browser-friendly resolution of solana web3 deps
      stream: 'stream-browserify',
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    exclude: ['@solana/web3.js'],
  },
})
