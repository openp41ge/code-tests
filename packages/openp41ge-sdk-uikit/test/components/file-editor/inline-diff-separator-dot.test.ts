// @vitest-environment jsdom
/**
 * The inline diff's separator dot sits on the border between the two
 * line-number columns, straddling the old-number column's right edge. Gutter
 * cells clip their content (`.eg-cell { overflow: hidden }`), so the
 * old-number cell must not, or the dot's right half is cut off.
 */
import { describe, test, expect } from "vitest";
import { makeFeDiffBeforeColumn } from "../../../src/components/file-editor/fe-gutter-columns";

describe("inline diff separator dot", () => {
  const column = makeFeDiffBeforeColumn({ width: () => 40, lineHeight: () => 20, visible: () => true });

  test("straddles the old-number column's right edge, which does not clip it", () => {
    const cell = column.create();
    // The gutter adds its shared cell class (overflow: hidden) to every cell.
    cell.className = "eg-cell " + cell.className;
    column.update(cell, { key: 1, top: 0, height: 20 } as never, {
      hovered: false,
      data: { afterLabel: "1", afterCls: "", beforeLabel: "1", beforeCls: "" },
    } as never);
    const dot = cell.querySelector<HTMLElement>(".fe-inline-left-dot")!;
    expect(dot.style.left).toBe("100%");
    expect(dot.style.transform).toBe("translateX(-50%)");
    expect(cell.style.overflow).toBe("visible");
  });
});
