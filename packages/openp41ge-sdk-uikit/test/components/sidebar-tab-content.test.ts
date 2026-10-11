// @ts-nocheck
/**
 * Unit tests for <openp41ge-sidebar-tab-content>.
 *
 * Verifies the shell the component provides:
 *   - a scrollable content region (OverlayScrollbar attached)
 *   - a bottom bar that accepts imperatively registered buttons
 *   - the register / replace / remove / clear button lifecycle
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import "../../src/components/sidebar-tab-content/sidebar-tab-content";
import type { SidebarTabContent } from "../../src/components/sidebar-tab-content/sidebar-tab-content";
import { tooltipController } from "../../src/components/tooltip/tooltip-controller";

async function createTabContent(): Promise<SidebarTabContent> {
  const el = document.createElement("openp41ge-sidebar-tab-content") as SidebarTabContent;
  el.innerHTML = "<div>content</div>";
  document.body.appendChild(el);
  await (el as any).updateComplete;
  return el;
}

function query(el: SidebarTabContent, selector: string): HTMLElement | null {
  return (el.shadowRoot as ShadowRoot).querySelector(selector);
}

describe("SidebarTabContent", () => {
  let el: SidebarTabContent;

  beforeEach(async () => {
    el = await createTabContent();
  });

  afterEach(() => {
    el?.remove();
  });

  test("renders a scrollable content region and a bottom bar", () => {
    expect(query(el, ".content")).toBeTruthy();
    expect(query(el, ".bottom-bar")).toBeTruthy();
    // content is scrolled by the shared overlay scrollbar
    expect(query(el, ".content")?.hasAttribute("data-overlay-scrollbar")).toBe(true);
  });

  test("bottom bar is border-box so its 1px top border fits inside the 34px bar", () => {
    // jsdom's getComputedStyle does not resolve shadow-root <style> rules, so
    // assert on the inlined rule (the single source of truth in jsdom). Without
    // box-sizing: border-box the bar renders 34px content + 1px border = 35px,
    // 1px taller than the grid cell's bar (34px border-box).
    const styleText = (el.shadowRoot!.querySelector("style")?.textContent ?? "") + "";
    const rule = styleText.match(/\.bottom-bar\s*\{[^}]*\}/s)?.[0] ?? "";
    expect(rule).toContain("box-sizing: border-box");
  });

  test("registers a button into the bottom bar", () => {
    const onClick = vi.fn();
    el.registerBottomBarButton({ id: "settings", icon: "settings", title: "Settings", onClick });
    // force a re-render of the reactive state
    return (el as any).updateComplete.then(() => {
      const btn = query(el, ".bar-btn");
      expect(btn).toBeTruthy();
      expect(btn?.getAttribute("aria-label")).toBe("Settings");
      btn!.click();
      expect(onClick).toHaveBeenCalled();
    });
  });

  test("a button's title is its tooltip (the app's tooltip, not the native one)", async () => {
    const show = vi.fn();
    tooltipController._host = { show, hide: vi.fn() };
    try {
      el.registerBottomBarButton({ id: "collapse-all", icon: "collapse", title: "Collapse all" });
      await (el as any).updateComplete;
      const btn = query(el, ".bar-btn")!;
      expect(btn.hasAttribute("title")).toBe(false);
      btn.dispatchEvent(new MouseEvent("mouseenter"));
      expect(show).toHaveBeenCalledWith(btn, { type: "simple", text: "Collapse all" });
    } finally {
      tooltipController._host = null;
    }
  });

  test("docks all buttons to the inside edge (right sidebar → left)", () => {
    // jsdom geometry is 0-width, so _docked stays the pre-layout default
    // ("right") and the run docks to the left (the inside edge of a right
    // sidebar): a single group as the first child, spacer trailing.
    el.registerBottomBarButton({ id: "collapse", icon: "collapse" });
    el.registerBottomBarButton({ id: "settings", icon: "settings" });
    return (el as any).updateComplete.then(() => {
      const bar = query(el, ".bottom-bar")!;
      const groups = bar.querySelectorAll(".bar-group");
      expect(groups.length).toBe(1);
      expect(bar.firstElementChild).toBe(groups[0]);
      expect(bar.lastElementChild?.classList.contains("spacer")).toBe(true);
      const labels = Array.from(bar.querySelectorAll(".bar-btn")).map((b) =>
        b.getAttribute("aria-label"),
      );
      expect(labels).toEqual(["collapse", "settings"]);
    });
  });

  test("left-docked sidebar docks buttons to the right (spacer first)", async () => {
    const origRect = el.getBoundingClientRect.bind(el);
    const origWidth = window.innerWidth;
    el.getBoundingClientRect = () =>
      ({ left: 50, width: 300, top: 0, bottom: 0, right: 350, x: 50, y: 0 }) as DOMRect;
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });
    el.registerBottomBarButton({ id: "x", icon: "settings" });
    await (el as any).updateComplete;
    // Trigger dock re-detection after the geometry was stubbed.
    window.dispatchEvent(new Event("resize"));
    await (el as any).updateComplete;
    const bar = query(el, ".bottom-bar")!;
    const groups = bar.querySelectorAll(".bar-group");
    expect(groups.length).toBe(1);
    expect(bar.firstElementChild?.classList.contains("spacer")).toBe(true);
    expect(bar.lastElementChild).toBe(groups[0]);
    el.getBoundingClientRect = origRect;
    Object.defineProperty(window, "innerWidth", { value: origWidth, configurable: true });
  });

  test("re-registering the same id replaces the button in place", () => {
    el.registerBottomBarButton({ id: "x", icon: "settings", onClick: () => {} });
    const onClick2 = vi.fn();
    el.registerBottomBarButton({ id: "x", icon: "settings", onClick: onClick2 });
    return (el as any).updateComplete.then(() => {
      const btns = query(el, ".bottom-bar")!.querySelectorAll(".bar-btn");
      expect(btns.length).toBe(1);
      btns[0].click();
      expect(onClick2).toHaveBeenCalled();
    });
  });

  test("removeBottomBarButton and the unregister fn remove the button", () => {
    const unreg = el.registerBottomBarButton({ id: "a", icon: "settings" });
    el.registerBottomBarButton({ id: "b", icon: "refresh" });
    return (el as any).updateComplete.then(() => {
      expect(query(el, ".bottom-bar")!.querySelectorAll(".bar-btn").length).toBe(2);
      unreg();
      el.removeBottomBarButton("b");
      return (el as any).updateComplete.then(() => {
        expect(query(el, ".bottom-bar")!.querySelectorAll(".bar-btn").length).toBe(0);
      });
    });
  });

  test("clearBottomBarButtons empties the bar", () => {
    el.registerBottomBarButton({ id: "a", icon: "settings" });
    el.clearBottomBarButtons();
    return (el as any).updateComplete.then(() => {
      expect(query(el, ".bottom-bar")!.querySelectorAll(".bar-btn").length).toBe(0);
    });
  });

  test("separatorBefore renders a divider before the button", () => {
    el.registerBottomBarButton({ id: "s", icon: "settings", separatorBefore: true });
    return (el as any).updateComplete.then(() => {
      expect(query(el, ".bottom-bar")!.querySelector(".sep")).toBeTruthy();
    });
  });
});
