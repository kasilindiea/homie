import { defineConfig } from '@playwright/test';

// Playwright needs Windows taskkill when cleaning up its development server.
if (process.platform === 'win32') {
  process.env.PATH = `${process.env.SystemRoot || 'C:\\Windows'}\\System32;${process.env.PATH || ''}`;
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  outputDir: 'artifacts/playwright',
  use: {
    browserName: 'chromium',
    channel: 'msedge',
    headless: true,
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `${process.platform === 'win32' ? 'npm.cmd' : 'npm'} run dev -- --port 5174 --strictPort`,
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
