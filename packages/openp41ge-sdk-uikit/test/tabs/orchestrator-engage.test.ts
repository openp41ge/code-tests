/**
 * DragOrchestrator.engage — start the pending drag where the pointer is, as
 * if it had crossed the movement threshold (a long-press). Engaging twice, or
 * with no pending drag, does nothing.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { DragOrchestrator, DRAG_EVENTS } from "openp41ge-core-tabs/orchestrator";
import type { IDragSource } from "openp41ge-core-tabs/interfaces";

afterEach(() => {
  document.querySelectorAll("[data-test-ghost]").forEach((g) => g.remove());
  document.body.style.overflow = "";
});

function makeSource(): IDragSource & { onDragStart: ReturnType<typeof vi.fn> } {
  return {
    type: "payload",
    createGhost: () => {
      const g = document.createElement("div");
      g.setAttribute("data-test-ghost", "");
      return g;
    },
    getDragData: () => ({ type: "tab", tabId: "a", winId: "w1", worksetId: "0" }),
    onDragStart: vi.fn(),
    onDragEnd: () => {},
  } as IDragSource & { onDragStart: ReturnType<typeof vi.fn> };
}

const at = { clientX: 10, clientY: 20, screenX: 110, screenY: 220 };

describe("DragOrchestrator.engage", () => {
  it("starts the pending drag in place, without any movement", () => {
    const orchestrator = new DragOrchestrator(() => null);
    const source = makeSource();
    const positions: unknown[] = [];
    const onPosition = (e: Event) => positions.push((e as CustomEvent).detail);
    document.addEventListener(DRAG_EVENTS.POSITION, onPosition);
    try {
      orchestrator.startDrag(source, at.clientX, at.clientY);
      expect(source.onDragStart).not.toHaveBeenCalled();

      expect(orchestrator.engage(at)).toBe(true);
      expect(source.onDragStart).toHaveBeenCalledTimes(1);
      expect(document.querySelector("[data-test-ghost]")).not.toBeNull();
      expect(positions).toEqual([{ screenX: 110, screenY: 220 }]);

      // Already engaged: nothing more happens.
      expect(orchestrator.engage(at)).toBe(false);
      expect(source.onDragStart).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener(DRAG_EVENTS.POSITION, onPosition);
      orchestrator.dispose();
    }
  });

  it("does nothing without a pending drag", () => {
    const orchestrator = new DragOrchestrator(() => null);
    expect(orchestrator.engage(at)).toBe(false);
    orchestrator.dispose();
  });
});
