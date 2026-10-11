/**
 * Vitest configuration for the openp41ge package.
 * Extends the root config with package-specific paths.
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
        // Unit tests import src/main/services/* which transitively reference
        // @sentry/electron/main (which needs Electron to load). Replace it with
        // a no-op stub so main-service tests run without Electron.
        "@sentry/electron/main": path.resolve(__dirname, "./test/unit/stubs/sentry-main.ts"),
        "@openp41ge": path.resolve(APP, "./src"),
        "openp41ge-core-logger": path.resolve(APP, "../openp41ge-core-logger/src"),
        "openp41ge-core-constants": path.resolve(APP, "../openp41ge-core-constants/src"),
        "@openp41ge-core-terminal": path.resolve(APP, "../openp41ge-core-terminal/src"),
        "openp41ge-sdk-uikit/tooltip": path.resolve(
          APP,
          "../openp41ge-sdk-uikit/src/components/tooltip",
        ),
        "openp41ge-sdk-uikit/file-editor": path.resolve(
          APP,
          "../openp41ge-sdk-uikit/src/file-editor",
        ),
        "openp41ge-sdk-uikit/drop-indicator": path.resolve(
          APP,
          "../openp41ge-sdk-uikit/src/components/drop-indicator",
        ),
        "openp41ge-sdk-uikit/git-repository": path.resolve(
          APP,
          "../openp41ge-sdk-uikit/src/git-repository",
        ),
        "openp41ge-sdk-uikit": path.resolve(APP, "../openp41ge-sdk-uikit/src"),
        "openp41ge-core-scrollbar": path.resolve(APP, "../openp41ge-core-scrollbar/src"),
        "openp41ge-core-filesystem": path.resolve(APP, "../openp41ge-core-filesystem/src"),
        "openp41ge-core-syntax-highlighting": path.resolve(
          APP,
          "../openp41ge-core-syntax-highlighting/src",
        ),
        "openp41ge-core-tabs": path.resolve(APP, "../openp41ge-core-tabs/src"),
        "openp41ge-core-editor-engine": path.resolve(APP, "../openp41ge-core-editor-engine/src"),
        "openp41ge-sdk-uikit/theme": path.resolve(APP, "../openp41ge-sdk-uikit/src/theme"),
      },
    },
  }),
);
