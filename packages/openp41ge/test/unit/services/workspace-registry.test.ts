import { describe, it, expect, vi } from "vitest";
import { WorkspaceRegistry } from "@openp41ge/main/services/workspace-registry";
import { createWorkspace } from "../../../src/layout/types";

describe("WorkspaceRegistry", () => {
  it("creates an independent dispatcher per workspace path", () => {
    const registry = new WorkspaceRegistry({ broadcast: vi.fn(), save: vi.fn() });

    const a = registry.getOrCreate("/a");
    const b = registry.getOrCreate("/b");

    expect(a).not.toBe(b);
    a.apply("addWindow", ["w2"]);
    expect(a.getWorkspace().windows).toHaveLength(2);
    expect(b.getWorkspace().windows).toHaveLength(1);
    expect(a.getWorkspace()).not.toBe(b.getWorkspace());
  });

  it("returns the same dispatcher for the same path (lazy create)", () => {
    const registry = new WorkspaceRegistry({ broadcast: vi.fn(), save: vi.fn() });
    expect(registry.get("/x")).toBeNull();
    expect(registry.has("/x")).toBe(false);
    const d = registry.getOrCreate("/x");
    expect(registry.get("/x")).toBe(d);
    expect(registry.has("/x")).toBe(true);
    expect(registry.paths()).toEqual(["/x"]);
  });

  it("forwards broadcast to the owning path", () => {
    const broadcast = vi.fn();
    const registry = new WorkspaceRegistry({ broadcast, save: vi.fn() });
    const d = registry.getOrCreate("/a");
    d.apply("addWindow", ["w2"]);
    d.broadcast();
    expect(broadcast).toHaveBeenCalledWith("/a", expect.any(String));
  });

  it("forwards save with the owning path after a mutation", () => {
    const save = vi.fn();
    const registry = new WorkspaceRegistry({ broadcast: vi.fn(), save });
    const d = registry.getOrCreate("/a");
    d.apply("addWindow", ["w2"]);
    expect(save).toHaveBeenCalledWith("/a", d.getWorkspace());
  });

  it("persistAll saves every open workspace to its own file, with its own layout", () => {
    const save = vi.fn();
    const registry = new WorkspaceRegistry({ broadcast: vi.fn(), save });
    const a = registry.getOrCreate("/a");
    const b = registry.getOrCreate("/b");
    a.apply("addWindow", ["w2"]);
    save.mockClear();

    registry.persistAll();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledWith("/a", a.getWorkspace());
    expect(save).toHaveBeenCalledWith("/b", b.getWorkspace());
  });
});
