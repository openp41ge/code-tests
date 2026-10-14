/**
 * The main process forwards each console.error to the renderer windows (their
 * error overlay). Forwarding to a window whose page is going away (closing,
 * reloading) makes Electron itself console.error — which must not be
 * forwarded again: it recursed forever and froze the main process at 100%
 * CPU (a window closed or reloaded while an error was being forwarded).
 */
import { describe, it, expect, vi } from "vitest";
import { installConsoleErrorForwarder } from "../../../electron/console-error-forwarder";

function fakeConsole() {
  const printed: string[] = [];
  return { printed, console: { error: (...args: unknown[]) => printed.push(args.join(" ")) } };
}

describe("installConsoleErrorForwarder", () => {
  it("forwards an error and still prints it", () => {
    const c = fakeConsole();
    const forward = vi.fn();
    installConsoleErrorForwarder(c.console as unknown as Console, { forward, breadcrumb: vi.fn() });
    c.console.error("boom");
    expect(forward).toHaveBeenCalledWith("boom");
    expect(c.printed).toEqual(["boom"]);
  });

  it("does not forward an error raised while forwarding one (no recursion)", () => {
    const c = fakeConsole();
    const forward = vi.fn(() => {
      // Electron: "Error sending from webFrameMain: Render frame was disposed".
      c.console.error("Render frame was disposed");
    });
    installConsoleErrorForwarder(c.console as unknown as Console, { forward, breadcrumb: vi.fn() });
    c.console.error("boom");
    expect(forward).toHaveBeenCalledTimes(1);
    expect(c.printed).toEqual(["Render frame was disposed", "boom"]);
  });

  it("does not forward Node warnings", () => {
    const c = fakeConsole();
    const forward = vi.fn();
    installConsoleErrorForwarder(c.console as unknown as Console, { forward, breadcrumb: vi.fn() });
    c.console.error("(node:123) Warning: something");
    expect(forward).not.toHaveBeenCalled();
  });
});
