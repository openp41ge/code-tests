/**
 * The manager window's sidebar tab strip measures whether its tabs overflow
 * (`scrollWidth > clientWidth`) after every render and toggles
 * `.wm-tabbar-scroll--overflow` from it. That class must only change how the
 * strip paints, never its size: when it removed the last tab's 1px border, a
 * sidebar width one pixel short of fitting the tabs made the strip overflow,
 * the class shrank it to fit, the measurement dropped the class, the border
 * came back and it overflowed again — an endless render loop that froze the
 * window mid-resize (renderer at 100% CPU).
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { Openp41geWindowManager } from "../../../src/renderer/components/openp41ge-window-manager";

function stubWindow(): void {
  (window as unknown as { openp41ge: unknown }).openp41ge = {
    drag: {
      start: vi.fn(),
      activate: vi.fn(),
      move: vi.fn(),
      end: vi.fn(),
      prepareBitmap: vi.fn(),
      onEndSession: vi.fn(() => () => {}),
    },
    windowManager: {
      openWindowSummaries: vi.fn().mockResolvedValue([]),
      onOpenWindowsChanged: vi.fn(() => () => {}),
      openWorkspaceWindow: vi.fn(),
      onActivateTab: vi.fn(() => () => {}),
    },
    workspace: {
      getWindowId: vi.fn(() => "win-ws1-0"),
      getLaunchTab: vi.fn(() => null),
    },
    welcome: {
      isDismissed: vi.fn().mockResolvedValue(true),
    },
  };
}

async function mount(): Promise<Openp41geWindowManager> {
  const wm = new Openp41geWindowManager();
  document.body.appendChild(wm);
  await wm.updateComplete;
  await vi.advanceTimersByTimeAsync(40);
  return wm;
}

/** Declarations of every rule whose selector mentions `className`. */
function declarationsFor(wm: Openp41geWindowManager, className: string): string[] {
  const css = [...wm.shadowRoot!.querySelectorAll("style")]
    .map((s) => s.textContent ?? "")
    .join("\n");
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const decls: string[] = [];
  for (const m of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].includes(className)) continue;
    for (const d of m[2].split(";")) {
      const prop = d.split(":")[0].trim();
      if (prop) decls.push(prop);
    }
  }
  return decls;
}

/** Properties that change only how a box paints, never its size or position. */
const PAINT_ONLY = new Set([
  "border-color",
  "border-right-color",
  "border-left-color",
  "border-top-color",
  "border-bottom-color",
  "color",
  "background",
  "background-color",
  "box-shadow",
  "opacity",
  "outline-color",
]);

describe("window-manager sidebar tab strip overflow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubWindow();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  test("the overflow class only changes paint, so measuring it cannot flip it back", async () => {
    const wm = await mount();
    const decls = declarationsFor(wm, "wm-tabbar-scroll--overflow");
    expect(decls.length).toBeGreaterThan(0);
    expect(decls.filter((p) => !PAINT_ONLY.has(p))).toEqual([]);
  });
});
