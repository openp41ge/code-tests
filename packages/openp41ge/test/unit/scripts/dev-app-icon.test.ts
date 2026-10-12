/**
 * scripts/dev-app-icon.mjs: dev builds run Electron's own Electron.app, so the
 * dev icon goes into that bundle (Contents/Resources/electron.icns) — macOS
 * draws a bundle icon with the system's icon treatment, unlike an icon set at
 * runtime. The bundle's files may be hardlinks into the package store, which
 * other projects share, so the icon is replaced as a new file, never written
 * through.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { inApp } from "@code-tests/support";

const APP_HERE = inApp(__dirname);
const PKG = path.resolve(APP_HERE, "../../..");
const SCRIPT = path.join(PKG, "scripts/dev-app-icon.mjs");
const DEV_ICNS = path.join(PKG, "build/icon-dev.icns");

let dir: string;
let appPath: string;
let icon: string;
let storeCopy: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "dev-app-icon-"));
  appPath = path.join(dir, "Electron.app");
  fs.mkdirSync(path.join(appPath, "Contents/Resources"), { recursive: true });
  storeCopy = path.join(dir, "store-electron.icns");
  fs.writeFileSync(storeCopy, "electron's icon");
  icon = path.join(appPath, "Contents/Resources/electron.icns");
  fs.linkSync(storeCopy, icon);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("dev app icon", () => {
  it("ships a dev .icns", () => {
    expect(fs.readFileSync(DEV_ICNS).subarray(0, 4).toString("latin1")).toBe("icns");
  });

  it("puts the dev icon into the bundle without writing through a hardlink", async () => {
    const { installDevIcon } = await import(SCRIPT);
    expect(installDevIcon(appPath, DEV_ICNS)).toBe(true);
    expect(fs.readFileSync(icon).equals(fs.readFileSync(DEV_ICNS))).toBe(true);
    expect(fs.readFileSync(storeCopy, "utf8")).toBe("electron's icon");
  });

  it("does nothing when the bundle already has the dev icon", async () => {
    const { installDevIcon } = await import(SCRIPT);
    installDevIcon(appPath, DEV_ICNS);
    expect(installDevIcon(appPath, DEV_ICNS)).toBe(false);
  });
});
