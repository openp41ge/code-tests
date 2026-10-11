/**
 * Vitest configuration for the openp41ge-extension-workspaces package.
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
        // The real <json-editor> needs a DOM and the editor engine's source;
        // these node-env tests never render it.
        "openp41ge-sdk-uikit/json-editor": path.resolve(
          __dirname,
          "./test/unit/stubs/json-editor.ts",
        ),
        "@openp41ge-extension-workspaces": path.resolve(APP, "./src"),
        "@openp41ge-extension-workspaces/renderer": path.resolve(APP, "./src/renderer"),
        "@openp41ge-extension-workspaces/workspace-file": path.resolve(APP, "./src/workspace-file"),
        "@openp41ge-extension-workspaces/workspace-editor": path.resolve(
          APP,
          "./src/workspace-editor",
        ),
        "@openp41ge-extension-workspaces/workspace-schema": path.resolve(
          APP,
          "./src/workspace-schema",
        ),
      },
    },
  }),
);
