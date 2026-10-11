import { describe, it, expect, beforeAll } from "vitest";
import {
  beginExtensionScope,
  endExtensionScope,
  getScopedRenderers,
  getScopedDragDecls,
  getScopedConfigSchema,
} from "openp41ge-core-extension-host/scope";
import {
  validateDragDeclSurfaces,
  configDefaults,
  type ConfigSchema,
  type DragDecls,
  type SurfaceSpec,
} from "openp41ge-sdk";

let renderers: readonly SurfaceSpec[] | null = null;
let drag: DragDecls | null = null;
let configSchema: ConfigSchema | null = null;

beforeAll(async () => {
  beginExtensionScope("openp41ge-extension-explorer", "0.2.0");
  try {
    await import("@openp41ge-extension-explorer/renderer");
    renderers = getScopedRenderers();
    drag = getScopedDragDecls();
    configSchema = getScopedConfigSchema();
  } finally {
    endExtensionScope();
  }
});

describe("renderer registration", () => {
  it("registers its settings as a config schema (indent size, prefetch depth)", () => {
    expect(configSchema).not.toBeNull();
    expect(configDefaults(configSchema!)).toEqual({ indentSize: 16, prefetchDepth: 2 });
  });

  it("registers a sidebar Explorer surface when the module loads", () => {
    expect(renderers).not.toBeNull();
    expect(renderers).toHaveLength(1);
    const spec = renderers![0];
    expect(spec.kind).toBe("sidebar");
    expect(spec.id).toBe("explorer");
    expect(spec.title).toBe("Explorer");
    expect(spec.defaultSide).toBe("left");
    expect(typeof (spec as { render: unknown }).render).toBe("function");
  });

  it("registers a cross-window file-path drag source for file rows", () => {
    expect(drag?.sources).toEqual([
      {
        id: "file",
        label: "File",
        kind: "openp41ge/file-path",
        attrs: { filePath: "data-path" },
        contexts: ["workspace"],
        crossWindow: true,
      },
    ]);
    expect(drag?.consumers).toEqual([]);
    expect(drag?.dropTargets).toEqual([]);
  });

  it("names only surfaces it registers", () => {
    const own = renderers!.map((r) => `${r.kind}:${r.id}`);
    expect(() => validateDragDeclSurfaces(drag!, own)).not.toThrow();
  });
});

describe("settings schema", () => {
  it("describes the Explorer's settings for the settings list", () => {
    expect(configSchema?.description).toMatch(/\S/);
  });
});
