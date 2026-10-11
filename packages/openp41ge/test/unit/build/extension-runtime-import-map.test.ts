/**
 * Unit tests for the shared extension runtime's import map: every shared
 * specifier routes to its own runtime module, so extensions share the one SDK
 * instance. The pre-rename SDK name is not mapped (no extension uses it).
 */
import { describe, it, expect } from "vitest";
import { RUNTIME_SPECIFIERS, buildRuntimeImportMap } from "../../../vite.extension-runtime";

const BASE = "./";

describe("extension runtime import map", () => {
  it("maps the SDK, and not its pre-rename name", () => {
    const { imports } = buildRuntimeImportMap(BASE);
    expect(imports["openp41ge-sdk"]).toBe(`${BASE}extension-runtime/openp41ge-sdk.js`);
    expect(imports["openp41ge-extension-api"]).toBeUndefined();
  });

  it("maps exactly the shared specifiers, each to its own module", () => {
    const { imports } = buildRuntimeImportMap("/");
    expect(Object.keys(imports).sort()).toEqual([...RUNTIME_SPECIFIERS].sort());
    const urls = RUNTIME_SPECIFIERS.map((s) => imports[s]);
    expect(new Set(urls).size).toBe(urls.length);
    expect(imports["lit/directives/ref.js"]).toBe("/extension-runtime/lit__directives__ref.js");
  });

  it("exposes no host-only API", () => {
    const { imports } = buildRuntimeImportMap(BASE);
    expect(Object.keys(imports).some((s) => s.includes("/runtime"))).toBe(false);
    expect(Object.keys(imports)).toContain("lit");
  });
});
