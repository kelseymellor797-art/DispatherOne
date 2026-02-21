import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // Tauri expects the dev server on port 5173 by default
  server: {
    host: '127.0.0.1',  // Add this line
    port: 5173,
    strictPort: true,
  },
  
  // Prevent vite from obscuring rust errors
  clearScreen: false,
  
  // Environment variables with TAURI_ prefix are exposed to your app
  envPrefix: ['VITE_', 'TAURI_'],
});