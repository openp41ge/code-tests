/**
 * The shared extension runtime emits one module per shared specifier, each
 * re-exporting only that package (`export *`). Guards that the whole UI
 * toolkit — public API for extensions — is shared, that module paths are
 * unique and resolvable back to their specifier, and that no shared package
 * has a default export (`export *` would silently drop it).
 */
import { describe, it, expect } from "vitest";
import {
  RUNTIME_SPECIFIERS,
  runtimeModulePath,
  runtimeModuleSource,
  specifierForRuntimeModule,
} from "../../../vite.extension-runtime";

const UIKIT_SPECIFIERS = [
  "openp41ge-sdk-uikit",
  "openp41ge-sdk-uikit/theme",
  "openp41ge-sdk-uikit/file-editor",
  "openp41ge-sdk-uikit/tooltip",
  "openp41ge-sdk-uikit/drop-indicator",
  "openp41ge-sdk-uikit/json-editor",
];

describe("extension runtime modules", () => {
  it("shares every uikit entry point as public API", () => {
    expect(RUNTIME_SPECIFIERS).toEqual(expect.arrayContaining(UIKIT_SPECIFIERS));
  });

  it("gives each specifier a unique module path that resolves back to it", () => {
    const specifiers = RUNTIME_SPECIFIERS;
    const paths = specifiers.map(runtimeModulePath);
    expect(new Set(paths).size).toBe(paths.length);
    for (const s of specifiers) {
      expect(specifierForRuntimeModule(runtimeModulePath(s))).toBe(s);
      expect(specifierForRuntimeModule(`/${runtimeModulePath(s)}`)).toBe(s);
    }
    expect(specifierForRuntimeModule("extension-runtime/unknown.js")).toBeUndefined();
  });

  it("re-exports exactly its specifier", () => {
    expect(runtimeModuleSource("lit/directives/ref.js")).toBe(
      'export * from "lit/directives/ref.js";\n',
    );
  });

  it.each(RUNTIME_SPECIFIERS)("%s has no default export", async (specifier) => {
    const mod = (await import(/* @vite-ignore */ specifier)) as Record<string, unknown>;
    expect(Object.keys(mod)).not.toContain("default");
  });
});
