// @vitest-environment jsdom
/**
 * Integration tests for Openp41geTabsEventHandler — the event translation layer
 * between openp41ge-core-tabs CustomEvents and the Openp41ge command bus.
 *
 * Simulates openp41ge-core-tabs CustomEvents on document and verifies the correct
 * command-bus operations are dispatched.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Openp41geTabsEventHandler } from "@openp41ge/renderer/services/openp41ge-tabs-event-handler";
import { registerAppType } from "@openp41ge/renderer/apps/app-registry";

type DispatchSpy = ReturnType<typeof vi.fn>;

describe("Openp41geTabsEventHandler — command wiring", () => {
  let eventHandler: Openp41geTabsEventHandler;
  let dispatchSpy: DispatchSpy;
  let mockCommandBus: { dispatch: DispatchSpy };

  beforeEach(() => {
    dispatchSpy = vi.fn();
    mockCommandBus = { dispatch: dispatchSpy };
    eventHandler = new Openp41geTabsEventHandler();
    eventHandler.init(mockCommandBus as any);
  });

  afterEach(() => {
    eventHandler.destroy();
  });

  // ── Tab bar reorder ─────────────────────────────────────────────

  it("translates tab-bar-reorder to reorderTabsInCell", () => {
    document.dispatchEvent(
      new CustomEvent("tab-bar-reorder", {
        detail: { winId: "w1", col: 2, fromIndex: 0, toIndex: 3 },
      }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith(
      "reorderTabsInCell",
      "w1",
      0, // row (always 0 for column-based grid)
      2, // col
      0, // fromIndex
      3, // toIndex
    );
  });

  // ── Tab bar cross-cell move ─────────────────────────────────────

  it("translates tab-bar-move-cell to moveTabBetweenCells", () => {
    document.dispatchEvent(
      new CustomEvent("tab-bar-move-cell", {
        detail: {
          sourceWinId: "w1",
          tabId: "t1",
          targetWinId: "w1",
          targetCol: 1,
          dropIndex: 0,
        },
      }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith(
      "moveTabBetweenCells",
      "w1",
      "t1",
      "w1",
      0, // targetRow (always 0)
      1, // targetCol
      0, // dropIndex
    );
  });

  // ── Grid split (boundary drop) ──────────────────────────────────

  it("translates grid-split to splitTabFromCell", () => {
    document.dispatchEvent(
      new CustomEvent("grid-split", {
        detail: {
          sourceWinId: "w1",
          winId: "w1",
          tabId: "t1",
          splitCol: 1,
          splitLeft: true,
        },
      }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith(
      "splitTabFromCell",
      "w1",
      "t1",
      1, // splitCol
      true, // splitLeft
    );
  });

  // ── Grid move (cell drop) ───────────────────────────────────────

  it("translates grid-move to moveTabBetweenCells", () => {
    document.dispatchEvent(
      new CustomEvent("grid-move", {
        detail: {
          sourceWinId: "w1",
          tabId: "t1",
          targetWinId: "w1",
          targetCol: 2,
          insertAt: -1,
        },
      }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith(
      "moveTabBetweenCells",
      "w1",
      "t1",
      "w1",
      0, // targetRow (always 0)
      2, // targetCol
      -1, // insertAt
    );
  });

  // ── Grid activate (same-cell drop) ──────────────────────────────

  it("translates grid-activate to activateTabInCell", () => {
    document.dispatchEvent(
      new CustomEvent("grid-activate", {
        detail: { winId: "w1", tabId: "t1" },
      }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith("activateTabInCell", "w1", "t1");
  });

  // ── Grid remove (duplicate file path) ───────────────────────────

  it("translates grid-remove to removeTabFromCell", () => {
    document.dispatchEvent(
      new CustomEvent("grid-remove", {
        detail: { winId: "w1", tabId: "t1" },
      }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith("removeTabFromCell", "w1", "t1");
  });

  // ── Grid open tab (file drop on cell center) ────────────────────

  it("translates grid-open-tab to actionOpenFile", () => {
    // Needs a <tab-grid> element in the DOM for _findWinId()
    const grid = document.createElement("tab-grid");
    (grid as any).winId = "w1";
    grid.style.display = "none";
    document.body.appendChild(grid);

    document.dispatchEvent(
      new CustomEvent("grid-open-tab", {
        detail: {
          tabType: "file-viewer",
          tabConfig: { filePath: "/path/to/file.ts" },
          targetCol: 0,
        },
      }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith(
      "actionOpenFile",
      "w1",
      "file-viewer",
      "file.ts",
      "/path/to/file.ts",
      0,
      true,
    );

    document.body.removeChild(grid);
  });

  it("opens right of a tab (nextToTabId) with openTabInNextCell, unpinned by default", () => {
    const grid = document.createElement("tab-grid");
    (grid as any).winId = "w1";
    grid.style.display = "none";
    document.body.appendChild(grid);

    document.dispatchEvent(
      new CustomEvent("grid-open-tab", {
        detail: {
          tabType: "file-viewer",
          tabConfig: { filePath: "/path/to/file.ts" },
          targetCol: 0,
          nextToTabId: "t9",
          pinned: false,
        },
      }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith(
      "openTabInNextCell",
      "w1",
      "t9",
      "file-viewer",
      "file.ts",
      "/path/to/file.ts",
      false,
    );

    document.body.removeChild(grid);
  });

  it("passes a tab-bar insert position (insertAt) through to actionOpenFile", () => {
    const grid = document.createElement("tab-grid");
    (grid as any).winId = "w1";
    grid.style.display = "none";
    document.body.appendChild(grid);

    document.dispatchEvent(
      new CustomEvent("grid-open-tab", {
        detail: {
          tabType: "file-viewer",
          tabConfig: { filePath: "/path/to/file.ts" },
          targetCol: 1,
          insertAt: 2,
          pinned: true,
        },
      }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith(
      "actionOpenFile",
      "w1",
      "file-viewer",
      "file.ts",
      "/path/to/file.ts",
      1,
      true,
      undefined,
      2,
    );

    document.body.removeChild(grid);
  });

  // ── Grid open tab (worktree drop) ──────────────────────────────

  it("opens a system-scoped log-viewer tab on a log-system drop", () => {
    const grid = document.createElement("tab-grid");
    (grid as any).winId = "w1";
    grid.style.display = "none";
    document.body.appendChild(grid);

    document.dispatchEvent(
      new CustomEvent("grid-open-tab", {
        detail: {
          tabType: "log-viewer",
          tabConfig: { system: "openp41ge" },
          targetCol: 0,
          pinned: true,
        },
      }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith(
      "actionOpenFile",
      "w1",
      "log-viewer",
      "openp41ge",
      undefined,
      0,
      true,
      { system: "openp41ge" },
    );

    document.body.removeChild(grid);
  });

  it("splits a new column on a boundary log-system drop", () => {
    const grid = document.createElement("tab-grid");
    (grid as any).winId = "w1";
    grid.style.display = "none";
    document.body.appendChild(grid);

    document.dispatchEvent(
      new CustomEvent("grid-open-tab", {
        detail: {
          tabType: "log-viewer",
          tabConfig: { system: "openp41ge-terminal" },
          targetCol: 0,
          isBoundary: true,
          splitCol: 0,
          splitLeft: true,
          pinned: true,
        },
      }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith(
      "splitFileOpen",
      "w1",
      "log-viewer",
      "openp41ge-terminal",
      undefined,
      0,
      true,
      { system: "openp41ge-terminal" },
    );

    document.body.removeChild(grid);
  });

  // ── Tab close button click ──────────────────────────────────────

  // ── Grid open tab — characterization of the per-app translations ──

  function withGrid(fn: () => void): void {
    const grid = document.createElement("tab-grid");
    (grid as any).winId = "w1";
    grid.style.display = "none";
    document.body.appendChild(grid);
    try {
      fn();
    } finally {
      document.body.removeChild(grid);
    }
  }

  function openTab(detail: Record<string, unknown>): void {
    document.dispatchEvent(new CustomEvent("grid-open-tab", { detail }));
  }

  it("splits a new column on a boundary file drop", () => {
    withGrid(() => {
      openTab({
        tabType: "file-viewer",
        tabConfig: { filePath: "/p/a.ts" },
        targetCol: 0,
        isBoundary: true,
        splitCol: 1,
        splitLeft: false,
      });
      expect(dispatchSpy).toHaveBeenCalledWith(
        "splitFileOpen",
        "w1",
        "file-viewer",
        "a.ts",
        "/p/a.ts",
        1,
        false,
      );
    });
  });

  it("ignores a drop whose required config is missing", () => {
    withGrid(() => {
      openTab({ tabType: "log-viewer", tabConfig: {}, targetCol: 0 });
      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });

  // ── Grid open tab — extension panes (generic path) ───────────────

  it("opens a registered extension pane with its tab config (payload) as tab data", () => {
    registerAppType({
      id: "ext:demo:viewer",
      label: "Viewer",
      icon: "V",
      description: "Viewer",
      createController: () => undefined as never,
    });
    withGrid(() => {
      const payload = { kind: "file-path", filePath: "/p/a.ts" };
      openTab({ tabType: "ext:demo:viewer", tabConfig: { payload }, targetCol: 1, pinned: true });
      expect(dispatchSpy).toHaveBeenCalledWith(
        "actionOpenFile",
        "w1",
        "ext:demo:viewer",
        "Viewer",
        undefined,
        1,
        true,
        { payload },
      );
    });
  });

  it("splits a new column for an extension pane on a boundary drop", () => {
    registerAppType({
      id: "ext:demo:viewer",
      label: "Viewer",
      icon: "V",
      description: "Viewer",
      createController: () => undefined as never,
    });
    withGrid(() => {
      openTab({
        tabType: "ext:demo:viewer",
        tabConfig: { payload: { kind: "chat-thread", chatId: "c" } },
        targetCol: 0,
        isBoundary: true,
        splitCol: 0,
        splitLeft: false,
      });
      expect(dispatchSpy).toHaveBeenCalledWith(
        "splitFileOpen",
        "w1",
        "ext:demo:viewer",
        "Viewer",
        undefined,
        0,
        false,
        { payload: { kind: "chat-thread", chatId: "c" } },
      );
    });
  });

  it("ignores an unregistered app type instead of opening it as a file", () => {
    withGrid(() => {
      openTab({ tabType: "ext:missing:pane", tabConfig: {}, targetCol: 0 });
      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });

  it("handles click on .tab-close button and dispatches removeTabFromCell", () => {
    // Create a minimal tab-bar element in the DOM
    const bar = document.createElement("tab-bar");
    (bar as any).winId = "w1";
    bar.style.display = "none";
    document.body.appendChild(bar);

    const closeBtn = document.createElement("span");
    closeBtn.className = "tab-close";
    closeBtn.setAttribute("data-close-tab-id", "t1");
    bar.appendChild(closeBtn);

    closeBtn.click();

    expect(dispatchSpy).toHaveBeenCalledWith("removeTabFromCell", "w1", "t1");

    document.body.removeChild(bar);
  });

  // ── Destruction cleanup ─────────────────────────────────────────

  it("stops dispatching events after destroy()", () => {
    eventHandler.destroy();

    document.dispatchEvent(
      new CustomEvent("tab-bar-reorder", {
        detail: { winId: "w1", col: 0, fromIndex: 0, toIndex: 1 },
      }),
    );

    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});
