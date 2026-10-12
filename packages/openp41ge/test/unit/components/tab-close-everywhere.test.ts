/**
 * Every tab handle's close button is the toolkit's <tab-close>, so they all
 * look the same: the workspace sidebars, the manager window's tab bar and the
 * Logs window's sidebar (the grid's tab bars are covered in the toolkit).
 */
import { describe, it, expect, afterEach } from "vitest";
import "openp41ge-sdk-uikit";
import "../../../src/renderer/components/openp41ge-sidebar";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("tab close buttons", () => {
  it("the workspace sidebar's tabs use <tab-close>, active on the active tab", async () => {
    const el = document.createElement("openp41ge-sidebar") as HTMLElement & Record<string, unknown>;
    el.side = "left";
    el.systemTabs = [
      { id: "a", title: "A", appType: "a", pinned: true },
      { id: "b", title: "B", appType: "b", pinned: true },
    ];
    el.activeTabId = "a";
    el.isOpen = true;
    document.body.appendChild(el);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const a = el.querySelector('[data-sidebar-tab-id="a"] tab-close');
    const b = el.querySelector('[data-sidebar-tab-id="b"] tab-close');
    expect(a).not.toBeNull();
    expect(a!.hasAttribute("active")).toBe(true);
    expect(b!.hasAttribute("active")).toBe(false);
  });
});
