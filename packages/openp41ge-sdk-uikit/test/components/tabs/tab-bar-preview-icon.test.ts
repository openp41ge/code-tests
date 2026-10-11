// @ts-nocheck
/**
 * <tab-bar>: an unpinned (preview) tab is italic — its icon too, slanted like
 * the title. Pinned and ephemeral tabs stay upright.
 */
import { describe, test, expect, afterEach } from "vitest";
import "../../../src/components/tabs/tab-bar";

const ICON = '<svg viewBox="0 0 10 10"></svg>';

async function bar(tabs) {
  const el = document.createElement("tab-bar");
  el.tabIds = Object.keys(tabs);
  el.tabs = tabs;
  el.activeTabId = el.tabIds[0];
  document.body.appendChild(el);
  await el.updateComplete;
  return el.shadowRoot ?? el;
}

describe("tab-bar preview icon", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("marks an unpinned tab as a preview, and slants a preview's icon", async () => {
    const root = await bar({
      p: { title: "Preview", pinned: false, icon: ICON },
      k: { title: "Kept", pinned: true, icon: ICON },
      e: { title: "Ephemeral", pinned: false, ephemeral: true, icon: ICON },
    });
    expect(root.querySelector('[data-tab-id="p"]').hasAttribute("data-preview")).toBe(true);
    expect(root.querySelector('[data-tab-id="k"]').hasAttribute("data-preview")).toBe(false);
    expect(root.querySelector('[data-tab-id="e"]').hasAttribute("data-preview")).toBe(false);
    // jsdom does not resolve shadow-root style rules, so assert the rule itself.
    const css = [...root.querySelectorAll("style")].map((s) => s.textContent).join("");
    expect(css).toMatch(/\[data-preview\]\s*\.tab-icon\s*>\s*\*\s*\{[^}]*skewX\(/);
  });
});
