/**
 * The focus line in a workspace window, end to end in the renderer: a
 * mousedown or a window focus change goes through the DOM bridge, the event
 * graph and the focus handlers into AppState, and <openp41ge-windowview>
 * moves the line — onto a sidebar's active tab when that sidebar is clicked,
 * back to the grid when the grid is clicked, and off while the window is
 * blurred.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import graphData from "../../../data/event-routing-graph.json";
import { EventGraph, type GraphData } from "../../../src/renderer/services/event-graph";
import { EventRouter } from "../../../src/renderer/services/event-router";
import { EventLogBuffer } from "../../../src/renderer/services/event-log-buffer";
import { appState } from "../../../src/renderer/services/app-state";
import { createFocusHandlers } from "../../../src/renderer/handlers/focus-state.handlers";
import { DOMBridge } from "../../../src/renderer/services/dom-bridge";
import "../../../src/renderer/components/openp41ge-windowview";

type El = HTMLElement & { updateComplete: Promise<unknown> } & Record<string, unknown>;

let bridge: DOMBridge;
let view: El;

const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 0));
    await view.updateComplete;
  }
};

beforeEach(async () => {
  appState.windowFocused = false;
  appState.focusedSide = null;
  const graph = new EventGraph();
  graph.load(graphData as GraphData);
  const router = new EventRouter({
    graph,
    state: appState,
    logBuffer: new EventLogBuffer(50),
    handlers: createFocusHandlers(appState),
  });
  view = document.createElement("openp41ge-windowview") as El;
  view.windowData = {
    id: "w1",
    grid: { rows: 1, placements: [{ position: { col: 0, row: 0 }, tabIds: ["t1"], activeTabId: "t1" }] },
    sidebar: { activeLeftTab: "files", activeRightTab: null },
  };
  view.workspaceData = {
    editorTabs: { t1: { id: "t1", appType: "placeholder", isPreview: false, config: {} } },
    sidebar: { leftSidebarOpen: true, leftSidebarTabs: ["files"], rightSidebarOpen: false, rightSidebarTabs: [] },
    windows: [],
  };
  document.body.appendChild(view);
  await settle();
  bridge = new DOMBridge(router);
  bridge.attach();
  window.dispatchEvent(new Event("focus"));
  await settle();
});

afterEach(() => {
  bridge.detach();
  document.body.innerHTML = "";
});

const sidebar = () => view.querySelector('openp41ge-sidebar[side="left"]') as El;
const grid = () => view.querySelector("tab-grid") as El;
const mousedown = async (el: Element) => {
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true, button: 0 }));
  await settle();
};

describe("workspace window focus line", () => {
  it("shows the line in the grid while the window is focused", () => {
    expect(grid().focusVisible).toBe(true);
    expect(sidebar().focused).toBe(false);
  });

  it("moves the line to a sidebar when it is clicked, and back to the grid", async () => {
    await mousedown(sidebar());
    expect(sidebar().focused).toBe(true);
    expect(grid().focusVisible).toBe(false);

    await mousedown(grid());
    expect(sidebar().focused).toBe(false);
    expect(grid().focusVisible).toBe(true);
  });

  it("hides the line while the window is blurred", async () => {
    window.dispatchEvent(new Event("blur"));
    await settle();
    expect(grid().focusVisible).toBe(false);
    expect(sidebar().focused).toBe(false);
  });
});
