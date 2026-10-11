/**
 * Unit tests for the extension scope (host side): open/close and capture of
 * the registrations made through the SDK's `register*` functions. The round
 * trips guard the cross-package contract between this module and the SDK.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  beginExtensionScope,
  endExtensionScope,
  getScopedProcesses,
  getScopedRenderers,
  getScopedDragDecls,
} from "@openp41ge-core-extension-host/scope";
import {
  registerProcesses,
  registerRenderers,
  registerDragDecls,
  type SurfaceSpec,
} from "openp41ge-sdk";

afterEach(() => endExtensionScope());

const render = (() => ({})) as unknown as SurfaceSpec["render"];

describe("extension scope", () => {
  it("returns null from every getter when no scope is open", () => {
    expect(getScopedProcesses()).toBeNull();
    expect(getScopedRenderers()).toBeNull();
    expect(getScopedDragDecls()).toBeNull();
  });

  it("refuses to open a nested scope", () => {
    beginExtensionScope("ext-a", "1.0.0");
    expect(() => beginExtensionScope("ext-b", "1.0.0")).toThrow(/scope 'ext-a' is open/);
  });

  it("captures processes, renderers and drag declarations made through the SDK", () => {
    beginExtensionScope("ext-a", "1.0.0");
    const handler = () => undefined;
    registerProcesses({ "read-dir": handler });
    registerRenderers([{ kind: "grid", id: "main", title: "Main", render }]);
    registerDragDecls({
      dropTargets: [{ id: "attach", surface: "grid:main", accepts: ["openp41ge/file-path"] }],
    });

    expect(getScopedProcesses()?.get("read-dir")).toBe(handler);
    expect(getScopedRenderers()).toMatchObject([{ kind: "grid", id: "main" }]);
    expect(getScopedDragDecls()).toEqual({
      kinds: [],
      sources: [],
      consumers: [],
      dropTargets: [{ id: "attach", surface: "grid:main", accepts: ["openp41ge/file-path"] }],
    });
  });

  it("isolates registrations per scope and clears them on close", () => {
    beginExtensionScope("ext-a", "1.0.0");
    registerRenderers([{ kind: "grid", id: "a", title: "A", render }]);
    endExtensionScope();
    expect(getScopedRenderers()).toBeNull();

    beginExtensionScope("ext-b", "1.0.0");
    expect(getScopedRenderers()).toEqual([]);
  });

  it("makes the SDK's register functions throw once the scope is closed", () => {
    beginExtensionScope("ext-a", "1.0.0");
    endExtensionScope();
    expect(() => registerRenderers([])).toThrow(/outside an extension scope/);
  });
});
