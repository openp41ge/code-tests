/**
 * Focus routing through the real event graph and focus handlers.
 *
 * A window remembers which zone it was focused on (a sidebar, or the grid)
 * while it is blurred, so the focused tab's line comes back where it was when
 * the window is focused again. Clicking a zone moves focus to it from any
 * other zone.
 */
import { describe, it, expect, beforeEach } from "vitest";
import graphData from "../../../data/event-routing-graph.json";
import { EventGraph, type GraphData } from "../../../src/renderer/services/event-graph";
import { EventRouter } from "../../../src/renderer/services/event-router";
import { EventLogBuffer } from "../../../src/renderer/services/event-log-buffer";
import { AppState } from "../../../src/renderer/services/app-state";
import { createFocusHandlers } from "../../../src/renderer/handlers/focus-state.handlers";

let state: AppState;
let router: EventRouter;

beforeEach(() => {
  const graph = new EventGraph();
  expect(graph.load(graphData as GraphData)).toEqual([]);
  state = new AppState();
  router = new EventRouter({
    graph,
    state,
    logBuffer: new EventLogBuffer(50),
    handlers: createFocusHandlers(state),
  });
});

const focus = () => ({ windowFocused: state.windowFocused, focusedSide: state.focusedSide });

describe("focus routing", () => {
  it("moves focus from the grid to either sidebar and back", async () => {
    await router.emit("window-focus", {});
    expect(focus()).toEqual({ windowFocused: true, focusedSide: null });

    await router.emit("sidebar-click-left", {});
    expect(focus()).toEqual({ windowFocused: true, focusedSide: "left" });

    await router.emit("sidebar-click-right", {});
    expect(focus()).toEqual({ windowFocused: true, focusedSide: "right" });

    await router.emit("grid-click", {});
    expect(focus()).toEqual({ windowFocused: true, focusedSide: null });

    await router.emit("sidebar-click-right", {});
    expect(focus()).toEqual({ windowFocused: true, focusedSide: "right" });
  });

  it("remembers the focused zone while the window is blurred", async () => {
    await router.emit("window-focus", {});
    await router.emit("sidebar-click-left", {});

    await router.emit("window-blur", {});
    expect(focus()).toEqual({ windowFocused: false, focusedSide: "left" });

    await router.emit("window-focus", {});
    expect(focus()).toEqual({ windowFocused: true, focusedSide: "left" });
  });

  it("focuses the window on a click into a blurred window", async () => {
    await router.emit("window-focus", {});
    await router.emit("sidebar-click-left", {});
    await router.emit("window-blur", {});

    await router.emit("grid-click", {});
    expect(focus()).toEqual({ windowFocused: true, focusedSide: null });
  });
});
