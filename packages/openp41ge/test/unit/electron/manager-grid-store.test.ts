/**
 * The manager window's grid file, in the app-data root (not in a
 * workspace's folder): written whole, read back, absent or unreadable → null.
 */
import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  MANAGER_GRID_FILE,
  readManagerGrid,
  writeManagerGrid,
} from "../../../electron/ipc-handlers/manager-grid-handlers";

let dir = "";
afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

describe("manager grid store", () => {
  it("writes the grid to the app-data root and reads it back", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "manager-grid-"));
    const grid = { version: 1, columns: [] };
    writeManagerGrid(dir, grid);
    expect(fs.existsSync(path.join(dir, MANAGER_GRID_FILE))).toBe(true);
    expect(readManagerGrid(dir)).toEqual(grid);
  });

  it("is null when there is none, or it is not JSON", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "manager-grid-"));
    expect(readManagerGrid(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, MANAGER_GRID_FILE), "{nope");
    expect(readManagerGrid(dir)).toBeNull();
  });
});
