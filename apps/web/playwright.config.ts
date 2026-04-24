import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 3100;
const MOCK_PORT = 3102;

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "tsx test/e2e/mock-server.ts",
      url: `http://localhost:${MOCK_PORT}/health`,
      env: { MOCK_PORT: String(MOCK_PORT) },
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
    },
    {
      command: `next dev -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      env: {
        NEXT_PUBLIC_API_URL: `http://localhost:${MOCK_PORT}`,
        API_URL: `http://localhost:${MOCK_PORT}`,
      },
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
