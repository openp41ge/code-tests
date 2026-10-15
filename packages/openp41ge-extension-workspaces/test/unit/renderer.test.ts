import { describe, it, expect, beforeAll } from "vitest";
import {
  beginExtensionScope,
  endExtensionScope,
  getScopedDragDecls,
  getScopedRenderers,
} from "openp41ge-core-extension-host/scope";
import type { DragDecls, SurfaceSpec } from "openp41ge-sdk";

let renderers: readonly SurfaceSpec[] | null = null;
let drag: DragDecls | null = null;

beforeAll(async () => {
  beginExtensionScope("openp41ge-extension-workspaces", "0.1.0");
  try {
    await import("@openp41ge-extension-workspaces/renderer");
    renderers = getScopedRenderers();
    drag = getScopedDragDecls();
  } finally {
    endExtensionScope();
  }
});

describe("renderer registration", () => {
  it("does not register a sidebar workspaces surface (the platform's Workspaces tab)", () => {
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

  it("opens a dropped workspace (a Workspaces row) as its editor", () => {
    expect(drag?.consumers).toEqual([
      {
        id: "workspace-editor",
        label: "Workspace editor",
        accepts: ["openp41ge/workspace-config"],
        placement: ["grid"],
        open: { kind: "renderer-surface", surface: "grid:workspace-editor" },
      },
    ]);
  });

  it("titles an editor tab with the workspace's name", () => {
    const spec = renderers!.find((s) => s.id === "workspace-editor") as {
      tabLabel?: (p: Record<string, unknown>) => { title?: string };
    };
    expect(spec.tabLabel?.({ path: "/ws/a.openp41ge-workspace", name: "Alpha" })?.title).toBe(
      "Alpha",
    );
    // A tab opened without a name (saved by an earlier version) keeps the generic title.
    expect(spec.tabLabel?.({ path: "/ws/a.openp41ge-workspace" })?.title).toBe("Workspace editor");
  });

  it("needs no workspace open (it edits one by its file)", () => {
    const spec = renderers!.find((s) => s.id === "workspace-editor") as { workspace?: string };
    expect(spec.workspace).toBe("none");
  });
});
