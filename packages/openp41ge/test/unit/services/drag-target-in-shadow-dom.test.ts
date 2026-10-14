// @vitest-environment jsdom
/**
 * The drag system finds a drop target (a grid, or a cell's tab bar) under the
 * cursor even when the grid is inside shadow roots (e.g. a host component →
 * its grid component → <tab-grid>). A plain `document.elementFromPoint` stops
 * at the outermost host, so a grid tab dragged there found no grid and could
 * not land in a new cell.
 */
import { describe, it, expect, afterEach } from "vitest";
import { openp41geTargetResolver } from "@openp41ge/renderer/services/init-drag-system";

type WithTarget = HTMLElement & { dropTarget?: { type: string } };

/** Give an element a drop target (the real <tab-grid>/<tab-bar> define it as
 *  a getter, so define it over the instance). */
function setTarget(el: HTMLElement, target: { type: string }): void {
  Object.defineProperty(el, "dropTarget", { value: target, configurable: true });
}

/** host (shadow) → inner host (shadow) → content; elementFromPoint stubbed
 *  the way Chromium answers: each root returns its own topmost element. */
function nest(content: (root: ShadowRoot) => Element) {
  const outer = document.createElement("div");
  document.body.appendChild(outer);
  const outerRoot = outer.attachShadow({ mode: "open" });
  const inner = document.createElement("div");
  outerRoot.appendChild(inner);
  const innerRoot = inner.attachShadow({ mode: "open" });
  const hit = content(innerRoot);
  (document as unknown as { elementFromPoint: () => Element }).elementFromPoint = () => outer;
  (outerRoot as unknown as { elementFromPoint: () => Element }).elementFromPoint = () => inner;
  (innerRoot as unknown as { elementFromPoint: () => Element }).elementFromPoint = () => hit;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("drop target resolve inside shadow roots", () => {
  it("finds a grid two shadow roots deep (the manager window's grid)", () => {
    let grid!: WithTarget;
    nest((root) => {
      grid = document.createElement("tab-grid") as WithTarget;
      setTarget(grid, { type: "grid" });
      const cell = document.createElement("div");
      grid.appendChild(cell);
      root.appendChild(grid);
      return cell;
    });
    expect(openp41geTargetResolver(10, 10)).toBe(grid.dropTarget);
  });

  it("finds a cell's tab bar there too", () => {
    let bar!: WithTarget;
    nest((root) => {
      const grid = document.createElement("tab-grid") as WithTarget;
      setTarget(grid, { type: "grid" });
      bar = document.createElement("tab-bar") as WithTarget;
      setTarget(bar, { type: "tab-bar" });
      const tab = document.createElement("div");
      bar.appendChild(tab);
      grid.appendChild(bar);
      root.appendChild(grid);
      return tab;
    });
    expect(openp41geTargetResolver(10, 10)).toBe(bar.dropTarget);
  });

  it("finds the tab bar under a close button (whose ✕ is in its own shadow root)", () => {
    const grid = document.createElement("tab-grid") as WithTarget;
    setTarget(grid, { type: "grid" });
    const bar = document.createElement("tab-bar") as WithTarget;
    setTarget(bar, { type: "tab-bar" });
    const close = document.createElement("div");
    const closeRoot = close.attachShadow({ mode: "open" });
    const x = document.createElement("span");
    closeRoot.appendChild(x);
    bar.appendChild(close);
    grid.appendChild(bar);
    document.body.appendChild(grid);
    (document as unknown as { elementFromPoint: () => Element }).elementFromPoint = () => close;
    (closeRoot as unknown as { elementFromPoint: () => Element }).elementFromPoint = () => x;
    expect(openp41geTargetResolver(10, 10)).toBe(bar.dropTarget);
  });
});
