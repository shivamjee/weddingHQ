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
      // `server-only` is a marker package that THROWS on import unless it
      // resolves through React's "react-server" condition, which Next.js
      // supplies and Vitest does not — so importing any server module
      // (src/lib/ai/*) in a test would fail at import time. Pointing at the
      // package's own no-op entry keeps the marker doing its real job in the
      // app build while letting the tests import the same files.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
});
