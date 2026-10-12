/**
 * Logs window: the focused tab's line hides while the window is blurred and
 * comes back when it is focused again (<tab-grid> `focusVisible`).
 */
import { describe, it, expect, afterEach } from "vitest";
import { Openp41geLogsWindow } from "../../../src/renderer/components/openp41ge-logs-window";
import { _resetLogStreams } from "openp41ge-core-logger";

afterEach(() => {
  document.body.innerHTML = "";
  _resetLogStreams();
});

describe("Logs window focus line", () => {
  it("hides the line while the window is blurred", async () => {
    const el = new Openp41geLogsWindow();
    document.body.appendChild(el);
    await el.updateComplete;
    const grid = () =>
      (el.shadowRoot ?? el).querySelector("tab-grid") as unknown as { focusVisible: boolean };

    window.dispatchEvent(new Event("focus"));
    await el.updateComplete;
    expect(grid().focusVisible).toBe(true);

    window.dispatchEvent(new Event("blur"));
    await el.updateComplete;
    expect(grid().focusVisible).toBe(false);

    window.dispatchEvent(new Event("focus"));
    await el.updateComplete;
    expect(grid().focusVisible).toBe(true);
  });
});
