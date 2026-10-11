/**
 * Unit tests for PayloadDragSource — the extension typed-payload drag source.
 */
import { describe, test, expect } from "vitest";
import { PayloadDragSource } from "@openp41ge/renderer/services/drag-sources/payload-drag-source";

const data = {
  type: "payload" as const,
  payload: { kind: "openp41ge/file-path", filePath: "/repo/app.ts" },
  sourceId: "explorer-file",
  contexts: ["workspace"],
  crossWindow: true,
  title: "app.ts",
};

describe("PayloadDragSource", () => {
  test("reports the payload drag type and data", () => {
    const source = new PayloadDragSource(data);
    expect(source.type).toBe("payload");
    expect(source.getDragData()).toBe(data);
  });

  test("createGhost returns an invisible, pointer-inert element", () => {
    const ghost = new PayloadDragSource(data).createGhost();
    expect(ghost.style.opacity).toBe("0");
    expect(ghost.style.pointerEvents).toBe("none");
  });
});
