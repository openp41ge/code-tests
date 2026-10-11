// @vitest-environment jsdom
/**
 * The manager grid's preview (unpinned) tabs and tab icons:
 *   - a preview opened while a cell is focused replaces that cell's preview
 *     tab, in place; a pinned tab is never replaced;
 *   - the focused cell follows clicks on tabs and cell content;
 *   - a settings tab shows the settings gear, as in workspace windows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerAppType } from "../../../src/renderer/apps/app-registry";
import { Openp41geManagerGrid } from "../../../src/renderer/components/openp41ge-manager-grid";
import { settingsIcon } from "../../../src/renderer/icons";

const APP = "test:preview-cell";
const SETTINGS_APP = "test:settings-cell";
let unmounted: string[];

function controller(appType: string) {
  return (tabId: string) =>
    ({
      tabId,
      appType,
      mount: () => {},
      unmount: () => unmounted.push(tabId),
      setVisible: () => {},
      snapshot: () => ({}),
      restore: () => {},
    }) as never;
}

beforeEach(() => {
  unmounted = [];
  registerAppType({
    id: APP,
    label: "Cell",
    icon: "",
    description: "",
    createController: controller(APP),
  });
  registerAppType({
    id: SETTINGS_APP,
    label: "Settings",
    icon: "⚙",
    description: "",
    createController: controller(SETTINGS_APP),
    settings: true,
  });
});

afterEach(() => {
  Openp41geManagerGrid.deps = null;
  document.body.innerHTML = "";
});

async function mount() {
  Openp41geManagerGrid.deps = { load: async () => null, save: vi.fn(async () => {}) };
  const grid = new Openp41geManagerGrid();
  document.body.appendChild(grid);
  await grid.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  return grid;
}

const state = (grid: Openp41geManagerGrid) =>
  grid as unknown as {
    _tabs: Array<{ id: string; title: string; pinned?: boolean; icon?: string }>;
    _placements: Array<{ tabIds: string[]; activeTabId: string }>;
  };
/** Drop an open-tab payload on the grid, as <tab-grid> reports it. */
function drop(
  grid: Openp41geManagerGrid,
  title: string,
  config: Record<string, unknown>,
  where: Record<string, unknown>,
) {
  grid.shadowRoot!.querySelector("tab-grid")!.dispatchEvent(
    new CustomEvent("grid-open-tab", {
      bubbles: true,
      composed: true,
      detail: { tabType: APP, tabConfig: config, title, pinned: true, ...where },
    }),
  );
}

const titles = (grid: Openp41geManagerGrid) =>
  state(grid)._placements.map((p) =>
    p.tabIds.map((id) => state(grid)._tabs.find((t) => t.id === id)?.title),
  );

describe("manager grid preview tabs", () => {
  it("replaces the focused cell's preview with the next preview, in place", async () => {
    const grid = await mount();
    grid.openApp(APP, "A", { path: "a" });
    const a = state(grid)._tabs[0].id;
    await vi.waitFor(() =>
      expect((grid as unknown as { _mounts: Map<string, unknown> })._mounts.has(a)).toBe(true),
    );
    grid.openApp(APP, "B", { path: "b" });
    expect(titles(grid)).toEqual([["B"]]);
    expect(unmounted).toContain(a);
  });

  it("never replaces a pinned tab", async () => {
    const grid = await mount();
    grid.openApp(APP, "A", { path: "a" }, undefined, true);
    grid.openApp(APP, "B", { path: "b" });
    expect(titles(grid).flat()).toEqual(["A", "B"]);
  });

  it("replaces the preview in whichever cell was focused last", async () => {
    const grid = await mount();
    grid.openApp(APP, "A", { path: "a" });
    drop(grid, "P", { path: "p" }, { isBoundary: true, splitCol: 0, splitLeft: false });
    // Two cells: [A(preview)] [P(pinned)]; the user focuses the first.
    grid
      .shadowRoot!.querySelector("tab-grid")!
      .dispatchEvent(new CustomEvent("grid-focus-col", { bubbles: true, detail: { col: 0 } }));
    grid.openApp(APP, "B", { path: "b" });
    expect(titles(grid)).toEqual([["B"], ["P"]]);
  });
});

describe("manager grid: where tabs open", () => {
  it("opens a preview in the cell last activated — a dropped tab's cell — beside its pinned tab", async () => {
    const grid = await mount();
    grid.openApp(APP, "A", { path: "a" });
    // Dropped at the first cell's right edge: a second cell, pinned, now focused.
    drop(grid, "B", { path: "b" }, { isBoundary: true, splitCol: 0, splitLeft: false });
    expect(titles(grid)).toEqual([["A"], ["B"]]);
    grid.openApp(APP, "C", { path: "c" });
    expect(titles(grid)).toEqual([["A"], ["B", "C"]]);
    const second = state(grid)._placements[1];
    expect(state(grid)._tabs.find((t) => t.id === second.activeTabId)?.title).toBe("C");
  });

  it("adds a tab dropped onto a cell to that cell", async () => {
    const grid = await mount();
    grid.openApp(APP, "A", { path: "a" }, undefined, true);
    drop(grid, "B", { path: "b" }, { targetCol: 0 });
    expect(titles(grid)).toEqual([["A", "B"]]);
  });

  it("opens a pinned tab in the focused cell too, and only an empty grid gets a new cell", async () => {
    const grid = await mount();
    grid.openApp(APP, "A", { path: "a" }, undefined, true);
    grid.openApp(APP, "B", { path: "b" }, undefined, true);
    expect(titles(grid)).toEqual([["A", "B"]]);
  });
});

describe("manager grid preview tabs after a restore", () => {
  it("replaces a preview in the first cell, which the grid shows focused, before any click", async () => {
    Openp41geManagerGrid.deps = {
      load: async () => ({
        version: 1,
        columns: [
          { tabs: [{ appType: APP, title: "A", config: { path: "a" }, pinned: false }], active: 0 },
          { tabs: [{ appType: APP, title: "B", config: { path: "b" }, pinned: false }], active: 0 },
        ],
      }),
      save: vi.fn(async () => {}),
    };
    const grid = new Openp41geManagerGrid();
    document.body.appendChild(grid);
    await vi.waitFor(() => expect(state(grid)._tabs).toHaveLength(2));
    grid.openApp(APP, "C", { path: "c" });
    expect(titles(grid)).toEqual([["C"], ["B"]]);
  });
});

describe("manager grid tab icons", () => {
  it("shows the settings gear on a settings tab", async () => {
    const grid = await mount();
    grid.openApp(SETTINGS_APP, "Explorer Settings", { path: "config:x" });
    expect(state(grid)._tabs[0].icon).toBe(settingsIcon(14));
  });
});
