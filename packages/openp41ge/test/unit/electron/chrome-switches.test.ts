/**
 * The Chromium switches the app starts with. Remote debugging (a local port
 * through which any program on the computer could drive the app's windows)
 * is only on in development builds, never in a release.
 */
import { describe, it, expect } from "vitest";
import { chromeSwitches } from "../../../electron/chrome-switches";

describe("chromeSwitches", () => {
  it("a release build has no remote debugging", () => {
    const names = chromeSwitches(true).map(([name]) => name);
    expect(names).not.toContain("remote-debugging-port");
    expect(names).not.toContain("remote-debugging-pipe");
  });

  it("a development build has remote debugging on 9222", () => {
    expect(chromeSwitches(false)).toContainEqual(["remote-debugging-port", "9222"]);
  });

  it("both keep the rendering switches", () => {
    for (const packaged of [true, false]) {
      expect(chromeSwitches(packaged)).toContainEqual(["disable-features", "FontationsFontBackend"]);
      expect(chromeSwitches(packaged)).toContainEqual(["enable-gpu-rasterization"]);
    }
  });
});
