/**
 * <tab-grid> `focusVisible`: the focused cell's active tab shows the focus
 * line only while the grid holds the window's focus. With `focusVisible`
 * false (the window is blurred, or a sidebar is focused) no tab shows it, and
 * the focused cell is kept, so the line returns to the same tab.
 */
import { describe, it, expect, afterEach } from "vitest";
import "../../src/components/tabs/tab-grid";
import "../../src/components/tabs/tab-bar";
import "../../src/components/tabs/tab-content";

type Grid = HTMLElement & { focusVisible: boolean; updateComplete: Promise<boolean> };

function makeGrid(): Grid {
  const grid = document.createElement("tab-grid") as Grid;
  grid.setAttribute("winId", "w1");
  const g = grid as unknown as Record<string, unknown>;
  g.cols = 2;
  g.placements = [
    { position: { row: 0, col: 0 }, tabIds: ["a0"] },
    { position: { row: 0, col: 1 }, tabIds: ["a1"] },
  ];
  g.tabData = { a0: { title: "a0", content: "" }, a1: { title: "a1", content: "" } };
  g.activeTabIds = { "0": "a0", "1": "a1" };
  document.body.appendChild(grid);
  return grid;
}

async function settle(grid: Grid) {
  await grid.updateComplete;
  for (const bar of grid.querySelectorAll("tab-bar")) {
    await (bar as unknown as { updateComplete: Promise<boolean> }).updateComplete;
  }
}

function focusedTabs(grid: Grid): string[] {
  return [...grid.querySelectorAll("tab-bar")].flatMap((bar) =>
    [...(bar.shadowRoot ?? bar).querySelectorAll("[data-focused]")].map(
      (t) => (t as HTMLElement).dataset.tabId!,
    ),
  );
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("tab-grid focusVisible", () => {
  it("shows the line on the focused cell's active tab by default", async () => {
    const grid = makeGrid();
    await settle(grid);
    expect(focusedTabs(grid)).toEqual(["a0"]);
  });

  it("hides the line while focusVisible is false and restores it to the same tab", async () => {
    const grid = makeGrid();
    await settle(grid);
    grid.focusVisible = false;
    await settle(grid);
    expect(focusedTabs(grid)).toEqual([]);
    grid.focusVisible = true;
    await settle(grid);
    expect(focusedTabs(grid)).toEqual(["a0"]);
  });
});
