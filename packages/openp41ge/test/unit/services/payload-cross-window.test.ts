/**
 * Unit tests for source-driven cross-window payload drops: mapping the main
 * process hit-test (`drag.check`) to a `grid-open-tab` in the target window.
 */
import { describe, it, expect, vi } from "vitest";
import {
  resolveCrossWindowPayloadDrop,
  type WindowSummary,
} from "@openp41ge/renderer/services/payload-cross-window";
import type { PayloadDragData } from "@openp41ge/renderer/openp41ge-tabs-adapter";

const data: PayloadDragData = {
  type: "payload",
  payload: { kind: "openp41ge/file-path", filePath: "/r/a.ts" },
  sourceId: "file",
  contexts: ["workspace"],
  crossWindow: true,
};

const windows: WindowSummary[] = [
  { windowId: "w1", windowType: "workspace", workspacePath: "/ws/a" },
  { windowId: "w2", windowType: "workspace", workspacePath: "/ws/a" },
  { windowId: "w3", windowType: "workspace", workspacePath: "/ws/b" },
  { windowId: "m1", windowType: "manager", workspacePath: null },
];

const resolve = vi.fn(() => ({ appType: "file-viewer", tabConfig: { filePath: "/r/a.ts" } }));

function run(check: unknown, d: PayloadDragData = data, r = resolve) {
  return resolveCrossWindowPayloadDrop({
    check: check as never,
    myWinId: "w1",
    windows,
    data: d,
    resolve: r,
  });
}

describe("resolveCrossWindowPayloadDrop", () => {
  it("reports outside when the release is over no window", () => {
    expect(run(null)).toEqual({ kind: "outside" });
  });

  it("leaves a release over the source window to the local drop", () => {
    expect(run({ windowId: "w1", target: { type: "grid-move", winId: "w1", col: 0 } })).toEqual({
      kind: "local",
    });
  });

  it("opens in another window of the same workspace (cell)", () => {
    expect(run({ windowId: "w2", target: { type: "grid-move", winId: "w2", col: 1 } })).toEqual({
      kind: "open",
      detail: {
        winId: "w2",
        tabType: "file-viewer",
        tabConfig: { filePath: "/r/a.ts" },
        targetCol: 1,
        pinned: true,
      },
    });
  });

  it("treats a tab-bar hit as a drop at that position in the cell", () => {
    const r = run({
      windowId: "w2",
      target: { type: "tab-bar", winId: "w2", col: 2, dropIndex: 0 },
    });
    expect(r).toMatchObject({ kind: "open", detail: { winId: "w2", targetCol: 2, insertAt: 0 } });
  });

  it("splits a new column on a boundary hit", () => {
    const r = run({
      windowId: "w2",
      target: { type: "grid-split", winId: "w2", splitCol: 0, splitLeft: false },
    });
    expect(r).toMatchObject({
      kind: "open",
      detail: { winId: "w2", isBoundary: true, splitCol: 0, splitLeft: false, targetCol: 0 },
    });
  });

  it("does nothing over a window of another workspace", () => {
    expect(run({ windowId: "w3", target: { type: "grid-move", winId: "w3", col: 0 } })).toEqual({
      kind: "none",
    });
  });

  it("does nothing over a window whose context the source does not allow", () => {
    expect(run({ windowId: "m1", target: { type: "grid-move", winId: "m1", col: 0 } })).toEqual({
      kind: "none",
    });
  });

  it("does nothing for a non-cross-window source", () => {
    expect(
      run(
        { windowId: "w2", target: { type: "grid-move", winId: "w2", col: 0 } },
        {
          ...data,
          crossWindow: false,
        },
      ),
    ).toEqual({ kind: "none" });
  });

  it("does nothing when no consumer opens the kind", () => {
    expect(
      run(
        { windowId: "w2", target: { type: "grid-move", winId: "w2", col: 0 } },
        data,
        vi.fn(() => null),
      ),
    ).toEqual({ kind: "none" });
  });

  it("does nothing over a non-grid part of another window", () => {
    expect(run({ windowId: "w2", target: null })).toEqual({ kind: "none" });
    expect(run({ windowId: "w2", target: { type: "manager-tab-bar", dropIndex: 0 } })).toEqual({
      kind: "none",
    });
  });
});
