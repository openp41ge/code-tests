/**
 * Which windows show a state (plans/2026-10-14-one-window.md, step 3). A
 * workspace's state goes to the windows bound to it. The in-memory state of
 * windows with no workspace goes to those windows only — not to a bound
 * window (it would replace that window's layout) nor to the management or
 * logs window.
 */
import { describe, it, expect } from "vitest";
import { showsState } from "../../../electron/window-binding";

describe("showsState", () => {
  const bound = { windowType: "workspace", workspacePath: "/ws/a" } as const;
  const unbound = { windowType: "workspace", workspacePath: null } as const;
  const manager = { windowType: "manager", workspacePath: null } as const;
  const logs = { windowType: "logs", workspacePath: null } as const;

  it("a workspace's state goes to the windows bound to it", () => {
    expect(showsState(bound, "/ws/a")).toBe(true);
    expect(showsState(bound, "/ws/b")).toBe(false);
    expect(showsState(unbound, "/ws/a")).toBe(false);
  });

  it("the no-workspace state goes to workspace windows with no workspace only", () => {
    expect(showsState(unbound, null)).toBe(true);
    expect(showsState(bound, null)).toBe(false);
    expect(showsState(manager, null)).toBe(false);
    expect(showsState(logs, null)).toBe(false);
  });
});
