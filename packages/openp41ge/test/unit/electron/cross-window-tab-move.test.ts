/**
 * Moving a grid tab to another window (plans/2026-10-14-one-window.md, step
 * 5). Windows of the same workspace share its state: the tab moves within it,
 * as before. Between windows of different workspaces (or none) only a tab
 * that needs no workspace moves: it opens in the target window's state and
 * closes in the source's. Any other tab stays where it is.
 */
import { describe, it, expect } from "vitest";
import * as types from "@openp41ge/layout/types";
import * as ops from "@openp41ge/layout/operations";
import { OperationDispatcher } from "@openp41ge/main/services/operation-dispatcher";
import { moveTabAcrossWindows } from "../../../electron/cross-window-tab-move";

const FREE = ["config-editor", "release", "log-viewer"];

/** A state with one window holding a log tab and a file tab. */
function stateWith(winTabs: boolean): { d: OperationDispatcher; winId: string } {
  let ws = types.createWorkspace("ws");
  const winId = ws.windows[0].id;
  if (winTabs) {
    ws = ops.addTabToCell(
      ws,
      winId,
      types.createTab("log1", "log-viewer", "openp41ge", {
        system: "openp41ge",
        filePath: "log:openp41ge",
      }),
      0,
      0,
    );
    ws = ops.addTabToCell(
      ws,
      winId,
      types.createTab("file1", "file-viewer", "a.ts", { filePath: "/a.ts" }),
      0,
      0,
    );
  }
  const d = new OperationDispatcher();
  d.setWorkspace(ws);
  return { d, winId };
}

const tabsOf = (d: OperationDispatcher, winId: string) => {
  const ws = d.getWorkspace();
  const win = ws.windows.find((w) => w.id === winId)!;
  return win.grid.placements.flatMap((p) => p.tabIds).map((id) => ws.editorTabs[id as string]);
};

describe("moveTabAcrossWindows between different workspaces", () => {
  function twoWorkspaces() {
    const a = stateWith(true);
    let b = stateWith(false);
    // Distinct window ids for the two states.
    b.d.apply("newWindow", []);
    const bWin = b.d.getWorkspace().windows.at(-1)!.id;
    const of = (winId: string) => (winId === a.winId ? a.d : winId === bWin ? b.d : null);
    return { a, b: { d: b.d, winId: bWin }, of };
  }

  it("moves a tab that needs no workspace: opens it in the target, closes it in the source", () => {
    const { a, b, of } = twoWorkspaces();
    const result = moveTabAcrossWindows(
      { sourceWinId: a.winId, tabId: "log1", targetWinId: b.winId, col: 0, index: -1 },
      of,
      FREE,
    );
    expect(result).toBe("moved");
    expect(tabsOf(a.d, a.winId).map((t) => t.appType)).toEqual(["file-viewer"]);
    const moved = tabsOf(b.d, b.winId);
    expect(moved.map((t) => [t.appType, t.title, t.config.system])).toEqual([
      ["log-viewer", "openp41ge", "openp41ge"],
    ]);
  });

  it("splits it into a new column of the target", () => {
    const { a, b, of } = twoWorkspaces();
    expect(
      moveTabAcrossWindows(
        {
          sourceWinId: a.winId,
          tabId: "log1",
          targetWinId: b.winId,
          col: 0,
          index: -1,
          splitLeft: false,
        },
        of,
        FREE,
      ),
    ).toBe("moved");
    expect(tabsOf(b.d, b.winId).map((t) => t.appType)).toEqual(["log-viewer"]);
  });

  it("leaves a tab that needs a workspace where it is", () => {
    const { a, b, of } = twoWorkspaces();
    expect(
      moveTabAcrossWindows(
        { sourceWinId: a.winId, tabId: "file1", targetWinId: b.winId, col: 0, index: -1 },
        of,
        FREE,
      ),
    ).toBe("refused");
    expect(tabsOf(a.d, a.winId).map((t) => t.appType)).toEqual(["log-viewer", "file-viewer"]);
    expect(tabsOf(b.d, b.winId)).toEqual([]);
  });
});

describe("moveTabAcrossWindows within one workspace", () => {
  it("moves any tab, within the shared state", () => {
    const a = stateWith(true);
    a.d.apply("newWindow", []);
    const other = a.d.getWorkspace().windows.at(-1)!.id;
    expect(
      moveTabAcrossWindows(
        { sourceWinId: a.winId, tabId: "file1", targetWinId: other, col: 0, index: -1 },
        () => a.d,
        FREE,
      ),
    ).toBe("moved");
    expect(tabsOf(a.d, other).map((t) => t.id)).toEqual(["file1"]);
  });
});
