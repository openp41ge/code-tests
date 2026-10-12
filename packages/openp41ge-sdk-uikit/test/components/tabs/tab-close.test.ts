// @ts-nocheck
/**
 * <tab-close>: the close button of every tab handle (grid tab bars, the
 * workspace sidebars, the manager's tab bar and the Logs window's sidebar),
 * so they all look the same: a full-height 34px square with the ✕ drawn in
 * the UI font (the same stroke weight in every window), its glyph lifted 1px
 * to sit centred; it greys on hover, brighter on the active tab.
 */
import { describe, test, expect, afterEach } from "vitest";
import "../../../src/components/tabs/tab-close";
import "../../../src/components/tabs/tab-bar";

afterEach(() => {
  document.body.innerHTML = "";
});

const css = () => customElements.get("tab-close").styles.cssText;

describe("tab-close", () => {
  test("draws the ✕ in the UI font, upright, as a full-height square", async () => {
    const el = document.createElement("tab-close");
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector(".x").textContent).toBe("✕");
    expect(el.getAttribute("aria-label")).toBe("Close tab");
    expect(css()).toMatch(/font-family:\s*var\(--font-ui/);
    expect(css()).toMatch(/font-style:\s*normal/);
    expect(css()).toMatch(/width:\s*34px/);
    expect(css()).toMatch(/translateY\(-1px\)/);
  });

  test("greys on hover, brighter on the active tab", () => {
    expect(css()).toMatch(/:host\(:hover\)\s*\{[^}]*--border-divider/);
    expect(css()).toMatch(/:host\(\[active\]:hover\)\s*\{[^}]*--bg-hover-strong/);
  });

  test("is the grid tab bar's close button", async () => {
    const bar = document.createElement("tab-bar");
    bar.tabIds = ["a", "b"];
    bar.tabs = { a: { title: "A", pinned: true }, b: { title: "B", pinned: true } };
    bar.activeTabId = "a";
    document.body.appendChild(bar);
    await bar.updateComplete;
    const root = bar.shadowRoot ?? bar;
    const close = root.querySelector('[data-close-tab-id="a"]');
    expect(close.tagName).toBe("TAB-CLOSE");
    expect(close.classList.contains("tab-close")).toBe(true);
    expect(close.hasAttribute("active")).toBe(true);
    expect(root.querySelector('[data-close-tab-id="b"]').hasAttribute("active")).toBe(false);
  });
});
