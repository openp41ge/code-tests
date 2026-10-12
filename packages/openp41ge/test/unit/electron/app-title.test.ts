/**
 * Window titles (shown in Mission Control and the Window menu): "openp41ge
 * code", or "openp41ge code development" for a dev build, with an optional
 * part after a dash. A window keeps its title: the page's <title> does not
 * replace it.
 */
import { describe, it, expect, vi } from "vitest";
import { appTitle, keepWindowTitle } from "../../../electron/app-title";

describe("appTitle", () => {
  it("names a packaged build openp41ge code", () => {
    expect(appTitle(true)).toBe("openp41ge code");
    expect(appTitle(true, "Before you start")).toBe("openp41ge code — Before you start");
  });

  it("names a dev build openp41ge code development", () => {
    expect(appTitle(false)).toBe("openp41ge code development");
    expect(appTitle(false, "Before you start")).toBe(
      "openp41ge code development — Before you start",
    );
  });
});

describe("keepWindowTitle", () => {
  it("stops the page's title replacing the window's", () => {
    const handlers: Record<string, (e: { preventDefault(): void }) => void> = {};
    const win = { on: (event: string, fn: (e: { preventDefault(): void }) => void) => (handlers[event] = fn) };
    keepWindowTitle(win as never);
    const preventDefault = vi.fn();
    handlers["page-title-updated"]({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
  });
});
