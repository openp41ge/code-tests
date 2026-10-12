/**
 * <openp41ge-sidebar>: when the sidebar is focused, its active tab has the
 * same blue top line as the grid's focused tab. Other tabs, and every tab
 * of a sidebar that is not focused, do not.
 */
import { describe, it, expect, afterEach } from "vitest";
import "../../../src/renderer/components/openp41ge-sidebar";
import { expectFocusLineOn, expectNoFocusLine } from "../../../../openp41ge-sdk-uikit/test/components/tabs/focus-line-expect";

type Sidebar = HTMLElement & {
  side: string;
  systemTabs: Array<{ id: string; title: string; appType: string; pinned: boolean }>;
  activeTabId: string | null;
  isOpen: boolean;
  focused: boolean;
  updateComplete: Promise<boolean>;
};

async function sidebar(focused: boolean): Promise<Sidebar> {
  const el = document.createElement("openp41ge-sidebar") as Sidebar;
  el.side = "left";
  el.systemTabs = [
    { id: "a", title: "A", appType: "a", pinned: true },
    { id: "b", title: "B", appType: "b", pinned: true },
  ];
  el.activeTabId = "a";
  el.isOpen = true;
  el.focused = focused;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("sidebar focused line", () => {
  it("marks only the active tab of a focused sidebar", async () => {
    const el = await sidebar(true);
    expect(el.querySelector('[data-sidebar-tab-id="a"]')!.hasAttribute("data-focused")).toBe(true);
    expect(el.querySelector('[data-sidebar-tab-id="b"]')!.hasAttribute("data-focused")).toBe(
      false,
    );
  });

  it("marks no tab when the sidebar is not focused", async () => {
    const el = await sidebar(false);
    expect(el.querySelector("[data-focused]")).toBeNull();
  });

  it("shows the focus line over the focused tab, and none when the sidebar is not focused", async () => {
    const el = await sidebar(true);
    expectFocusLineOn(el.querySelector('[data-sidebar-tab-id="a"]'));
    el.focused = false;
    await el.updateComplete;
    expectNoFocusLine();
  });
});
