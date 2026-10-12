// @ts-nocheck
/**
 * <tab-bar>: the focused tab (the active tab of the focused cell's bar) has a
 * blue line across its top edge (half its width, centred, rounded). Other tabs, and the active tab of a bar
 * that is not focused, do not.
 */
import { describe, test, expect, afterEach } from "vitest";
import "../../../src/components/tabs/tab-bar";
import { expectFocusLine } from "./focus-line-expect";

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

  test("draws the focus line: half the tab's width, centred, rounded", async () => {
    const root = await bar(true);
    // jsdom does not resolve shadow-root style rules, so assert the rule itself.
    const css = [...root.querySelectorAll("style")].map((s) => s.textContent).join("");
    expectFocusLine(css, ".tab-btn");
  });
});
