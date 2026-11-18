import { defineConfig } from 'vitest/config';

// Unit + integration tests live in tests/ (kept outside src/ so `tsc` / the production build never depends on them).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
  },
});
