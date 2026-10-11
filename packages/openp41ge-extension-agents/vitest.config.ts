/**
 * Vitest configuration for the openp41ge-extension-agents package.
 */
import { defineConfig } from "vitest/config";
import { appPackage, packageProject } from "../../support/app";
import path from "path";

const APP = appPackage(__dirname);

export default defineConfig(
  packageProject(__dirname, {
    test: {
      include: ["test/unit/**/*.test.ts"],
      environment: "jsdom",
    },
    resolve: {
      alias: {
        // The toolkit from source (tooltip) or a stand-in (the rest), so the
        // tests don't load its prebuilt bundle. The first matching key wins.
        "openp41ge-sdk-uikit/tooltip": path.resolve(
          APP,
          "../openp41ge-sdk-uikit/src/components/tooltip",
        ),
        "openp41ge-sdk-uikit": path.resolve(__dirname, "./test/unit/stubs/uikit.ts"),
        "@openp41ge-extension-agents": path.resolve(APP, "./src"),
      },
    },
  }),
);
