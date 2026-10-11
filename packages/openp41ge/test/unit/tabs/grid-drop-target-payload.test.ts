/**
 * Unit tests for GridDropTarget typed-payload drags (openp41ge-core-tabs).
 *
 * A `payload` drag carries an extension DragPayload. The host injects a
 * resolver (kind → consumer → appType/tabConfig); the grid fires the same
 * grid-open-tab event as an `open-tab` drag, so existing host handlers apply.
 * With no resolver, or when it returns null (no consumer / context mismatch),
 * the grid shows no feedback and refuses the drop.
 */

import { describe, test, expect, afterEach, vi } from "vitest";
import {
  GridDropTarget,
  setPayloadOpenResolver,
} from "openp41ge-core-tabs/targets/grid-drop-target";
import type { IDragSource, PayloadDragData } from "openp41ge-core-tabs/interfaces";

interface FakeGrid extends HTMLElement {
  winId: string;
  pageData: {
    id: string;
    grid: {
      cols: number;
      placements: Array<{ position: { row: number; col: number }; tabIds: string[] }>;
    };
  };
}

function makeGrid(cols = 2, width = 800): FakeGrid {
  const grid = document.createElement("div") as FakeGrid;
  grid.winId = "win-1";
  grid.pageData = {
    id: "win-1",
    grid: {
      cols,
      placements: Array.from({ length: cols }, (_, col) => ({
        position: { row: 0, col },
        tabIds: [`tab-${col}`],
      })),
    },
  };
  const rect = {
    left: 0,
    top: 0,
    right: width,
    bottom: 400,
    width,
    height: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
  grid.getBoundingClientRect = () => rect;
  return grid;
}

const data: PayloadDragData = {
  type: "payload",
  payload: { kind: "openp41ge/file-path", filePath: "/repo/app.ts" },
  sourceId: "explorer-file",
  contexts: ["workspace"],
};

function payloadSource(d: PayloadDragData = data): IDragSource {
  return {
    type: "payload",
    createGhost: () => document.createElement("div"),
    getDragData: () => d,
    onDragStart() {},
    onDragEnd() {},
  };
}

afterEach(() => setPayloadOpenResolver(null));

describe("GridDropTarget — payload drags", () => {
  test("opens the resolved consumer with its tab config (cell drop)", async () => {
    const resolver = vi.fn(() => ({
      appType: "file-viewer",
      tabConfig: { filePath: "/repo/app.ts" },
    }));
    setPayloadOpenResolver(resolver);
    const grid = makeGrid();
    let detail: Record<string, unknown> | null = null;
    grid.addEventListener("grid-open-tab", (e) => (detail = (e as CustomEvent).detail));
    const result = await new GridDropTarget(grid, grid.winId).onDrop(payloadSource(), 200, 200);
    expect(result).toEqual({ success: true });
    expect(resolver).toHaveBeenCalledWith(data, { winId: "win-1", element: grid });
    expect(detail).toMatchObject({
      winId: "win-1",
      tabType: "file-viewer",
      tabConfig: { filePath: "/repo/app.ts" },
      targetCol: 0,
      pinned: true,
    });
  });

  test("splits a new column on a boundary drop", async () => {
    setPayloadOpenResolver(() => ({ appType: "log-viewer", tabConfig: { system: "git" } }));
    const grid = makeGrid(2, 800);
    let detail: Record<string, unknown> | null = null;
    grid.addEventListener("grid-open-tab", (e) => (detail = (e as CustomEvent).detail));
    const result = await new GridDropTarget(grid, grid.winId).onDrop(payloadSource(), 799, 200);
    expect(result).toEqual({ success: true });
    expect(detail).toMatchObject({ tabType: "log-viewer", isBoundary: true });
  });

  test("refuses the drop and shows no feedback when the resolver returns null", async () => {
    setPayloadOpenResolver(() => null);
    const grid = makeGrid();
    const listener = vi.fn();
    grid.addEventListener("grid-open-tab", listener);
    const target = new GridDropTarget(grid, grid.winId);
    expect(target.onHover(payloadSource(), 200, 200)).toBeNull();
    expect((await target.onDrop(payloadSource(), 200, 200)).success).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  test("refuses the drop when no resolver is installed", async () => {
    const grid = makeGrid();
    const target = new GridDropTarget(grid, grid.winId);
    expect(target.onHover(payloadSource(), 200, 200)).toBeNull();
    expect((await target.onDrop(payloadSource(), 200, 200)).success).toBe(false);
  });

  test("shows normal feedback when a consumer resolves", () => {
    setPayloadOpenResolver(() => ({ appType: "file-viewer", tabConfig: {} }));
    const grid = makeGrid();
    expect(new GridDropTarget(grid, grid.winId).onHover(payloadSource(), 200, 200)).toMatchObject({
      showGhost: true,
    });
  });
});
