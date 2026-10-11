/**
 * Integration tests for app type registration — the APP_TYPES registry's
 * entries and their metadata.
 */

import { describe, it, expect } from "vitest";
import { APP_TYPES } from "@openp41ge/renderer/app-types";

describe("App type registration — integration", () => {
  describe("APP_TYPES registry contains expected entries", () => {
    it("has all required app types", () => {
      const ids = APP_TYPES.map((t) => t.id).sort();
      expect(ids).toContain("file-explorer");
      expect(ids).toContain("file-viewer");
      expect(ids).toContain("markdown");
      expect(ids).toContain("table");
      expect(ids).not.toContain("video");
    });

    it("each app type has all required fields", () => {
      for (const t of APP_TYPES) {
        expect(t.id).toBeTruthy();
        expect(t.label).toBeTruthy();
        expect(t.icon).toBeTruthy();
        expect(typeof t.description).toBe("string");
      }
    });

    it("has no duplicate IDs", () => {
      const ids = APP_TYPES.map((t) => t.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });
  });

  describe("App type info metadata", () => {
    it("file-viewer has the correct description", () => {
      const fv = APP_TYPES.find((t) => t.id === "file-viewer");
      expect(fv?.description).toContain("View file");
    });

    it("file-explorer has the correct label", () => {
      const fv = APP_TYPES.find((t) => t.id === "file-explorer");
      expect(fv?.label).toBe("File Explorer");
    });
  });
});
