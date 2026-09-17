import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'frontend',
  base: '/react-battle/',
  plugins: [react()],
  build: {
    outDir: '../public/react-battle',
    emptyOutDir: true,
  },
});
