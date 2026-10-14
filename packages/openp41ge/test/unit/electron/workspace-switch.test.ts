/**
 * Switching a window's workspace (plans/2026-10-14-one-window.md, step 4):
 * the window replaces the workspace it shows.
 *
 * Its old state: a window with no workspace drops its in-memory tabs; a
 * workspace window still open elsewhere leaves that workspace (its layout
 * loses this window); the workspace's last window keeps its layout in the
 * workspace's file, as closing it would.
 *
 * Its new state: a workspace open in another window gets another window; a
 * closed workspace shows its saved layout (its first saved window) or, with
 * none, a fresh window. A saved window id already in use by a live window is
 * never reused.
 */
import { describe, it, expect } from "vitest";
import { planWorkspaceSwitch } from "../../../electron/workspace-switch";

const base = {
  windowId: "win-a",
  liveWindowIds: ["win-a"],
  otherLiveWindowsOfOld: 0,
  liveWindowsOfNew: 0,
  savedWindowIdsOfNew: [] as string[],
};

describe("planWorkspaceSwitch", () => {
  it("does nothing when the window already shows that workspace", () => {
    expect(planWorkspaceSwitch({ ...base, oldPath: "/ws/a", newPath: "/ws/a" })).toBeNull();
    expect(planWorkspaceSwitch({ ...base, oldPath: null, newPath: null })).toBeNull();
  });

  it("drops a no-workspace window's in-memory tabs", () => {
    expect(planWorkspaceSwitch({ ...base, oldPath: null, newPath: "/ws/b" })?.old).toBe("remove");
  });

  it("leaves a workspace still open elsewhere", () => {
    expect(
      planWorkspaceSwitch({ ...base, oldPath: "/ws/a", newPath: "/ws/b", otherLiveWindowsOfOld: 1 })
        ?.old,
    ).toBe("remove");
  });

  it("keeps the layout of a workspace whose last window this was", () => {
    expect(planWorkspaceSwitch({ ...base, oldPath: "/ws/a", newPath: "/ws/b" })?.old).toBe("keep");
  });

  it("shows a closed workspace's first saved window", () => {
    expect(
      planWorkspaceSwitch({
        ...base,
        oldPath: null,
        newPath: "/ws/b",
        savedWindowIdsOfNew: ["win-b1", "win-b2"],
      })?.window,
    ).toEqual({ kind: "saved", id: "win-b1" });
  });

  it("opens a fresh window for a workspace with no saved layout, or with no workspace", () => {
    expect(planWorkspaceSwitch({ ...base, oldPath: null, newPath: "/ws/b" })?.window).toEqual({
      kind: "new",
    });
    expect(planWorkspaceSwitch({ ...base, oldPath: "/ws/a", newPath: null })?.window).toEqual({
      kind: "new",
    });
  });

  it("adds a window to a workspace already open in another window", () => {
    expect(
      planWorkspaceSwitch({
        ...base,
        oldPath: null,
        newPath: "/ws/b",
        liveWindowsOfNew: 1,
        savedWindowIdsOfNew: ["win-b1"],
      })?.window,
    ).toEqual({ kind: "new" });
  });

  it("never reuses a saved id a live window has", () => {
    expect(
      planWorkspaceSwitch({
        ...base,
        oldPath: null,
        newPath: "/ws/b",
        liveWindowIds: ["win-a", "win-ws1-0"],
        savedWindowIdsOfNew: ["win-ws1-0", "win-b2"],
      })?.window,
    ).toEqual({ kind: "saved", id: "win-b2" });
  });
});
