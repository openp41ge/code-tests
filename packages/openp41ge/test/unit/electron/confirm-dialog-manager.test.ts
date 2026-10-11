// @ts-nocheck
/**
 * Unit tests for the confirm-dialog centring logic.
 *
 * `computeConfirmBounds` is a pure function (no Electron dependency), but it
 * lives in a module that imports `electron` at the top level, so the module is
 * stubbed here the same way the auto-updater tests stub it.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("electron", () => ({
  app: { isPackaged: true },
  BrowserWindow: class {},
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  screen: { getDisplayMatching: vi.fn() },
}));

import { computeConfirmBounds } from "../../../electron/confirm-dialog-manager.js";

describe("computeConfirmBounds", () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1080 };

  it("centres the dialog over the parent on the same display", () => {
    const parent = { x: 100, y: 100, width: 800, height: 600 };
    const dialog = { width: 420, height: 200 };
    const { x, y } = computeConfirmBounds(parent, dialog, workArea);
    expect(x).toBe(100 + (800 - 420) / 2); // 290
    expect(y).toBe(100 + (600 - 200) / 2); // 300
  });

  it("clamps to the work area when the parent is near the right edge", () => {
    const parent = { x: 1800, y: 100, width: 800, height: 600 };
    const dialog = { width: 420, height: 200 };
    const { x } = computeConfirmBounds(parent, dialog, workArea);
    // 1800 + 190 = 1990 would overflow (1920) → clamp to 1920 - 420 = 1500.
    expect(x).toBe(1500);
  });

  it("clamps to the work area when the parent is near the bottom edge", () => {
    const parent = { x: 100, y: 900, width: 800, height: 600 };
    const dialog = { width: 420, height: 200 };
    const { y } = computeConfirmBounds(parent, dialog, workArea);
    // 900 + 200 = 1100 would overflow (1080) → clamp to 1080 - 200 = 880.
    expect(y).toBe(880);
  });

  it("clamps to a non-zero work-area origin on a secondary display", () => {
    const secondaryWorkArea = { x: 1920, y: 200, width: 1920, height: 1080 };
    const parent = { x: 3700, y: 500, width: 800, height: 600 };
    const dialog = { width: 420, height: 200 };
    const { x } = computeConfirmBounds(parent, dialog, secondaryWorkArea);
    // 3700 + 190 = 3890 would overflow (3840) → clamp to 3840 - 420 = 3420.
    expect(x).toBe(3420);
  });

  it("keeps the dialog fully inside the work area when the parent overflows above the origin", () => {
    const parent = { x: -200, y: -100, width: 800, height: 600 };
    const dialog = { width: 420, height: 200 };
    const { x, y } = computeConfirmBounds(parent, dialog, workArea);
    // x: -200 + 190 = -10 < 0 → clamp to 0. y: -100 + 200 = 100 (inside).
    expect(x).toBe(0);
    expect(y).toBe(100);
  });
});
