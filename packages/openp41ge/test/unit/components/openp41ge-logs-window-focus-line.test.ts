/**
 * Logs window focus line. The focused tab — the sidebar's active tab when the
 * sidebar was clicked last, else the grid's focused tab — has the blue line,
 * only while the window is focused. Blurring hides it and keeps the focused
 * zone, so the line comes back where it was.
 */
import { describe, it, expect, afterEach } from "vitest";
import { Openp41geLogsWindow } from "../../../src/renderer/components/openp41ge-logs-window";
import { _resetLogStreams } from "openp41ge-core-logger";
import { expectFocusLine } from "../../../../openp41ge-sdk-uikit/test/components/tabs/focus-line-expect";

type Lw = Openp41geLogsWindow & { _sidebarOpen: boolean };

afterEach(() => {
  document.body.innerHTML = "";
  _resetLogStreams();
});

async function mount(): Promise<Lw> {
  const el = new Openp41geLogsWindow() as Lw;
  document.body.appendChild(el);
  await el.updateComplete;
  window.dispatchEvent(new Event("focus"));
  await el.updateComplete;
  return el;
}

const root = (el: Lw) => el.shadowRoot ?? el;
const grid = (el: Lw) => root(el).querySelector("tab-grid") as unknown as { focusVisible: boolean };
const sidebarLine = (el: Lw) => root(el).querySelector(".lw-sb-tab[data-focused]");

async function mousedown(el: Lw, selector: string) {
  root(el)
    .querySelector(selector)!
    .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true, button: 0 }));
  await el.updateComplete;
}

describe("Logs window focus line", () => {
  it("hides the line while the window is blurred", async () => {
    const el = await mount();
    expect(grid(el).focusVisible).toBe(true);

    window.dispatchEvent(new Event("blur"));
    await el.updateComplete;
    expect(grid(el).focusVisible).toBe(false);

    window.dispatchEvent(new Event("focus"));
    await el.updateComplete;
    expect(grid(el).focusVisible).toBe(true);
  });

  it("moves the line to the sidebar's active tab when the sidebar is clicked, and back", async () => {
    const el = await mount();
    el._sidebarOpen = true;
    await el.updateComplete;
    expect(sidebarLine(el)).toBeNull();

    await mousedown(el, ".lw-sidebar");
    expect(sidebarLine(el)?.classList.contains("active")).toBe(true);
    expect(grid(el).focusVisible).toBe(false);

    await mousedown(el, "tab-grid");
    expect(sidebarLine(el)).toBeNull();
    expect(grid(el).focusVisible).toBe(true);
  });

  it("remembers the focused sidebar while blurred", async () => {
    const el = await mount();
    el._sidebarOpen = true;
    await el.updateComplete;
    await mousedown(el, ".lw-sidebar");

    window.dispatchEvent(new Event("blur"));
    await el.updateComplete;
    expect(sidebarLine(el)).toBeNull();
    expect(grid(el).focusVisible).toBe(false);

    window.dispatchEvent(new Event("focus"));
    await el.updateComplete;
    expect(sidebarLine(el)).not.toBeNull();
  });

  it("gives the line back to the grid when the focused sidebar closes", async () => {
    const el = await mount();
    el._sidebarOpen = true;
    await el.updateComplete;
    await mousedown(el, ".lw-sidebar");

    el._sidebarOpen = false;
    await el.updateComplete;
    expect(grid(el).focusVisible).toBe(true);
  });

  it("draws the focus line on the sidebar's tabs: half the tab's width, centred, rounded", async () => {
    const el = await mount();
    const css =
      [...root(el).querySelectorAll("style")].map((s) => s.textContent).join("") +
      [...(root(el) as ShadowRoot).adoptedStyleSheets ?? []]
        .flatMap((sheet) => [...sheet.cssRules].map((r) => r.cssText))
        .join("") +
      String((Openp41geLogsWindow as unknown as { styles?: { cssText?: string } }).styles?.cssText ?? "");
    expectFocusLine(css, ".lw-sb-tab");
  });
});
