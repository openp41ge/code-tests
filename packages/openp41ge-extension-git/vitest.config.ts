/**
 * Vitest configuration for the openp41ge-extension-git package.
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
        // The real toolkit needs a DOM and the editor engine's source; these
        // node-env tests never render it. (The first matching key wins, so
        // the file editor's comes before the toolkit's own.)
        "openp41ge-sdk-uikit/file-editor": path.resolve(
          __dirname,
          "./test/unit/stubs/file-editor.ts",
        ),
        "openp41ge-sdk-uikit/drop-indicator": path.resolve(
          __dirname,
          "./test/unit/stubs/drop-indicator.ts",
        ),
        "openp41ge-sdk-uikit/tooltip": path.resolve(__dirname, "./test/unit/stubs/tooltip.ts"),
        "openp41ge-sdk-uikit": path.resolve(__dirname, "./test/unit/stubs/uikit.ts"),
        "@openp41ge-extension-git": path.resolve(APP, "./src"),
      },
    },
  }),
);
