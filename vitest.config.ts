import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { core: fileURLToPath(new URL('./core', import.meta.url)) }
  },
  test: {
    environment: 'happy-dom',
    include: ['client/src/**/*.test.{ts,tsx}']
  }
});
