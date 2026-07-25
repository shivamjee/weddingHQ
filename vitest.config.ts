import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Node environment — these are pure logic + Firestore-emulator tests (Step 5),
    // neither needs a DOM.
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
  resolve: {
    // Mirror the tsconfig "@/*" -> "src/*" path alias so tests can use it too.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
