/**
 * Which windows show a state: a workspace's state goes to the windows that
 * show that workspace; the in-memory state of windows with no workspace goes
 * to those windows only — never to a window showing a workspace (it would
 * replace that window's layout).
 */
import { describe, it, expect } from "vitest";
import { showsState } from "../../../electron/window-binding";

describe("showsState", () => {
  const bound = { workspacePath: "/ws/a" };
  const unbound = { workspacePath: null };

  it("a workspace's state goes to the windows showing it", () => {
    expect(showsState(bound, "/ws/a")).toBe(true);
    expect(showsState(bound, "/ws/b")).toBe(false);
    expect(showsState(unbound, "/ws/a")).toBe(false);
  });

  it("the no-workspace state goes to windows with no workspace only", () => {
    expect(showsState(unbound, null)).toBe(true);
    expect(showsState(bound, null)).toBe(false);
  });
});
