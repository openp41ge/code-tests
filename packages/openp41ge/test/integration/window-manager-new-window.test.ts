/**
 * Integration tests for `openNewWindow`, the window with no workspace open
 * that the app starts in (and Window > New Window opens): it adds a window to
 * the no-workspace state and opens nothing in it. Workspaces are opened from
 * the title bar's picker, so the window's sidebars start without the
 * Workspaces tab.
 *
 * The `electron` module is mocked because it is a Node/Electron runtime module
 * unavailable under vitest's jsdom environment.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("electron", () => {
  class MockBrowserWindow {
    webContents = { on: vi.fn(), send: vi.fn() };
    on = vi.fn();
    loadFile = vi.fn();
    loadURL = vi.fn();
    setTitle = vi.fn();
    isDestroyed(): boolean {
      return false;
    }
    static getFocusedWindow(): null {
      return null;
    }
  }
  const display = { workArea: { x: 0, y: 0, width: 1920, height: 1080 } };
  return {
    app: { isPackaged: true },
    BrowserWindow: MockBrowserWindow,
    dialog: {},
    screen: {
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      getDisplayNearestPoint: () => display,
      getDisplayMatching: () => display,
    },
  };
});

import {
  openp41geWindows,
  openp41geWindowMeta,
  openNewWindow,
  setDispatcher,
} from "../../electron/window-manager.js";

describe("openNewWindow", () => {
  beforeEach(() => {
    openp41geWindows.clear();
    openp41geWindowMeta.clear();
  });

  it("opens a window with no workspace and no tab in its sidebars", () => {
    const windows: { id: string }[] = [];
    const apply = vi.fn((op: string) => {
      if (op === "newWindow") windows.push({ id: `win-${windows.length + 1}` });
    });
    setDispatcher({ getWorkspace: () => ({ windows }), apply, broadcast: vi.fn() } as never);

    expect(openNewWindow()).toBe("win-1");

    expect(apply.mock.calls.map((c) => c[0])).toEqual(["newWindow"]);
    expect(openp41geWindowMeta.get("win-1")).toEqual({ workspacePath: null });
    expect(openp41geWindows.has("win-1")).toBe(true);
  });
});
