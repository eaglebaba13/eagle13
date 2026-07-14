import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      include: [
        "src/lib/astro-levels.ts",
        "src/lib/astro-constants.ts",
        "src/lib/levels.ts",
        "src/lib/strategy-math.ts",
        "src/lib/astro-engine.server.ts",
      ],
    },
  },
});