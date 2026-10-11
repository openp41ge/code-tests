/**
 * Vitest configuration for the openp41ge-core-extension-installer package.
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
      testTimeout: 15000,
    },
    resolve: {
      alias: {
        "@openp41ge-core-extension-installer": path.resolve(APP, "./src"),
      },
    },
  }),
);
