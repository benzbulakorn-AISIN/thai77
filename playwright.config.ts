import { defineConfig, devices } from '@playwright/test';

// Mobile / responsive smoke tests against the production build served by `vite preview`.
// Run in GitHub Actions (workflow "E2E Responsive") or locally:
//   npm run build && npm i --no-save @playwright/test && npx playwright install chromium && npx playwright test
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'th-TH',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
