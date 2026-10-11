/**
 * Vitest configuration for the openp41ge-core-terminal package.
 */
import { defineConfig } from "vitest/config";
import { appPackage, packageProject } from "../../support/app";
import path from "path";

const APP = appPackage(__dirname);

export default defineConfig(
  packageProject(__dirname, {
    test: {
      include: ["test/**/*.test.ts"],
      environment: "jsdom",
      setupFiles: [
        path.resolve(__dirname, "./test/unit/pre-setup.ts"),
        path.resolve(__dirname, "./test/unit/setup.ts"),
      ],
    },
    resolve: {
      alias: {
        "@openp41ge-core-terminal": path.resolve(APP, "./src"),
        "@openp41ge": path.resolve(APP, "../openp41ge/src"),
        "openp41ge-core-logger": path.resolve(APP, "../openp41ge-core-logger/src"),
      },
    },
  }),
);
