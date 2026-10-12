// @vitest-environment jsdom
/**
 * Grid tabs drag in the manager window too. Its grid is inside shadow roots
 * (<openp41ge-window-manager> → <openp41ge-manager-grid> → <tab-grid>), where a
 * document listener's `e.target` is the outermost host, so the drag system
 * finds the pressed tab through the event's composed path. A press on a tab's
 * close button is not a drag, and the Logs window (which drags its own tabs)
 * is left alone. A manager grid tab dropped outside its window is cancelled:
 * it is not a workspace tab, so it is never detached into a workspace window.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initDragSystem } from "@openp41ge/renderer/services/init-drag-system";

type Hooks = {
  getCurrentDragSourceType: () => string | null;
  getCurrentDragData: () => Record<string, unknown> | null;
  resetTestDragState: () => void;
};
const hooks = () => (window as unknown as { __openp41geTestHooks: Hooks }).__openp41geTestHooks;

let cleanup: () => void;
let detachTab: ReturnType<typeof vi.fn>;
let check: ReturnType<typeof vi.fn>;

beforeEach(() => {
  detachTab = vi.fn();
  check = vi.fn().mockResolvedValue(null);
  (window as unknown as { openp41ge: unknown }).openp41ge = {
    workspace: { getWindowId: vi.fn().mockReturnValue("mgr-1"), dispatch: vi.fn(), detachTab },
    drag: {
      start: vi.fn(),
      move: vi.fn(),
      end: vi.fn(),
      activate: vi.fn(),
      ghostForward: vi.fn(),
      check,
      getActive: vi.fn().mockResolvedValue(null),
      endSession: vi.fn(),
      onEndSession: vi.fn().mockReturnValue(() => {}),
      onGhostShow: vi.fn().mockReturnValue(() => {}),
      onDragState: vi.fn().mockReturnValue(() => {}),
    },
    workspaceController: {},
    file: { readRange: vi.fn() },
  };
  cleanup = initDragSystem();
});

afterEach(() => {
  hooks().resetTestDragState();
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

/** A grid tab bar two shadow roots deep, like the manager window's. */
async function managerBar(hostAttr?: string) {
  const outer = document.createElement("div");
  if (hostAttr) outer.setAttribute(hostAttr, "");
  document.body.appendChild(outer);
  const inner = document.createElement("div");
  outer.attachShadow({ mode: "open" }).appendChild(inner);
  const bar = document.createElement("tab-bar") as HTMLElement & Record<string, unknown>;
  bar.winId = "manager-grid";
  bar.col = 0;
  bar.tabIds = ["t1"];
  bar.tabs = { t1: { title: "One", pinned: true } };
  bar.activeTabId = "t1";
  inner.attachShadow({ mode: "open" }).appendChild(bar);
  await (bar as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  return bar;
}

const press = (el: Element) =>
  el.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, composed: true, cancelable: true, button: 0 }),
  );

describe("manager grid tab drags", () => {
  it("a press on a grid tab inside shadow roots starts a tab drag", async () => {
    const bar = await managerBar();
    press(bar.querySelector('[data-tab-id="t1"]')!);
    expect(hooks().getCurrentDragSourceType()).toBe("tab");
    expect(hooks().getCurrentDragData()).toMatchObject({ tabId: "t1", winId: "manager-grid" });
  });

  it("a press on the tab's close button does not", async () => {
    const bar = await managerBar();
    press(bar.querySelector('[data-close-tab-id="t1"]')!);
    expect(hooks().getCurrentDragSourceType()).toBeNull();
  });

  it("leaves tabs of a window that drags its own (the Logs window) alone", async () => {
    const bar = await managerBar("data-own-tab-drags");
    press(bar.querySelector('[data-tab-id="t1"]')!);
    expect(hooks().getCurrentDragSourceType()).toBeNull();
  });

  it("cancels a manager grid tab dropped outside its window", async () => {
    document.dispatchEvent(
      new CustomEvent("openp41ge-drag-detach", {
        detail: {
          winId: "manager-grid",
          tabId: "t1",
          screenX: 5000,
          screenY: 5000,
          bounds: { x: 0, y: 0, width: 100, height: 100 },
        },
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(check).not.toHaveBeenCalled();
    expect(detachTab).not.toHaveBeenCalled();
  });
});
