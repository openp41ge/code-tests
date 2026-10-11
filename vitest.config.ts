/**
 * Runs every package's tests (one Vitest project per `packages/<pkg>`)
 * against the app checkout (support/app.ts).
 *
 *   pnpm test                         all of them
 *   pnpm test --project openp41ge     one package
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*/vitest.config.ts"],
    watch: false,
    onConsoleLog(log: string): false | void {
      const suppressed = [
        "Lit is in dev mode",
        "Multiple versions of Lit",
        "no state handler found for state",
        "DeprecationWarning",
        "The `util._extend` API is deprecated",
        "HTMLCanvasElement's getContext()",
        "[operation-dispatcher]",
        "[real-drag-handler]",
        "[config-service]",
        "[ConfigService]",
        "Error unmounting controller:",
        "Unhandled Rejection:",
      ];
      for (const pattern of suppressed) {
        if (log.includes(pattern)) return false;
      }
    },
    reporters: ["dot", "junit"],
    outputFile: { junit: "./test-results/junit.xml" },
  },
});
