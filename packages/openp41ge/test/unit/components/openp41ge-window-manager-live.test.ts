// @vitest-environment jsdom
/**
 * The Window Manager's workspace list follows the workspace files on disk: a
 * workspace file change (from any window or extension) reloads the list, and
 * the listener goes when the manager does.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { Openp41geWindowManager } from "../../../src/renderer/components/openp41ge-window-manager";

const listeners = new Set<(c: { path: string }) => void>();
let listWorkspaces: ReturnType<typeof vi.fn>;

function stubWindow(): void {
  listWorkspaces = vi.fn().mockResolvedValue([]);
  (window as unknown as { openp41ge: unknown }).openp41ge = {
    drag: {
      start: vi.fn(),
      activate: vi.fn(),
      move: vi.fn(),
      end: vi.fn(),
      prepareBitmap: vi.fn(),
      onEndSession: vi.fn(() => () => {}),
    },
    windowManager: {
      openWindowSummaries: vi.fn().mockResolvedValue([]),
      onOpenWindowsChanged: vi.fn(() => () => {}),
      openWorkspaceWindow: vi.fn(),
      onActivateTab: vi.fn(() => () => {}),
      onReceiveTab: vi.fn(() => () => {}),
      onRemoveTab: vi.fn(() => () => {}),
    },
    workspace: {
      getWindowId: vi.fn(() => "win-manager"),
      getLaunchTab: vi.fn(() => null),
    },
    workspaceController: {
      onWorkspaceFileChanged: (fn: (c: { path: string }) => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },
    welcome: { isDismissed: vi.fn().mockResolvedValue(true) },
    dialog: { listWorkspaces },
  };
}

describe("window-manager workspace list", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    listeners.clear();
    stubWindow();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  test("reloads when a workspace file changes, until the manager is removed", async () => {
    const wm = new Openp41geWindowManager();
    document.body.appendChild(wm);
    await wm.updateComplete;
    await vi.waitFor(() => expect(listWorkspaces).toHaveBeenCalled());
    const loads = listWorkspaces.mock.calls.length;
    listeners.forEach((fn) => fn({ path: "/ws/a.openp41ge-workspace" }));
    await vi.waitFor(() => expect(listWorkspaces.mock.calls.length).toBe(loads + 1));
    wm.remove();
    expect(listeners.size).toBe(0);
  });
});
