import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    launchOptions: { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] },
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npm exec vite preview -- --host 127.0.0.1 --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174',
      timeout: 30000,
      env: { API_PORT: '3100' },
    },
    {
      command: 'npm start',
      url: 'http://127.0.0.1:3100/api/health',
      timeout: 30000,
      env: {
        PORT: '3100',
        DATA_DIR: '.data/e2e',
        APP_URL: 'http://127.0.0.1:5174',
        NODE_ENV: 'test',
        DATABASE_URL: '',
        MAIL_TRANSPORT: 'preview',
        SMTP_HOST: '',
        SMTP_USER: '',
        SMTP_PASS: '',
      },
    },
    {
      command: 'npm run dev:web -- --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      timeout: 30000,
      env: { API_PORT: '3100' },
    },
  ],
  reporter: 'list',
});
