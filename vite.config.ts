import { defineConfig } from "vite";

export default defineConfig({
  logLevel: "warn",
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
    lib: { entry: { client: "src/client.ts", "html-review-sdk": "src/html-review-sdk.ts" }, formats: ["es"], fileName: "[name]" }
  }
});
