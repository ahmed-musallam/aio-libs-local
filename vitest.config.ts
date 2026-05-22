import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["test/setup.ts"],
    include: ["test/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    pool: "forks",
  },
  resolve: {
    alias: {
      "@adobe/aio-lib-files": path.resolve(__dirname, "dist/files.js"),
      "@adobe/aio-lib-state": path.resolve(__dirname, "dist/state.js"),
    },
  },
});
