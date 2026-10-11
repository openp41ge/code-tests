import { defineConfig } from "vitest/config";
import { packageProject } from "../../support/app";

export default defineConfig(
  packageProject(__dirname, {
    test: {
      include: ["test/**/*.test.ts"],
      environment: "node",
    },
  }),
);
