import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./dist/tests",
  testMatch: "**/*.browser.spec.js",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    browserName: "chromium",
    launchOptions: { executablePath: process.env.RICHIE_CHROME ?? "/usr/bin/google-chrome" },
  },
});
