// @ts-nocheck
/**
 * <tab-bar>: a tab's optional `description` follows its title, muted, and
 * truncates / scrolls with it (e.g. a worktree tab's repository).
 */
import { describe, test, expect, afterEach } from "vitest";
import "../../../src/components/tabs/tab-bar";

async function bar(tabs) {
  const el = document.createElement("tab-bar");
  el.tabIds = Object.keys(tabs);
  el.tabs = tabs;
  el.activeTabId = el.tabIds[0];
  document.body.appendChild(el);
  await el.updateComplete;
  return el.shadowRoot ?? el;
}

describe("tab-bar description", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("renders after the title, muted, inside the scrolling text", async () => {
    const root = await bar({ a: { title: "master", description: "github.com/acme/app" } });
    const inner = root.querySelector('[data-tab-id="a"] .tab-text-inner');
    // The title, a dot (drawn, so it can be sized and centred), then the description.
    expect(inner.textContent.trim()).toMatch(/^master\s*github\.com\/acme\/app$/);
    const desc = inner.querySelector(".tab-description");
    expect(desc.textContent.trim()).toBe("github.com/acme/app");
    const dot = desc.querySelector(".tab-description-dot");
    expect(dot.style.width).toBe("4px");
    expect(dot.style.height).toBe("4px");
    expect(dot.style.borderRadius).toBe("50%");
    expect(desc.style.opacity).toBe("0.55");
  });

  test("is absent without one", async () => {
    const root = await bar({ a: { title: "README.md" } });
    expect(root.querySelector(".tab-description")).toBeNull();
  });
});
