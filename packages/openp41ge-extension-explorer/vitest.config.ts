/**
 * Vitest configuration for the openp41ge-extension-explorer package.
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
        "@openp41ge-extension-explorer": path.resolve(APP, "./src"),
        "@openp41ge-extension-explorer/tree-view": path.resolve(APP, "./src/tree-view"),
        "@openp41ge-extension-explorer/renderer": path.resolve(APP, "./src/renderer"),
      },
    },
  }),
);
