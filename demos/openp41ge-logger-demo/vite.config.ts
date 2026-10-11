import { defineConfig } from "vite";
import path from "path";
import { APP_DIR, TESTS_DIR, appMirror } from "../../support/app";

export default defineConfig({
  // App sources resolve their imports in the app checkout (support/app.ts).
  plugins: [appMirror()],
  server: {
    fs: { allow: [TESTS_DIR, APP_DIR] },
    port: 5162,
    strictPort: true,
  },
  resolve: {
    alias: {
      "openp41ge-core-logger": path.join(APP_DIR, "packages/openp41ge-core-logger/src"),
    },
  },
});
