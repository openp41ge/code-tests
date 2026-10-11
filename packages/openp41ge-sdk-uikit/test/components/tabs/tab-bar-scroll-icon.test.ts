// @ts-nocheck
/**
 * Regression: hovering a tab whose title is too long scrolls the title; its
 * icon must scroll with it, or the text slides under the icon.
 */
import { describe, test, expect, afterEach, vi } from "vitest";
import "../../../src/components/tabs/tab-bar";

afterEach(() => {
  document.body.innerHTML = "";
  delete Element.prototype.animate;
});

describe("tab-bar long title scroll", () => {
  test("moves the icon with the title, and stops both", async () => {
    const animations = new Map();
    Element.prototype.animate = vi.fn(function (keyframes) {
      const anim = { keyframes, cancel: vi.fn() };
      animations.set(this, anim);
      return anim;
    });
    const el = document.createElement("tab-bar");
    el.tabIds = ["a"];
    el.tabs = { a: { title: "a-very-long-file-name-that-overflows.ts", icon: "<svg></svg>" } };
    el.activeTabId = "a";
    document.body.appendChild(el);
    await el.updateComplete;
    const root = el.shadowRoot ?? el;
    const tab = root.querySelector('[data-tab-id="a"]');
    const inner = tab.querySelector(".tab-text-inner");
    const icon = tab.querySelector(".tab-icon");
    Object.defineProperty(inner, "scrollWidth", { value: 300 });
    Object.defineProperty(inner, "clientWidth", { value: 100 });

    tab.dispatchEvent(new MouseEvent("mouseenter"));
    expect(animations.get(inner)).toBeDefined();
    expect(animations.get(icon)?.keyframes).toEqual(animations.get(inner).keyframes);

    tab.dispatchEvent(new MouseEvent("mouseleave"));
    expect(animations.get(inner).cancel).toHaveBeenCalled();
    expect(animations.get(icon).cancel).toHaveBeenCalled();
  });
});
