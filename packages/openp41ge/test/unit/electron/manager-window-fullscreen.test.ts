/**
 * The management window can go fullscreen: it is created fullscreenable
 * (still frameless, drawing its own traffic lights), and its green light
 * asks `window:toggleFullScreen`, which toggles the sender's fullscreen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const created: Array<Record<string, unknown>> = [];
const handlers = new Map<string, (...args: unknown[]) => unknown>();
const target = { fullScreen: false, setFullScreen: vi.fn(), isFullScreen: () => target.fullScreen };

vi.mock("electron", () => {
  class BrowserWindow {
    static fromWebContents = () => target;
    static getAllWindows = () => [];
    webContents = { on: vi.fn(), send: vi.fn(), id: 1 };
    constructor(options: Record<string, unknown>) {
      created.push(options);
    }
    on = vi.fn();
    once = vi.fn();
    loadURL = vi.fn();
    loadFile = vi.fn();
    isDestroyed = () => false;
    getBounds = () => ({ x: 0, y: 0, width: 800, height: 600 });
  }
  const display = { workArea: { x: 0, y: 0, width: 1920, height: 1080 } };
  return {
    app: { isPackaged: false, getPath: () => "/tmp", on: vi.fn() },
    BrowserWindow,
    screen: {
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      getDisplayNearestPoint: () => display,
      getDisplayMatching: () => display,
    },
    ipcMain: {
      on: (ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn),
      handle: (ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn),
    },
  };
});

vi.mock("../../../electron/confirm-dialog-manager.js", () => ({ showConfirm: vi.fn() }));
vi.mock("../../../electron/app-title.js", () => ({
  appTitle: () => "openp41ge code",
  keepWindowTitle: vi.fn(),
}));

const { createOpenp41geWindow } = await import("../../../electron/window-manager");
const { registerWindowHandlers } = await import("../../../electron/ipc-handlers/window-handlers");

beforeEach(() => {
  created.length = 0;
  target.setFullScreen.mockClear();
});

describe("management window: fullscreen", () => {
  it("is created frameless but fullscreenable", () => {
    createOpenp41geWindow("wm-1", false, undefined, undefined, undefined, {
      windowType: "manager",
    });
    expect(created[0]).toMatchObject({ frame: false });
    expect(created[0].fullscreenable).not.toBe(false);
  });

  it("window:toggleFullScreen toggles the sender's fullscreen", () => {
    registerWindowHandlers(() => null, {} as never);
    const toggle = handlers.get("window:toggleFullScreen")!;
    expect(toggle).toBeTypeOf("function");
    target.fullScreen = false;
    toggle({ sender: {} });
    expect(target.setFullScreen).toHaveBeenLastCalledWith(true);
    target.fullScreen = true;
    toggle({ sender: {} });
    expect(target.setFullScreen).toHaveBeenLastCalledWith(false);
  });
});
