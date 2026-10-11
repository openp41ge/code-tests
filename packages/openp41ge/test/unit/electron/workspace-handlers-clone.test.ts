/**
 * `workspace:clone` tags each progress message with the clone's id, so the
 * preload delivers it only to that clone (the progress channel is shared by
 * every clone in flight).
 */
import { describe, it, expect, vi } from "vitest";

const handlers = new Map<string, (...args: unknown[]) => unknown>();
vi.mock("electron", () => ({
  app: { isPackaged: true, getPath: () => "" },
  BrowserWindow: class {},
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn),
    on: vi.fn(),
  },
}));

import { registerWorkspaceHandlers } from "../../../electron/ipc-handlers/workspace-handlers.js";

describe("workspace:clone", () => {
  it("sends its progress tagged with the clone's id", async () => {
    const clone = vi.fn(() => ({
      promise: Promise.resolve({ success: true }),
      onProgress: (fn: (p: { percent: number; message: string }) => void) =>
        fn({ percent: 42, message: "Receiving objects" }),
    }));
    registerWorkspaceHandlers(() => ({ service: { clone } }) as never);
    const send = vi.fn();
    await handlers.get("workspace:clone")!({ sender: { send } }, "git@x:a/b.git", undefined, "c-1");
    expect(clone).toHaveBeenCalledWith("git@x:a/b.git");
    expect(send).toHaveBeenCalledWith("workspace:clone-progress", {
      cloneId: "c-1",
      percent: 42,
      message: "Receiving objects",
    });
  });
});
