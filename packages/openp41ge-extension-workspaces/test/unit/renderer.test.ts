import { describe, it, expect, beforeAll } from "vitest";
import {
  beginExtensionScope,
  endExtensionScope,
  getScopedRenderers,
} from "openp41ge-core-extension-host/scope";
import type { SurfaceSpec } from "openp41ge-sdk";

let renderers: readonly SurfaceSpec[] | null = null;

beforeAll(async () => {
  beginExtensionScope("openp41ge-extension-workspaces", "0.1.0");
  try {
    await import("@openp41ge-extension-workspaces/renderer");
    renderers = getScopedRenderers();
  } finally {
    endExtensionScope();
  }
});

describe("renderer registration", () => {
  it("does not register a sidebar workspaces surface (manager-owned)", () => {
    expect(renderers).not.toBeNull();
    expect(renderers!.find((s) => s.kind === "sidebar")).toBeUndefined();
  });

  it("registers a grid workspace-editor surface", () => {
    const spec = renderers!.find((s) => s.kind === "grid" && s.id === "workspace-editor");
    expect(spec).toBeDefined();
    expect(spec!.kind).toBe("grid");
    expect(typeof (spec! as { render: unknown }).render).toBe("function");
  });

  it("registers exactly one surface (the workspace editor)", () => {
    expect(renderers).toHaveLength(1);
  });
});
