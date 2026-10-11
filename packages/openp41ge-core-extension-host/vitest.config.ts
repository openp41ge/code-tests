/**
 * Vitest configuration for the openp41ge-core-extension-host package.
 */
import { defineConfig } from "vitest/config";
import { appPackage, packageProject } from "../../support/app";
import path from "path";

const APP = appPackage(__dirname);

export default defineConfig(
  packageProject(__dirname, {
    test: {
      include: ["test/unit/**/*.test.ts"],
      environment: "node",
    },
    resolve: {
      alias: {
        "@openp41ge-core-extension-host": path.resolve(APP, "./src"),
      },
    },
  }),
);
