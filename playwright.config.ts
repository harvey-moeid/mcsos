import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: "docs/evidence/ui-results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:8792",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ["--no-sandbox"],
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "android",
      use: {
        viewport: { width: 393, height: 851 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "node scripts/ui-runtime.mjs",
    url: "http://127.0.0.1:8792",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
