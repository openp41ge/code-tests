/**
 * Regression tests for the dispatch handler's new-window path.
 *
 * Bug: `actionOpenFileInNewWindow` (a file dragged out of every window) and
 * `detachTabToWindow` created the new BrowserWindow WITHOUT the sender's
 * workspace binding. The new window could not resolve its workspace, fell back
 * to the "first window" state, and showed neither the opened file nor the
 * workspace in its title bar.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const handlers = new Map<string, (...args: unknown[]) => unknown>();
const createOpenp41geWindow = vi.fn();
const senderWindows = new Map<string, { webContents: unknown }>();

vi.mock("electron", () => ({
  ipcMain: {
    on: (ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn),
    handle: (ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn),
  },
  BrowserWindow: { fromWebContents: () => null },
}));

vi.mock("../../../electron/window-manager.js", () => ({
  openp41geWindows: senderWindows,
  createOpenp41geWindow: (...args: unknown[]) => createOpenp41geWindow(...args),
  closeOrphanedWindows: vi.fn(),
  workspacePathForSender: () => "/ws/demo.openp41ge-workspace",
}));

vi.mock("../../../electron/confirm-dialog-manager.js", () => ({ showConfirm: vi.fn() }));

const { registerDispatchHandlers } =
  await import("../../../electron/ipc-handlers/dispatch-handler");

function setup(windowIdsAfterApply: string[]) {
  const sender = {};
  senderWindows.clear();
  senderWindows.set("win-1", { webContents: sender });
  const dispatcher = {
    apply: vi.fn(() => true),
    broadcast: vi.fn(),
    getWorkspace: () => ({ windows: windowIdsAfterApply.map((id) => ({ id })) }),
  };
  registerDispatchHandlers(() => dispatcher as never);
  return { event: { sender } };
}

describe("dispatch handler — new window binding", () => {
  beforeEach(() => {
    handlers.clear();
    createOpenp41geWindow.mockClear();
  });

  it("binds a file-drag new window to the sender's workspace", () => {
    const { event } = setup(["win-1", "win-new"]);
    handlers.get("openp41ge:dispatch")!(
      event,
      JSON.stringify({
        fn: "actionOpenFileInNewWindow",
        args: ["/r/a.ts", "a.ts", "win-1", 100, 200],
      }),
    );
    expect(createOpenp41geWindow).toHaveBeenCalledTimes(1);
    const [id, , , x, y, meta] = createOpenp41geWindow.mock.calls[0];
    expect(id).toBe("win-new");
    expect([x, y]).toEqual([100, 200]);
    expect(meta).toMatchObject({ workspacePath: "/ws/demo.openp41ge-workspace" });
  });

  it("binds a detached-tab new window to the sender's workspace", () => {
    const { event } = setup(["win-1", "win-new"]);
    handlers.get("openp41ge:dispatch")!(
      event,
      JSON.stringify({ fn: "detachTabToWindow", args: ["win-1", "tab-1", {}] }),
    );
    expect(createOpenp41geWindow.mock.calls[0][5]).toMatchObject({
      workspacePath: "/ws/demo.openp41ge-workspace",
    });
  });
});
