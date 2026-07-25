import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Config for the emulator-backed Firestore rules tests. Run via `npm run
// test:rules`, which wraps this in `firebase emulators:exec` so the Firestore
// emulator is up for the duration.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
    // Rules tests share one emulator + clear it between tests, so run serially.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
