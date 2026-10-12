/**
 * Manager window focus line. Like a workspace window and the Logs window, it
 * remembers whether its focus is in its sidebar or its grid (the last zone
 * clicked): the sidebar's active tab or the grid's focused tab has the line,
 * only while the window is focused.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Openp41geWindowManager } from "../../../src/renderer/components/openp41ge-window-manager";
import {
  expectFocusLineOn,
  expectNoFocusLine,
} from "../../../../openp41ge-sdk-uikit/test/components/tabs/focus-line-expect";

type Wm = Openp41geWindowManager & Record<string, unknown>;
type Grid = HTMLElement & { focusVisible: boolean; updateComplete: Promise<unknown> };

beforeEach(() => {
  localStorage.clear();
  (window as unknown as { openp41ge: unknown }).openp41ge = {
    drag: { onEndSession: vi.fn(() => () => {}) },
    windowManager: {
      openWindowSummaries: vi.fn().mockResolvedValue([]),
      onOpenWindowsChanged: vi.fn(() => () => {}),
      onActivateTab: vi.fn(() => () => {}),
    },
    workspace: { getLaunchTab: vi.fn(() => null) },
    welcome: { isDismissed: vi.fn().mockResolvedValue(false) },
    dialog: { listWorkspaces: vi.fn().mockResolvedValue([]) },
  };
});

afterEach(() => {
  document.body.innerHTML = "";
});

async function mount(): Promise<Wm> {
  const wm = new Openp41geWindowManager() as Wm;
  document.body.appendChild(wm);
  await wm.updateComplete;
  window.dispatchEvent(new Event("focus"));
  await wm.updateComplete;
  return wm;
}

const sr = (wm: Wm) => wm.shadowRoot!;
const grid = (wm: Wm) => sr(wm).querySelector("openp41ge-manager-grid") as Grid;
const activeTab = (wm: Wm) => sr(wm).querySelector('[data-manager-tab="workspaces"]');

async function press(wm: Wm, el: Element) {
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true, button: 0 }));
  await wm.updateComplete;
  await grid(wm).updateComplete;
}

describe("manager window focus line", () => {
  it("shows the line on the sidebar's active tab when the sidebar is clicked, and back on the grid", async () => {
    const wm = await mount();
    await press(wm, sr(wm).querySelector(".wm-sidebar")!);
    expect(activeTab(wm)!.hasAttribute("data-focused")).toBe(true);
    expectFocusLineOn(activeTab(wm));
    expect(grid(wm).focusVisible).toBe(false);

    await press(wm, grid(wm));
    expect(activeTab(wm)!.hasAttribute("data-focused")).toBe(false);
    expect(grid(wm).focusVisible).toBe(true);
  });

  it("shows no line while the window is blurred, and remembers the zone", async () => {
    const wm = await mount();
    await press(wm, sr(wm).querySelector(".wm-sidebar")!);
    window.dispatchEvent(new Event("blur"));
    await wm.updateComplete;
    await grid(wm).updateComplete;
    expect(activeTab(wm)!.hasAttribute("data-focused")).toBe(false);
    expect(grid(wm).focusVisible).toBe(false);
    expectNoFocusLine();

    window.dispatchEvent(new Event("focus"));
    await wm.updateComplete;
    expect(activeTab(wm)!.hasAttribute("data-focused")).toBe(true);
  });
});
