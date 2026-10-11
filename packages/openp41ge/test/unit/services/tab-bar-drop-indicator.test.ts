/**
 * Grid tab-bar drop indicator geometry.
 *
 * The TabBarDropTarget (openp41ge-core-tabs) draws the blue insertion line on a
 * cell's tab bar during a tab drag/reorder. These tests pin that the marker is
 * FULL tab-bar height (flush with the top and bottom edges, not inset), square,
 * 3px with a glow, and is suppressed for same-cell no-op reorders.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { TabBarDropTarget } from "openp41ge-core-tabs/targets/tab-bar-drop-target";
import type { IDragSource } from "openp41ge-core-tabs/interfaces";

function fakeTabSource(tabId = "t1"): IDragSource {
  return {
    type: "tab",
    createGhost: () => document.createElement("div"),
    getDragData: () => ({ type: "tab", tabId, winId: "w1", col: 0 }),
    onDragStart: () => {},
    onDragEnd: () => {},
  } as unknown as IDragSource;
}

function rectFor(left: number, width = 100): DOMRect {
  return {
    left,
    right: left + width,
    top: 0,
    bottom: 35,
    width,
    height: 35,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as unknown as DOMRect;
}

describe("TabBarDropTarget tab-bar indicator geometry", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  function bar(): HTMLElement {
    const b = document.createElement("div");
    b.style.position = "relative";
    document.body.appendChild(b);
    return b;
  }

  it("is full-height (3px, glow, square) once the indicator is shown", () => {
    const b = bar();
    const target = new TabBarDropTarget(b, "w1", 0);

    const feedback = target.onHover(fakeTabSource(), 10, 15);
    expect(feedback).not.toBeNull();

    const ind = b.querySelector<HTMLElement>(".tab-drop-indicator")!;
    expect(ind).not.toBeNull();
    // Flush with the bar's edges (previously inset 4px).
    expect(ind.style.top).toBe("0px");
    expect(ind.style.bottom).toBe("0px");
    expect(ind.style.width).toBe("3px");
    // Square + glow (matches the sidebar <drop-line> look).
    expect(ind.style.boxShadow).toContain("rgba(74,158,255");
    expect(ind.style.display).toBe("block");
  });

  it("does not re-append the indicator when reused across hovers", () => {
    const b = bar();
    const target = new TabBarDropTarget(b, "w1", 0);
    target.onHover(fakeTabSource(), 10, 15);
    expect(b.querySelectorAll(".tab-drop-indicator")).toHaveLength(1);

    target.onHover(fakeTabSource(), 20, 15);
    expect(b.querySelectorAll(".tab-drop-indicator")).toHaveLength(1);
  });

  it("hides the indicator for a same-cell drag at the tab's own position (no-op reorder)", () => {
    const b = bar();
    const t1 = document.createElement("div");
    t1.className = "tab-btn";
    t1.setAttribute("data-tab-id", "t1");
    const t2 = document.createElement("div");
    t2.className = "tab-btn";
    t2.setAttribute("data-tab-id", "t2");
    t1.getBoundingClientRect = () => rectFor(0);
    t2.getBoundingClientRect = () => rectFor(100);
    b.appendChild(t1);
    b.appendChild(t2);

    const target = new TabBarDropTarget(b, "w1", 0);
    const source = fakeTabSource("t1"); // dragged tab is at index 0

    // Over its own position (drop before itself) — no-op.
    target.onHover(source, 25, 15);
    const ind = b.querySelector<HTMLElement>(".tab-drop-indicator")!;
    expect(ind).not.toBeNull();
    expect(ind.style.display).toBe("none");
    // Over the boundary immediately after itself — no-op.
    target.onHover(source, 75, 15);
    expect(ind.style.display).toBe("none");
    // Beyond all tabs — a real move, indicator shows.
    target.onHover(source, 175, 15);
    expect(ind.style.display).toBe("block");
  });

  it("always shows the indicator for a cross-cell drag (source tab not in this bar)", () => {
    const b = bar();
    const t1 = document.createElement("div");
    t1.className = "tab-btn";
    t1.setAttribute("data-tab-id", "t1");
    t1.getBoundingClientRect = () => rectFor(0);
    b.appendChild(t1);

    const target = new TabBarDropTarget(b, "w1", 0);
    // Source tab (t9) is not in this bar — cross-cell move, always show.
    const source = fakeTabSource("t9");
    target.onHover(source, 25, 15);
    const ind = b.querySelector<HTMLElement>(".tab-drop-indicator")!;
    expect(ind.style.display).toBe("block");
  });
});
