// @vitest-environment jsdom
/**
 * Regression test: dragging selected text out of the window (a native HTML5
 * drag) must not open a "file" window. The platform once treated any native
 * text drag whose text looked like a path (`notes.txt`) as a file dragged
 * from the old explorer tree, and opened it in a new window on drag-out.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initDragSystem } from "@openp41ge/renderer/services/init-drag-system";

/** A native drag event carrying `text`, as Chromium sends it. */
function nativeDrag(type: "dragstart" | "dragend", text: string, dropEffect = "none"): Event {
  const e = new Event(type, { bubbles: true });
  Object.defineProperty(e, "dataTransfer", {
    value: { types: ["text/plain"], getData: () => text, dropEffect },
  });
  Object.defineProperty(e, "screenX", { value: 900 });
  Object.defineProperty(e, "screenY", { value: 700 });
  return e;
}

describe("native text drags", () => {
  let cleanup: () => void;
  let dispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dispatch = vi.fn();
    (window as unknown as { openp41ge: unknown }).openp41ge = {
      workspace: { getWindowId: vi.fn().mockReturnValue("win-1"), dispatch },
      drag: {
        start: vi.fn(),
        move: vi.fn(),
        end: vi.fn(),
        activate: vi.fn(),
        ghostForward: vi.fn(),
        check: vi.fn().mockResolvedValue(null),
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
    cleanup();
    document.body.innerHTML = "";
  });

  it("dropping selected text outside the window opens nothing", () => {
    const text = document.createElement("p");
    document.body.appendChild(text);
    text.dispatchEvent(nativeDrag("dragstart", "notes.txt"));
    text.dispatchEvent(nativeDrag("dragend", "notes.txt"));
    expect(dispatch).not.toHaveBeenCalledWith(
      "actionOpenFileInNewWindow",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});
