/**
 * Saved tabs of the retired platform agents open as the agents extension's:
 * a chat tab as its chat tab, the Agents sidebar tab as its Agents sidebar.
 */
import { describe, it, expect } from "vitest";
import {
  migrateLegacyAgentsEditorTabs,
  migrateLegacyAgentsSystemTabs,
} from "@openp41ge/layout/legacy-agents-tabs";

const EXT = "ext:openp41ge-extension-agents";

describe("migrateLegacyAgentsEditorTabs", () => {
  it("opens a saved chat tab as the extension's chat tab", () => {
    const out = migrateLegacyAgentsEditorTabs({
      a: { id: "a", appType: "agents", title: "Agent", config: { chatId: "c1", filePath: "c1" } },
      b: { id: "b", appType: "agents", title: "Agent", config: { filePath: "c2", cwd: "/w" } },
    });
    expect(out.a).toEqual({
      id: "a",
      appType: `${EXT}:chat`,
      title: "Agent",
      config: { chatId: "c1", filePath: "c1" },
    });
    expect(out.b.config).toEqual({ chatId: "c2", filePath: "c2", cwd: "/w" });
  });

  it("leaves a chat tab without a chat, and other tabs, as they are", () => {
    const tabs = {
      a: { id: "a", appType: "agents", title: "Agent", config: {} },
      f: { id: "f", appType: "file-viewer", title: "a.ts", config: { filePath: "/a.ts" } },
    };
    expect(migrateLegacyAgentsEditorTabs(tabs)).toBe(tabs);
  });
});

describe("migrateLegacyAgentsSystemTabs", () => {
  it("opens the saved Agents sidebar tab as the extension's Agents sidebar", () => {
    const out = migrateLegacyAgentsSystemTabs({
      s: { id: "s", appType: "agents", title: "Agents" },
      g: { id: "g", appType: "ext:openp41ge-extension-git:history", title: "History" },
    });
    expect(out.s).toEqual({ id: "s", appType: `${EXT}:chats`, title: "Agents" });
    expect(out.g.appType).toBe("ext:openp41ge-extension-git:history");
  });
});
