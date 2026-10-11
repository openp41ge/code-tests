/**
 * Unit tests for TabBarDropTarget typed-payload drags (openp41ge-core-tabs): a
 * payload dropped on a cell's tab bar opens at the insert position under the
 * cursor (`insertAt`), resolved through the host's payload resolver.
 */
import { describe, test, expect, afterEach, vi } from "vitest";
import { TabBarDropTarget } from "openp41ge-core-tabs/targets/tab-bar-drop-target";
import { setPayloadOpenResolver } from "openp41ge-core-tabs/targets/grid-drop-target";
import type { IDragSource, PayloadDragData } from "openp41ge-core-tabs/interfaces";

const data: PayloadDragData = {
  type: "payload",
  payload: { kind: "openp41ge/file-path", filePath: "/repo/app.ts" },
  sourceId: "explorer-file",
  contexts: ["workspace"],
};

function source(): IDragSource {
  return {
    type: "payload",
    createGhost: () => document.createElement("div"),
    getDragData: () => data,
    onDragStart() {},
    onDragEnd() {},
  };
}

/** A tab bar with two 100px tab buttons at x 0–100 and 100–200. */
function makeBar(): HTMLElement {
  const bar = document.createElement("div");
  for (let i = 0; i < 2; i++) {
    const btn = document.createElement("div");
    btn.setAttribute("role", "tab");
    btn.setAttribute("data-tab-id", `t${i}`);
    btn.getBoundingClientRect = () =>
      ({
        left: i * 100,
        width: 100,
        right: i * 100 + 100,
        top: 0,
        bottom: 30,
        height: 30,
        x: i * 100,
        y: 0,
      }) as DOMRect;
    bar.appendChild(btn);
  }
  bar.getBoundingClientRect = () =>
    ({ left: 0, width: 300, right: 300, top: 0, bottom: 30, height: 30, x: 0, y: 0 }) as DOMRect;
  document.body.appendChild(bar);
  return bar;
}

afterEach(() => setPayloadOpenResolver(null));

describe("TabBarDropTarget — payload drags", () => {
  test("opens the resolved consumer at the insert index under the cursor", async () => {
    setPayloadOpenResolver(() => ({
      appType: "file-viewer",
      tabConfig: { filePath: "/repo/app.ts" },
    }));
    const bar = makeBar();
    let detail: Record<string, unknown> | null = null;
    bar.addEventListener("grid-open-tab", (e) => (detail = (e as CustomEvent).detail));
    // x=120 is left of tab 1's midpoint (150) → insert before tab 1 (index 1).
    const result = await new TabBarDropTarget(bar, "win-1", 2).onDrop(source(), 120, 10);
    expect(result).toEqual({ success: true });
    expect(detail).toEqual({
      winId: "win-1",
      tabType: "file-viewer",
      tabConfig: { filePath: "/repo/app.ts" },
      targetCol: 2,
      insertAt: 1,
      pinned: true,
    });
  });

  test("passes the bar's window and element to the resolver", async () => {
    const resolver = vi.fn(() => ({ appType: "file-viewer", tabConfig: {} }));
    setPayloadOpenResolver(resolver);
    const bar = makeBar();
    await new TabBarDropTarget(bar, "win-1", 0).onDrop(source(), 10, 10);
    expect(resolver).toHaveBeenCalledWith(data, { winId: "win-1", element: bar });
  });

  test("shows the insert line when a consumer resolves", () => {
    setPayloadOpenResolver(() => ({ appType: "file-viewer", tabConfig: {} }));
    const bar = makeBar();
    const feedback = new TabBarDropTarget(bar, "win-1", 0).onHover(source(), 120, 10);
    expect(feedback).toMatchObject({ overTabBar: true });
  });

  test("shows no feedback and refuses the drop when nothing opens the payload", async () => {
    setPayloadOpenResolver(() => null);
    const bar = makeBar();
    const listener = vi.fn();
    bar.addEventListener("grid-open-tab", listener);
    const target = new TabBarDropTarget(bar, "win-1", 0);
    expect(target.onHover(source(), 120, 10)).toBeNull();
    expect((await target.onDrop(source(), 120, 10)).success).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });
});
