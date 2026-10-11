import { defineConfig } from "vitest/config";
import { packageProject } from "../../support/app";

export default defineConfig(
  packageProject(__dirname, {
    test: {
      environment: "jsdom",
      include: ["test/**/*.test.ts"],
    },
  }),
);
