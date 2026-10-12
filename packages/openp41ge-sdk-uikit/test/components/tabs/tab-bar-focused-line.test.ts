// @ts-nocheck
/**
 * <tab-bar>: the focused tab (the active tab of the focused cell's bar) has a
 * 2px blue line across its top edge. Other tabs, and the active tab of a bar
 * that is not focused, do not.
 */
import { describe, test, expect, afterEach } from "vitest";
import "../../../src/components/tabs/tab-bar";

async function bar(focused) {
  const el = document.createElement("tab-bar");
  el.tabIds = ["a", "b"];
  el.tabs = { a: { title: "A", pinned: true }, b: { title: "B", pinned: true } };
  el.activeTabId = "a";
  el.focused = focused;
  document.body.appendChild(el);
  await el.updateComplete;
  return el.shadowRoot ?? el;
}

describe("tab-bar focused line", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("marks only the active tab of a focused bar", async () => {
    const root = await bar(true);
    expect(root.querySelector('[data-tab-id="a"]').hasAttribute("data-focused")).toBe(true);
    expect(root.querySelector('[data-tab-id="b"]').hasAttribute("data-focused")).toBe(false);
  });

  test("marks no tab when the bar is not focused", async () => {
    const root = await bar(false);
    expect(root.querySelector("[data-focused]")).toBeNull();
  });

  test("draws a 2px blue line across the focused tab's top edge", async () => {
    const root = await bar(true);
    // jsdom does not resolve shadow-root style rules, so assert the rule itself.
    const css = [...root.querySelectorAll("style")].map((s) => s.textContent).join("");
    expect(css).toMatch(/\[data-focused\]\s*\{[^}]*inset 0 2px 0 (#4a9eff|rgb\(74,\s*158,\s*255\))/);
  });
});

describe("tab-bar focused line and the close button", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("the focused tab's close button draws the line too, over its hover background", async () => {
    const root = await bar(true);
    const css = [...root.querySelectorAll("style")].map((s) => s.textContent).join("");
    expect(css).toMatch(
      /\[data-focused\]\s+\.tab-close\s*\{[^}]*inset 0 2px 0 (#4a9eff|rgb\(74,\s*158,\s*255\))/,
    );
  });
});
