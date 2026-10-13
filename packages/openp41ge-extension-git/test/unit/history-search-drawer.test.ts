/** Where the Git History Search options drawer and its mask go. */
import { describe, it, expect } from "vitest";
import { drawerPlacement } from "@openp41ge-extension-git/history-search-drawer";

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
});

describe("drawerPlacement", () => {
  it("opens left into the grid from a right sidebar, from its top", () => {
    const p = drawerPlacement(rect(900, 35, 300, 700), 1200, 800);
    // The mask covers the grid and the other sidebar: everything left of this one.
    expect(p).toEqual({
      side: "left",
      edge: 900,
      mask: { top: 35, bottom: 65, left: 0, right: 300 },
    });
  });

  it("opens right into the grid from a left sidebar", () => {
    const p = drawerPlacement(rect(0, 35, 280, 700), 1200, 800);
    expect(p).toEqual({
      side: "right",
      edge: 280,
      mask: { top: 35, bottom: 65, left: 280, right: 0 },
    });
  });
});
