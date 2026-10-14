/**
 * Integration tests for the main-process window-manager helpers that back the
 * "open a workspace" path. Specifically guards `focusWorkspaceWindow` — the
 * idempotency guard that `Openp41geApplication._openWorkspaceSession` now uses
 * to avoid re-creating duplicate/stale windows when a workspace is already open.
 *
 * The `electron` module is mocked because it is a Node/Electron runtime module
 * unavailable under vitest's jsdom environment.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("electron", () => {
  class MockBrowserWindow {
    _destroyed = false;
    _focused = false;
    isDestroyed(): boolean {
      return this._destroyed;
    }
    isMinimized(): boolean {
      return false;
    }
    restore(): void {}
    focus(): void {
      this._focused = true;
    }
    static getFocusedWindow(): null {
      return null;
    }
  }
  return {
    app: { isPackaged: true },
    BrowserWindow: MockBrowserWindow,
    dialog: {},
    screen: {
      getDisplayMatching: () => ({ workArea: {} }),
      getDisplayNearestPoint: () => ({ workArea: {} }),
    },
  };
});

import {
  openp41geWindows,
  openp41geWindowMeta,
  focusWorkspaceWindow,
  closeOrphanedWindows,
  setDispatcher,
  openLogs,
  openSidebarTab,
} from "../../electron/window-manager.js";
import type { BrowserWindow } from "electron";

type AnyWin = BrowserWindow & Record<string, unknown>;

function makeWindow(): AnyWin {
  const win: AnyWin = {
    _focused: false,
    _destroyed: false,
    isDestroyed(): boolean {
      return win._destroyed as boolean;
    },
    isMinimized(): boolean {
      return false;
    },
    restore(): void {},
    focus(): void {
      win._focused = true;
    },
    close(): void {
      win._destroyed = true;
    },
    webContents: { send: vi.fn() },
  } as unknown as AnyWin;
  return win;
}

describe("focusWorkspaceWindow", () => {
  beforeEach(() => {
    openp41geWindows.clear();
    openp41geWindowMeta.clear();
  });

  it("returns false when no live window is bound to the workspace path", () => {
    openp41geWindows.set("w1", makeWindow());
    openp41geWindowMeta.set("w1", { workspacePath: "/a" });
    expect(focusWorkspaceWindow("/b")).toBe(false);
  });

  it("focuses the first live workspace window for the path and returns true", () => {
    const w = makeWindow();
    openp41geWindows.set("w1", w as BrowserWindow);
    openp41geWindowMeta.set("w1", { workspacePath: "/a" });
    expect(focusWorkspaceWindow("/a")).toBe(true);
    expect(w._focused).toBe(true);
  });

  it("skips destroyed windows", () => {
    const w = makeWindow();
    openp41geWindows.set("w1", w as BrowserWindow);
    openp41geWindowMeta.set("w1", { workspacePath: "/a" });
    (w as { _destroyed: boolean })._destroyed = true;
    expect(focusWorkspaceWindow("/a")).toBe(false);
  });

  it("does not match a window with no workspace", () => {
    const w = makeWindow();
    openp41geWindows.set("w0", w as BrowserWindow);
    openp41geWindowMeta.set("w0", { workspacePath: null });
    expect(focusWorkspaceWindow("/a")).toBe(false);
  });
});

describe("closeOrphanedWindows", () => {
  beforeEach(() => {
    openp41geWindows.clear();
    openp41geWindowMeta.clear();
    setDispatcher({
      getWorkspace: () => ({ windows: [{ id: "ws-active" }] }),
    } as never);
  });

  it("closes only the windows of that state that are absent from its layout", () => {
    const other = makeWindow();
    const unbound = makeWindow();
    const wsActive = makeWindow();
    const wsOrphan = makeWindow();

    openp41geWindows.set("other", other as BrowserWindow);
    openp41geWindowMeta.set("other", { workspacePath: "/b" });
    openp41geWindows.set("unbound", unbound as BrowserWindow);
    openp41geWindowMeta.set("unbound", { workspacePath: null });
    openp41geWindows.set("ws-active", wsActive as BrowserWindow);
    openp41geWindowMeta.set("ws-active", { workspacePath: "/a" });
    openp41geWindows.set("ws-orphan", wsOrphan as BrowserWindow);
    openp41geWindowMeta.set("ws-orphan", { workspacePath: "/a" });

    closeOrphanedWindows("/a");

    // Windows of another workspace, or of none, are not this layout's.
    expect(other.isDestroyed()).toBe(false);
    expect(unbound.isDestroyed()).toBe(false);
    expect(wsActive.isDestroyed()).toBe(false);
    expect(wsOrphan.isDestroyed()).toBe(true);
  });

  it("for the no-workspace state, never closes a window that shows a workspace", () => {
    const bound = makeWindow();
    const unboundOrphan = makeWindow();
    openp41geWindows.set("bound", bound as BrowserWindow);
    openp41geWindowMeta.set("bound", { workspacePath: "/a" });
    openp41geWindows.set("u-orphan", unboundOrphan as BrowserWindow);
    openp41geWindowMeta.set("u-orphan", { workspacePath: null });

    closeOrphanedWindows(null);

    expect(bound.isDestroyed()).toBe(false);
    expect(unboundOrphan.isDestroyed()).toBe(true);
  });
});

describe("app-level actions act on a window (there is no management or logs window)", () => {
  beforeEach(() => {
    openp41geWindows.clear();
    openp41geWindowMeta.clear();
  });

  it("opening logs opens them in the given window", () => {
    const w = makeWindow();
    openp41geWindows.set("w1", w as BrowserWindow);
    openp41geWindowMeta.set("w1", { workspacePath: "/a" });
    openLogs(w as BrowserWindow, "e-1");
    expect(
      (w.webContents as unknown as { send: ReturnType<typeof vi.fn> }).send,
    ).toHaveBeenCalledWith("logs:open-in-window", "e-1");
    expect(w._focused).toBe(true);
  });

  it("with no window given, any open window opens them", () => {
    const w = makeWindow();
    openp41geWindows.set("w1", w as BrowserWindow);
    openp41geWindowMeta.set("w1", { workspacePath: null });
    openLogs(undefined);
    expect(
      (w.webContents as unknown as { send: ReturnType<typeof vi.fn> }).send,
    ).toHaveBeenCalledWith("logs:open-in-window", null);
  });

  it("Settings opens as a sidebar tab in the window", () => {
    const apply = vi.fn();
    const broadcast = vi.fn();
    setDispatcher({ getWorkspace: () => ({ windows: [] }), apply, broadcast } as never);
    const w = makeWindow();
    openp41geWindows.set("w1", w as BrowserWindow);
    openp41geWindowMeta.set("w1", { workspacePath: null });
    openSidebarTab("settings", "Settings", w as BrowserWindow);
    expect(apply).toHaveBeenCalledWith("openSystemTab", ["w1", "left", "settings", "Settings"]);
    expect(broadcast).toHaveBeenCalled();
  });
});
