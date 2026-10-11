/**
 * Unit tests for the extension-id migration (package naming convention,
 * Phase 3): saved app types that embed a pre-rename extension id
 * (`ext:openp41ge-explorer:…`, `ext:openp41ge-workspaces:…`) are rewritten to
 * the new ids when a workspace file or saved layout is read.
 */
import { describe, it, expect } from "vitest";
import { migrateLegacyExtensionAppType } from "@openp41ge/layout/legacy-extension-ids";
import { migrateWorkspaceFileData } from "@openp41ge/layout/workspace-file";
import { deserialize, serialize } from "@openp41ge/layout/serialization";
import * as types from "@openp41ge/layout/types";
import * as ops from "@openp41ge/layout/operations";

describe("migrateLegacyExtensionAppType", () => {
  it("rewrites the pre-rename extension ids", () => {
    expect(migrateLegacyExtensionAppType("ext:openp41ge-explorer:explorer")).toBe(
      "ext:openp41ge-extension-explorer:explorer",
    );
    expect(migrateLegacyExtensionAppType("ext:openp41ge-workspaces:workspace-editor")).toBe(
      "ext:openp41ge-extension-workspaces:workspace-editor",
    );
  });

  it("is idempotent and leaves other app types alone", () => {
    for (const t of [
      "ext:openp41ge-extension-explorer:explorer",
      "ext:someone-else:pane",
      "file-viewer",
      "agents",
      "ext:openp41ge-explorer-fork:x",
    ]) {
      expect(migrateLegacyExtensionAppType(t)).toBe(t);
    }
  });
});

describe("workspace file migration", () => {
  it("rewrites systemTabs and editorTabs app types", () => {
    const data = migrateWorkspaceFileData({
      id: "w",
      systemTabs: {
        "sys-1": { id: "sys-1", appType: "ext:openp41ge-explorer:explorer", title: "Explorer" },
        "sys-2": { id: "sys-2", appType: "ext:openp41ge-extension-git:history", title: "History" },
      },
      editorTabs: {
        t1: { id: "t1", appType: "ext:openp41ge-workspaces:workspace-editor", title: "WS" },
        t2: { id: "t2", appType: "file-viewer", title: "a.ts" },
      },
      sharedSidebars: {
        leftSidebarTabs: ["sys-1", "sys-2"],
        rightSidebarTabs: [],
        leftSidebarOpen: true,
        rightSidebarOpen: false,
      },
    });
    const sys = data.systemTabs as Record<string, { appType: string }>;
    const ed = data.editorTabs as Record<string, { appType: string }>;
    expect(sys["sys-1"].appType).toBe("ext:openp41ge-extension-explorer:explorer");
    expect(sys["sys-2"].appType).toBe("ext:openp41ge-extension-git:history");
    expect(ed.t1.appType).toBe("ext:openp41ge-extension-workspaces:workspace-editor");
    expect(ed.t2.appType).toBe("file-viewer");
    // The renamed sidebar tab is kept (not stripped as obsolete).
    expect(data.sharedSidebars?.leftSidebarTabs).toEqual(["sys-1", "sys-2"]);
  });
});

describe("saved layout (state store) migration", () => {
  it("rewrites app types when a saved layout is deserialized", () => {
    let ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    ws = ops.addTabToCell(
      ws,
      winId,
      types.createTab("t1", "ext:openp41ge-workspaces:workspace-editor", "WS"),
      0,
      0,
    );
    ws = ops.openSystemTab(ws, winId, "left", "ext:openp41ge-explorer:explorer", "Explorer", true);
    const restored = deserialize(serialize(ws));
    expect(restored.editorTabs["t1"].appType).toBe(
      "ext:openp41ge-extension-workspaces:workspace-editor",
    );
    expect(Object.values(restored.systemTabs).map((t) => t.appType)).toContain(
      "ext:openp41ge-extension-explorer:explorer",
    );
  });
});
