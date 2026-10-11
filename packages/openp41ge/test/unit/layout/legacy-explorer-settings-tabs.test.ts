/**
 * A saved Explorer Settings tab (the retired platform tab) reopens as the
 * Explorer extension's settings in the platform's settings editor.
 */
import { describe, it, expect } from "vitest";
import { migrateLegacyExplorerSettingsTabs } from "@openp41ge/layout/legacy-explorer-settings-tabs";

describe("migrateLegacyExplorerSettingsTabs", () => {
  it("opens a saved Explorer Settings tab as the Explorer's settings editor", () => {
    const out = migrateLegacyExplorerSettingsTabs({
      s: { id: "s", appType: "explorer-settings", title: "Explorer Settings", isPreview: false },
    });
    expect(out.s).toEqual({
      id: "s",
      appType: "config-editor",
      title: "Explorer Settings",
      isPreview: false,
      filePath: "config:openp41ge-extension-explorer",
      config: { extensionId: "openp41ge-extension-explorer" },
    });
  });

  it("leaves other tabs as they are", () => {
    const tabs = {
      f: { id: "f", appType: "file-viewer", title: "a.ts", config: { filePath: "/a" } },
    };
    expect(migrateLegacyExplorerSettingsTabs(tabs)).toBe(tabs);
  });
});
