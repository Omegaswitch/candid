import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      // server-only throws outside React Server Components; services are plain modules in tests.
      "server-only": resolve(__dirname, "test/empty.ts"),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
