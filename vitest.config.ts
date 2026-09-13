import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src/renderer', import.meta.url)) },
  },
  test: {
    environment: 'node',
    coverage: { reporter: ['text', 'html'], include: ['src/domain/**/*.ts', 'src/native/persistence.ts'] }
  }
});
