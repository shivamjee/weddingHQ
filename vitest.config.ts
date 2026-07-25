import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Fast, pure-logic unit tests — no DOM, no emulator. The emulator-backed
    // rules tests live in tests/rules and run via `npm run test:rules`
    // (vitest.rules.config.ts) so `npm test` never needs a running emulator.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    // Mirror the tsconfig "@/*" -> "src/*" path alias so tests can use it too.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
