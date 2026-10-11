/**
 * Extension registration at bootstrap: fetch the active extensions from main,
 * load their renderer entries, and load them again whenever the set changes.
 */
import { describe, it, expect, vi } from "vitest";

const calls: string[] = [];
let changed: (() => void) | null = null;

vi.mock("../../../../src/renderer/services/extension-contributions", () => ({
  onExtensionsChanged: (fn: () => void) => {
    changed = fn;
    return () => {};
  },
  refreshActiveExtensions: vi.fn(async () => {
    calls.push("refresh");
    return [];
  }),
}));
vi.mock("../../../../src/renderer/services/extension-renderer-loader", () => ({
  registerRendererExtensions: vi.fn(async () => {
    calls.push("load");
  }),
}));

describe("registerExtensionsWithRefresh", () => {
  it("loads the active extensions' renderers, and again when they change", async () => {
    const { registerExtensionsWithRefresh } =
      await import("../../../../src/renderer/apps/extension/index");
    await registerExtensionsWithRefresh();
    expect(calls).toEqual(["refresh", "load"]);
    changed?.();
    await vi.waitFor(() => expect(calls).toEqual(["refresh", "load", "load"]));
  });
});
