// @ts-nocheck
/**
 * <tab-bar>: an unpinned (preview) tab is marked as a preview (its title is
 * italic); its icon stays upright, like a pinned or ephemeral tab's.
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

  test("marks an unpinned tab as a preview, and keeps a preview's icon upright", async () => {
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
    expect(css).not.toMatch(/skewX\(/);
    // A text-glyph icon (e.g. ⌘) must not take the title's italic either.
    expect(css).toMatch(/\.tab-icon\s*\{[^}]*font-style:\s*normal/);
    expect(
      root.querySelector('[data-tab-id="p"] .tab-icon').getAttribute("style") ?? "",
    ).not.toMatch(/skew|italic/);
  });
});
