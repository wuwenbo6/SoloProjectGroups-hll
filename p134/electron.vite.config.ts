import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    entry: 'src/main/index.ts',
    build: {
      rollupOptions: {
        external: ['modbus-serial', 'electron', 'serialport']
      }
    }
  },
  preload: {
    entry: 'src/preload/index.ts',
    build: {
      rollupOptions: {
        external: ['modbus-serial', 'electron']
      }
    }
  },
  renderer: {
    plugins: [react()]
  }
})
