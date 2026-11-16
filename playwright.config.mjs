import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8080';
const target = new URL(baseURL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
  throw new Error('Browser tests create disposable accounts and require a loopback test stack.');
}

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: [['list', { printSteps: true }]],
  outputDir: 'artifacts/playwright-tmp',
  use: {
    baseURL,
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // Only explicitly masked screenshots and numeric observations are uploaded.
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
});
