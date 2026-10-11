import { defineConfig } from "vite";
import path from "path";
import { APP_DIR, TESTS_DIR, appMirror } from "../../support/app";

export default defineConfig({
  // App sources resolve their imports in the app checkout (support/app.ts).
  plugins: [appMirror()],
  server: {
    fs: { allow: [TESTS_DIR, APP_DIR] },
    port: 7291,
    strictPort: true,
  },
  resolve: {
    alias: {
      "openp41ge-sdk-uikit": path.join(APP_DIR, "packages/openp41ge-sdk-uikit/src"),
      "openp41ge-sdk-uikit/theme": path.join(APP_DIR, "packages/openp41ge-sdk-uikit/src/theme"),
      "openp41ge-core-editor-engine": path.join(
        APP_DIR,
        "packages/openp41ge-core-editor-engine/src",
      ),
      "openp41ge-core-syntax-highlighting": path.join(
        APP_DIR,
        "packages/openp41ge-core-syntax-highlighting/src",
      ),
      "openp41ge-core-tabs": path.join(APP_DIR, "packages/openp41ge-core-tabs/src"),
      "openp41ge-core-piece-tree": path.join(APP_DIR, "packages/openp41ge-core-piece-tree/src"),
      "openp41ge-core-git": path.join(APP_DIR, "packages/openp41ge-core-git/src"),
    },
  },
});
