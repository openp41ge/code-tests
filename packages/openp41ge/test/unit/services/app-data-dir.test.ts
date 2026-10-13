/**
 * Tests for the app-data directory resolver.
 *
 * Verifies the dev/release folder naming and the env-override precedence used
 * to decide where openp41ge stores its user data.
 */

import { describe, expect, test, beforeEach, afterEach } from "vitest";
import os from "os";
import path from "path";
import {
  APP_DATA_DIR_PRODUCTION,
  APP_DATA_DIR_DEV,
  appDataDirName,
  chromiumProfileDirName,
  resolveChromiumProfileDir,
  crashReportsDir,
  resolveAppDataDir,
} from "../../../src/main/services/app-data-dir";

describe("storage names", () => {
  test("the data folders are named for openp41ge code", () => {
    expect(APP_DATA_DIR_PRODUCTION).toBe(".openp41ge-code");
    expect(APP_DATA_DIR_DEV).toBe(".openp41ge-code-dev");
  });
});

describe("appDataDirName", () => {
  test("packaged release uses the production folder", () => {
    expect(appDataDirName(true)).toBe(APP_DATA_DIR_PRODUCTION);
  });

  test("dev build uses the -dev folder", () => {
    expect(appDataDirName(false)).toBe(APP_DATA_DIR_DEV);
  });
});

describe("chromiumProfileDirName", () => {
  test("packaged release's Chromium profile folder is the app's name", () => {
    expect(chromiumProfileDirName(true)).toBe("openp41ge code");
  });

  test("dev build has its own Chromium profile folder, so it never holds the release's storage locks", () => {
    expect(chromiumProfileDirName(false)).toBe("openp41ge code development");
  });
});

describe("resolveAppDataDir", () => {
  const orig = process.env;

  beforeEach(() => {
    process.env = { ...orig };
    delete process.env.OPENP41GE_E2E_DIR;
    delete process.env.OPENP41GE_DIR;
  });

  afterEach(() => {
    process.env = orig;
  });

  test("defaults under home to production folder when packaged", () => {
    expect(resolveAppDataDir(true)).toBe(path.join(os.homedir(), APP_DATA_DIR_PRODUCTION));
  });

  test("defaults under home to -dev folder when not packaged", () => {
    expect(resolveAppDataDir(false)).toBe(path.join(os.homedir(), APP_DATA_DIR_DEV));
  });

  test("OPENP41GE_DIR overrides the default regardless of packaged state", () => {
    process.env.OPENP41GE_DIR = "/tmp/custom-openp41ge";
    expect(resolveAppDataDir(true)).toBe("/tmp/custom-openp41ge");
    expect(resolveAppDataDir(false)).toBe("/tmp/custom-openp41ge");
  });

  test("ignores the retired OPENP41GE_E2E_DIR override", () => {
    process.env.OPENP41GE_E2E_DIR = "/tmp/e2e-openp41ge";
    expect(resolveAppDataDir(false)).toBe(path.join(os.homedir(), APP_DATA_DIR_DEV));
  });
});

describe("resolveChromiumProfileDir", () => {
  const orig = process.env;

  beforeEach(() => {
    process.env = { ...orig };
    delete process.env.OPENP41GE_DIR;
  });

  afterEach(() => {
    process.env = orig;
  });

  test("is the app's folder under the OS app-data folder", () => {
    expect(resolveChromiumProfileDir(true, "/AppData")).toBe(path.join("/AppData", "openp41ge code"));
    expect(resolveChromiumProfileDir(false, "/AppData")).toBe(
      path.join("/AppData", "openp41ge code development"),
    );
  });

  test("with OPENP41GE_DIR it lives inside that folder, so a throwaway run shares nothing", () => {
    process.env.OPENP41GE_DIR = "/tmp/throwaway";
    expect(resolveChromiumProfileDir(true, "/AppData")).toBe(path.join("/tmp/throwaway", "chromium-profile"));
    expect(resolveChromiumProfileDir(false, "/AppData")).toBe(path.join("/tmp/throwaway", "chromium-profile"));
  });
});

describe("crashReportsDir", () => {
  test("crash reports live in the Chromium profile folder, not a folder of their own", () => {
    expect(crashReportsDir("/AppData/openp41ge code")).toBe(path.join("/AppData/openp41ge code", "Crashpad"));
  });
});
