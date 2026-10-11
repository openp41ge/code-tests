/**
 * Tests that ran under the app's old root vitest config (jsdom, the shared
 * setup file and the root source aliases).
 */
import path from "path";
import { defineConfig } from "vitest/config";
import { packageProject } from "../../support/app";
import { ROOT_ALIASES } from "../../support/root-aliases";

export default defineConfig(
  packageProject(__dirname, {
    test: {
      include: ["test/**/*.test.ts"],
      environment: "jsdom",
      testTimeout: 10000,
      setupFiles: [path.resolve(__dirname, "../openp41ge/test/unit/setup.ts")],
    },
    resolve: { alias: ROOT_ALIASES },
  }),
);
