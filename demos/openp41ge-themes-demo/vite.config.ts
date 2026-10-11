import { defineConfig } from "vite";
import path from "path";
import { APP_DIR, TESTS_DIR, appMirror } from "../../support/app";

export default defineConfig({
  // App sources resolve their imports in the app checkout (support/app.ts).
  plugins: [appMirror()],
  server: {
    fs: { allow: [TESTS_DIR, APP_DIR] },
    port: 3947,
    strictPort: true,
  },
  resolve: {
    alias: {
      "openp41ge-sdk-uikit": path.join(APP_DIR, "packages/openp41ge-sdk-uikit/src"),
    },
  },
});
