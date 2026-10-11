// @vitest-environment jsdom
/**
 * The manager window's grid remembers its tabs: it restores the saved
 * columns when it opens, and saves them after each change (never before the
 * load has finished, so an empty grid cannot overwrite what was saved).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerAppType } from "../../../src/renderer/apps/app-registry";
import { Openp41geManagerGrid } from "../../../src/renderer/components/openp41ge-manager-grid";

const APP = "test:manager-cell";

beforeEach(() => {
  registerAppType({
    id: APP,
    label: "Cell",
    icon: "",
    description: "",
    createController: (tabId) =>
      ({
        tabId,
        appType: APP,
        mount: () => {},
        unmount: () => {},
        setVisible: () => {},
        snapshot: () => ({}),
        restore: () => {},
      }) as never,
  });
});

afterEach(() => {
  Openp41geManagerGrid.deps = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const saved = {
  version: 1,
  columns: [
    {
      tabs: [
        { appType: APP, title: "One", config: { path: "/w/1" }, pinned: true },
        { appType: APP, title: "Two", config: { path: "/w/2" }, pinned: false },
      ],
      active: 1,
    },
    { tabs: [{ appType: APP, title: "Three", config: { path: "/w/3" }, pinned: true }], active: 0 },
  ],
};

async function mount(load: () => Promise<unknown>, save = vi.fn(async () => {})) {
  Openp41geManagerGrid.deps = { load, save };
  const grid = new Openp41geManagerGrid();
  document.body.appendChild(grid);
  await grid.updateComplete;
  return { grid, save };
}

const state = (grid: Openp41geManagerGrid) =>
  grid as unknown as {
    _tabs: Array<{ id: string; title: string; pinned?: boolean }>;
    _placements: Array<{ tabIds: string[]; activeTabId: string }>;
  };

describe("manager grid persistence", () => {
  it("restores the saved columns, their tabs and which is active", async () => {
    const { grid } = await mount(async () => saved);
    await vi.waitFor(() => expect(state(grid)._tabs).toHaveLength(3));
    const { _tabs, _placements } = state(grid);
    const title = (id: string) => _tabs.find((t) => t.id === id)?.title;
    expect(_placements.map((p) => p.tabIds.map(title))).toEqual([["One", "Two"], ["Three"]]);
    expect(title(_placements[0].activeTabId)).toBe("Two");
    expect(_tabs.find((t) => t.title === "Two")?.pinned).toBe(false);
  });

  it("saves the tabs after a change", async () => {
    vi.useFakeTimers();
    const { grid, save } = await mount(async () => null);
    await vi.advanceTimersByTimeAsync(0);
    grid.openApp(APP, "New", { path: "/w/new" });
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenLastCalledWith({
      version: 1,
      columns: [
        {
          tabs: [{ appType: APP, title: "New", config: { path: "/w/new" }, pinned: false }],
          active: 0,
        },
      ],
    });
  });

  it("saves nothing before the saved tabs have loaded", async () => {
    vi.useFakeTimers();
    let finish!: (v: unknown) => void;
    const { save } = await mount(() => new Promise((r) => (finish = r)));
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).not.toHaveBeenCalled();
    finish(saved);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).not.toHaveBeenCalled(); // restoring is not a change worth saving
  });
});
