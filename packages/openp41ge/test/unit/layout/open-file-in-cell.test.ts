/**
 * Unit tests for opening a file into a cell (`actionOpenFile` → `openTabInCell`):
 *
 *  - A cell never holds the same file twice — pinned or preview. Re-opening a
 *    file already in the target cell activates it instead (regression: a file
 *    dropped on a cell that already had it open created a duplicate tab).
 *  - Opening pinned promotes an existing preview of that file.
 *  - `insertAt` places the tab at a tab-bar position (drop on the tab bar);
 *    an existing tab for the file moves there.
 *  - An extension tab opened with a key (`OpenTabRequest.key`, kept as its
 *    `filePath`) follows the same rule: opening the key again activates it.
 */
import { describe, test, expect } from "vitest";
import * as types from "@openp41ge/layout/types";
import * as ops from "@openp41ge/layout/operations";
import type { Workspace } from "@openp41ge/layout/types";

const FILE = "/src/app.ts";

function cell(ws: Workspace, col = 0) {
  return ws.windows[0].grid.placements.find((p) => p.position.col === col)!;
}

function tabsFor(ws: Workspace, filePath: string, col = 0) {
  return cell(ws, col).tabIds.filter(
    (id) => ws.editorTabs[id as string]?.config?.filePath === filePath,
  );
}

/** A workspace whose single cell holds files a.ts, b.ts (pinned). */
function seeded(): { ws: Workspace; winId: string } {
  let ws = types.createWorkspace("ws1");
  const winId = ws.windows[0].id;
  ws = ops.addTabToCell(
    ws,
    winId,
    types.createTab("a", "file-viewer", "a.ts", { filePath: "/a.ts" }),
    0,
    0,
  );
  ws = ops.addTabToCell(
    ws,
    winId,
    types.createTab("b", "file-viewer", "b.ts", { filePath: "/b.ts" }),
    0,
    0,
  );
  return { ws, winId };
}

describe("actionOpenFile — no duplicate file in a cell", () => {
  test("re-opening a pinned file pinned activates it instead of duplicating", () => {
    let { ws, winId } = seeded();
    ws = ops.actionOpenFile(ws, winId, "file-viewer", "app.ts", FILE, 0, true);
    const first = tabsFor(ws, FILE)[0];
    ws = ops.actionOpenFile(ws, winId, "file-viewer", "a.ts", "/a.ts", 0, true);
    ws = ops.actionOpenFile(ws, winId, "file-viewer", "app.ts", FILE, 0, true);
    expect(tabsFor(ws, FILE)).toEqual([first]);
    expect(cell(ws).activeTabId).toBe(first);
  });

  test("opening pinned when the file is the preview promotes it (no duplicate)", () => {
    let { ws, winId } = seeded();
    ws = ops.actionOpenFile(ws, winId, "file-viewer", "app.ts", FILE, 0, false);
    const preview = tabsFor(ws, FILE)[0];
    expect(ws.editorTabs[preview].isPreview).toBe(true);
    ws = ops.actionOpenFile(ws, winId, "file-viewer", "app.ts", FILE, 0, true);
    expect(tabsFor(ws, FILE)).toEqual([preview]);
    expect(ws.editorTabs[preview].isPreview).toBe(false);
  });

  test("opening as preview when the file is pinned activates the pinned tab", () => {
    let { ws, winId } = seeded();
    ws = ops.actionOpenFile(ws, winId, "file-viewer", "app.ts", FILE, 0, true);
    const pinned = tabsFor(ws, FILE)[0];
    ws = ops.actionOpenFile(ws, winId, "file-viewer", "app.ts", FILE, 0, false);
    expect(tabsFor(ws, FILE)).toEqual([pinned]);
    expect(ws.editorTabs[pinned].isPreview).toBe(false);
    expect(cell(ws).activeTabId).toBe(pinned);
  });

  test("the same file may still be open in a different cell", () => {
    let { ws, winId } = seeded();
    ws = ops.actionOpenFile(ws, winId, "file-viewer", "app.ts", FILE, 0, true);
    ws = ops.actionOpenFile(ws, winId, "file-viewer", "app.ts", FILE, 1, true);
    expect(tabsFor(ws, FILE, 0)).toHaveLength(1);
    expect(tabsFor(ws, FILE, 1)).toHaveLength(1);
  });
});

describe("actionOpenFile — insertAt (drop on a tab-bar position)", () => {
  test("inserts a new file tab at the given index", () => {
    let { ws, winId } = seeded();
    ws = ops.actionOpenFile(ws, winId, "file-viewer", "app.ts", FILE, 0, true, undefined, 1);
    const ids = cell(ws).tabIds;
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe("a");
    expect(ws.editorTabs[ids[1] as string].config.filePath).toBe(FILE);
    expect(ids[2]).toBe("b");
    expect(cell(ws).activeTabId).toBe(ids[1]);
  });

  test("moves an existing tab for the file to the index instead of duplicating", () => {
    let { ws, winId } = seeded();
    // b.ts is at index 1; drop it again at index 0.
    ws = ops.actionOpenFile(ws, winId, "file-viewer", "b.ts", "/b.ts", 0, true, undefined, 0);
    expect(cell(ws).tabIds).toEqual(["b", "a"]);
    expect(cell(ws).activeTabId).toBe("b");
  });

  test("a null index (an undefined arg after the JSON IPC round-trip) appends", () => {
    let { ws, winId } = seeded();
    ws = ops.actionOpenFile(
      ws,
      winId,
      "file-viewer",
      "app.ts",
      FILE,
      0,
      true,
      null as never,
      null as never,
    );
    expect(cell(ws).tabIds.slice(0, 2)).toEqual(["a", "b"]);
    expect(ws.editorTabs[cell(ws).tabIds[2] as string].config.filePath).toBe(FILE);
  });

  test("an index past the end appends", () => {
    let { ws, winId } = seeded();
    ws = ops.actionOpenFile(ws, winId, "file-viewer", "a.ts", "/a.ts", 0, true, undefined, 2);
    expect(cell(ws).tabIds).toEqual(["b", "a"]);
  });
});

describe("moveTabBetweenCells — no duplicate file in the target cell", () => {
  /** Cell 0: a.ts, b.ts. Cell 1: x.ts, a.ts (a second tab for /a.ts). */
  function twoCells(): { ws: Workspace; winId: string } {
    let { ws, winId } = seeded();
    ws = ops.resizeGrid(ws, winId, 1, 2);
    ws = ops.addTabToCell(
      ws,
      winId,
      types.createTab("x", "file-viewer", "x.ts", { filePath: "/x.ts" }),
      0,
      1,
    );
    ws = ops.addTabToCell(
      ws,
      winId,
      types.createTab("a2", "file-viewer", "a.ts", { filePath: "/a.ts" }),
      0,
      1,
    );
    return { ws, winId };
  }

  test("moving a file tab into a cell that already has the file merges into the existing tab", () => {
    let { ws, winId } = twoCells();
    // Drag a.ts (cell 1) onto cell 0's tab bar at index 2.
    ws = ops.moveTabBetweenCells(ws, winId, "a2", winId, 0, 0, 2);
    expect(cell(ws, 0).tabIds).toEqual(["b", "a"]);
    expect(cell(ws, 0).activeTabId).toBe("a");
    expect(cell(ws, 1).tabIds).toEqual(["x"]);
  });

  test("moving a file tab into a cell without that file still moves it", () => {
    let { ws, winId } = twoCells();
    ws = ops.moveTabBetweenCells(ws, winId, "b", winId, 0, 1, 0);
    expect(cell(ws, 1).tabIds).toEqual(["b", "x", "a2"]);
  });
});

describe("no-duplicate rule: other tabs keyed by identity", () => {
  // A log stream ("log:<system>"), a settings editor ("config:<id>") and a
  // release ("release:<tag>") open once per cell, like a file.
  test.each([
    ["log-viewer", "openp41ge", "log:openp41ge"],
    ["config-editor", "Platform Settings", "config:openp41ge"],
    ["release", "v0.1.0-alpha.16", "release:v0.1.0-alpha.16"],
  ])("re-opening a %s tab activates it instead of duplicating", (appType, title, key) => {
    let { ws, winId } = seeded();
    ws = ops.actionOpenFile(ws, winId, appType, title, key, 0, true);
    const first = tabsFor(ws, key)[0];
    ws = ops.actionOpenFile(ws, winId, "file-viewer", "a.ts", "/a.ts", 0, true);
    ws = ops.actionOpenFile(ws, winId, appType, title, key, 0, false);
    expect(tabsFor(ws, key)).toEqual([first]);
    expect(cell(ws).activeTabId).toBe(first);
  });
});

describe("no-duplicate rule applies to files and identity-keyed tabs only", () => {
  test("two git worktree tabs of the same repo may share a cell (filePath slot = repo name)", () => {
    let { ws, winId } = seeded();
    ws = ops.actionOpenFile(ws, winId, "git-repository", "main", "acme", 0, true);
    ws = ops.actionOpenFile(ws, winId, "git-repository", "feature-x", "acme", 0, true);
    const gitTabs = cell(ws).tabIds.filter(
      (id) => ws.editorTabs[id as string]?.appType === "git-repository",
    );
    expect(gitTabs).toHaveLength(2);
  });
});

describe("actionOpenFile — an extension tab's key", () => {
  const CHAT = "ext:x:chat";

  test("opening a key as a preview activates its pinned tab instead of adding a preview", () => {
    let { ws, winId } = seeded();
    ws = ops.actionOpenFile(ws, winId, CHAT, "Agent", "c1", 0, true, { chatId: "c1" });
    const chat = tabsFor(ws, "c1")[0];
    ws = ops.actionOpenFile(ws, winId, "file-viewer", "a.ts", "/a.ts", 0, true);
    ws = ops.actionOpenFile(ws, winId, CHAT, "Agent", "c1", 0, false, { chatId: "c1" });
    expect(tabsFor(ws, "c1")).toEqual([chat]);
    expect(cell(ws).activeTabId).toBe(chat);
    expect(ws.editorTabs[chat as string].isPreview).toBe(false);
  });

  test("a different key still opens its own tab", () => {
    let { ws, winId } = seeded();
    ws = ops.actionOpenFile(ws, winId, CHAT, "Agent", "c1", 0, true, { chatId: "c1" });
    ws = ops.actionOpenFile(ws, winId, CHAT, "Agent", "c2", 0, true, { chatId: "c2" });
    expect(tabsFor(ws, "c1")).toHaveLength(1);
    expect(tabsFor(ws, "c2")).toHaveLength(1);
  });
});
