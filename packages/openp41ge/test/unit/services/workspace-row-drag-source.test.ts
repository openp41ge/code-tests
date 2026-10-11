/**
 * Unit tests for WorkspaceRowDragSource — the Window Manager workspace-row
 * drag source.
 *
 * A row dragged from the Workspaces sidebar uses the generic `open-tab`
 * payload so a drop on the manager grid opens a workspace-editor cell with a
 * `tabConfig` pointing at the workspace's `.openp41ge-workspace` file.
 *
 * The visible ghost is a main-process DragGhostManager BrowserWindow (a
 * pixel-accurate bitmap of the source row), so the in-DOM ghost is invisible
 * and the source row is never dimmed.
 */

import { describe, it, expect } from "vitest";
import { WorkspaceRowDragSource } from "@openp41ge/renderer/services/drag-sources/workspace-row-drag-source";

describe("WorkspaceRowDragSource", () => {
  test("getDragData reports an open-tab payload pointing at the workspace file", () => {
    const source = new WorkspaceRowDragSource("ext:openp41ge-extension-workspaces:workspace-editor", "Alpha", {
      path: "/w/a",
      dir: "/data/workspaces",
    });
    expect(source.getDragData()).toEqual({
      type: "open-tab",
      appType: "ext:openp41ge-extension-workspaces:workspace-editor",
      title: "Alpha",
      tabConfig: { path: "/w/a", dir: "/data/workspaces" },
    });
  });

  test("createGhost returns an invisible, inert element", () => {
    const source = new WorkspaceRowDragSource("ext:openp41ge-extension-workspaces:workspace-editor", "Alpha", {});
    const ghost = source.createGhost();
    expect(ghost.style.opacity).toBe("0");
    expect(ghost.style.pointerEvents).toBe("none");
  });

  test("onDragStart does not dim the source row", () => {
    const source = new WorkspaceRowDragSource("ext:openp41ge-extension-workspaces:workspace-editor", "Alpha", {});
    expect(() => source.onDragStart()).not.toThrow();
  });

  test("onDragEnd is a no-op (the ghost is owned by the manager)", () => {
    const source = new WorkspaceRowDragSource("ext:openp41ge-extension-workspaces:workspace-editor", "Alpha", {});
    expect(() => source.onDragEnd({ success: false })).not.toThrow();
  });
});
