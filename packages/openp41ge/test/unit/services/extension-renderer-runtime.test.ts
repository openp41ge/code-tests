/**
 * Unit tests for the renderer-driven extension runtime (view half).
 */
import { describe, it, expect, vi } from "vitest";
import { html } from "lit";
import type { ILogger } from "openp41ge-core-logger";
import {
  registerConfigSchema,
  registerDragDecls,
  registerRenderers,
  type GridSurfaceSpec,
  type SidebarSurfaceSpec,
} from "openp41ge-sdk";
import {
  deriveSurfaceCatalog,
  loadExtensionRenderers,
  mountRendererSurface,
  subscribeExtensionTopic,
  type RendererSurfaceHostDeps,
} from "@openp41ge/renderer/services/extension-renderer-runtime";

function makeDeps(overrides: Partial<RendererSurfaceHostDeps> = {}): RendererSurfaceHostDeps {
  const log = { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() } as unknown as ILogger;
  return {
    log,
    openTab: vi.fn(),
    ...overrides,
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function counterSpec(initial = 0): GridSurfaceSpec {
  return {
    kind: "grid",
    id: "counter",
    title: "Counter",
    render: (host) => {
      const count = (host.state as { count?: number }).count ?? initial;
      return html`<button data-count>${count}</button>`;
    },
  };
}

describe("mountRendererSurface", () => {
  it("renders the render function into the container", () => {
    const container = document.createElement("div");
    const deps = makeDeps();
    const instance = mountRendererSurface(counterSpec(), container, deps);
    expect(container.querySelector("[data-count]")?.textContent).toBe("0");
    expect(instance.host.surface).toBe("grid:counter");
  });

  it("re-renders on setState (object replace)", async () => {
    const container = document.createElement("div");
    const deps = makeDeps();
    const instance = mountRendererSurface(counterSpec(), container, deps);
    instance.host.setState({ count: 7 });
    await flush();
    expect(container.querySelector("[data-count]")?.textContent).toBe("7");
  });

  it("supports an updater function in setState", async () => {
    const container = document.createElement("div");
    const deps = makeDeps();
    const instance = mountRendererSurface(counterSpec(), container, deps);
    instance.host.setState({ count: 3 });
    await flush();
    instance.host.setState((prev) => ({ count: ((prev as { count?: number }).count ?? 0) + 2 }));
    await flush();
    expect(container.querySelector("[data-count]")?.textContent).toBe("5");
  });

  it("isolates a render failure to the surface and logs with skipToast", () => {
    const container = document.createElement("div");
    const logError = vi.fn();
    const deps = makeDeps({ log: { error: logError } as unknown as ILogger });
    const exploding: GridSurfaceSpec = {
      kind: "grid",
      id: "boom",
      title: "Boom",
      render: () => {
        throw new Error("render exploded");
      },
    };
    mountRendererSurface(exploding, container, deps);
    expect(container.textContent).toContain("Extension surface failed to render");
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining("failed:"),
      expect.any(Error),
      { skipToast: true },
    );
  });

  it("dispose clears the container and stops future renders", async () => {
    const container = document.createElement("div");
    const deps = makeDeps();
    const instance = mountRendererSurface(counterSpec(), container, deps);
    instance.dispose();
    expect(container.innerHTML).toBe("");
    instance.host.setState({ count: 99 });
    await flush();
    expect(container.querySelector("[data-count]")).toBeNull();
  });

  it("attaches a per-mount drag binding and forwards host.drag.registerDropTarget to it", () => {
    const container = document.createElement("div");
    const off = vi.fn();
    const binding = { registerDropTarget: vi.fn(() => off), dispose: vi.fn() };
    const attach = vi.fn(() => binding);
    const instance = mountRendererSurface(counterSpec(), container, makeDeps({ drag: { attach } }));
    expect(attach).toHaveBeenCalledWith("grid:counter", container);
    const onDrop = vi.fn();
    expect(instance.host.drag.registerDropTarget("attach", { onDrop })).toBe(off);
    expect(binding.registerDropTarget).toHaveBeenCalledWith("attach", { onDrop });
  });

  it("disposes the drag binding when the surface is disposed", () => {
    const container = document.createElement("div");
    const binding = { registerDropTarget: vi.fn(() => () => void 0), dispose: vi.fn() };
    const instance = mountRendererSurface(
      counterSpec(),
      container,
      makeDeps({ drag: { attach: () => binding } }),
    );
    instance.dispose();
    instance.dispose();
    expect(binding.dispose).toHaveBeenCalledTimes(1);
  });

  it("returns a no-op deregister when the drag service is not wired", () => {
    const container = document.createElement("div");
    const instance = mountRendererSurface(counterSpec(), container, makeDeps());
    const off = instance.host.drag.registerDropTarget("attach", { onDrop: vi.fn() });
    expect(() => off()).not.toThrow();
    expect(() => instance.dispose()).not.toThrow();
  });

  it("opens an error's log through the injected platform action", () => {
    const container = document.createElement("div");
    const openLog = vi.fn();
    const instance = mountRendererSurface(counterSpec(), container, makeDeps({ openLog }));
    instance.host.openLog("e-1");
    expect(openLog).toHaveBeenCalledWith("e-1");
  });

  it("openLog is inert without the platform action", () => {
    const container = document.createElement("div");
    const instance = mountRendererSurface(counterSpec(), container, makeDeps());
    expect(() => instance.host.openLog("e-1")).not.toThrow();
  });

  it("dispatches openTab to the injected platform action", () => {
    const container = document.createElement("div");
    const openTab = vi.fn();
    const instance = mountRendererSurface(counterSpec(), container, makeDeps({ openTab }));
    instance.host.openTab({ appType: "file-viewer" });
    expect(openTab).toHaveBeenCalledWith({ appType: "file-viewer" });
  });

  it("reads, watches and edits the extension's config through the injected config", () => {
    const container = document.createElement("div");
    const listeners = new Set<(c: Readonly<Record<string, unknown>>) => void>();
    const openEditor = vi.fn();
    const config = {
      get: () => ({ model: "qwen" }),
      subscribe: (fn: (c: Readonly<Record<string, unknown>>) => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      openEditor,
    };
    const instance = mountRendererSurface(counterSpec(), container, makeDeps({ config }));
    expect(instance.host.config.get()).toEqual({ model: "qwen" });
    instance.host.config.openEditor();
    expect(openEditor).toHaveBeenCalled();

    const seen: unknown[] = [];
    instance.host.config.subscribe((c) => seen.push(c));
    instance.host.config.subscribe(() => undefined)();
    expect(listeners.size).toBe(1);
    for (const fn of listeners) fn({ model: "llama" });
    expect(seen).toEqual([{ model: "llama" }]);

    // Disposing the surface drops its config subscriptions.
    instance.dispose();
    expect(listeners.size).toBe(0);
  });

  it("drops a surface's workspace file listeners when it is disposed", () => {
    const listeners = new Set<(c: { path: string }) => void>();
    const workspace = {
      onWorkspaceFileChanged: (fn: (c: { path: string }) => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    } as unknown as RendererSurfaceHostDeps["workspace"];
    const instance = mountRendererSurface(
      counterSpec(),
      document.createElement("div"),
      makeDeps({ workspace }),
    );
    const seen: unknown[] = [];
    instance.host.workspace.onWorkspaceFileChanged((c) => seen.push(c));
    instance.host.workspace.onWorkspaceFileChanged(() => undefined)();
    expect(listeners.size).toBe(1);
    listeners.forEach((fn) => fn({ path: "/ws/a" }));
    expect(seen).toEqual([{ path: "/ws/a" }]);
    instance.dispose();
    expect(listeners.size).toBe(0);
  });

  it("gives inert workspace file listeners when no workspace is injected", () => {
    const instance = mountRendererSurface(counterSpec(), document.createElement("div"), makeDeps());
    expect(() => instance.host.workspace.onWorkspaceFileChanged(() => undefined)()).not.toThrow();
  });

  it("gives an empty, inert config when none is injected", () => {
    const instance = mountRendererSurface(counterSpec(), document.createElement("div"), makeDeps());
    expect(instance.host.config.get()).toEqual({});
    expect(() => instance.host.config.subscribe(() => undefined)()).not.toThrow();
    expect(() => instance.host.config.openEditor()).not.toThrow();
  });

  it("defers the first render until buildContext resolves, then renders the live context", async () => {
    const container = document.createElement("div");
    const ctx = { workspaceRoots: [{ name: "repo", path: "/w/repo" }] };
    let resolveCtx: (c: unknown) => void = () => {};
    const buildContext = vi.fn(
      () =>
        new Promise<Readonly<Record<string, unknown>>>((res) => {
          resolveCtx = res;
        }),
    );
    const deps = makeDeps({ buildContext });
    const contextSpec: SidebarSurfaceSpec = {
      kind: "sidebar",
      id: "ctx",
      title: "Ctx",
      render: (host) => {
        const roots = (host.context.workspaceRoots as ReadonlyArray<{ name: string }>) ?? [];
        return html`<div data-roots>${roots.length ? roots.map((r) => r.name).join(", ") : "empty"}</div>`;
      },
    };

    mountRendererSurface(contextSpec, container, deps);
    expect(buildContext).toHaveBeenCalledTimes(1);
    await flush();
    // First render is deferred until the live context is available, so the
    // surface does not flash a stale/empty state.
    expect(container.querySelector("[data-roots]")).toBeNull();

    resolveCtx(ctx);
    await flush();
    expect(container.querySelector("[data-roots]")?.textContent).toBe("repo");
  });

  it("still renders (fallback) when buildContext rejects", async () => {
    const container = document.createElement("div");
    const buildContext = vi.fn(() => Promise.reject(new Error("no workspace")));
    const logError = vi.fn();
    const deps = makeDeps({ buildContext, log: { error: logError } as unknown as ILogger });
    const contextSpec: SidebarSurfaceSpec = {
      kind: "sidebar",
      id: "c",
      title: "C",
      render: (host) =>
        html`<div data-r>${((host.context.workspaceRoots as unknown[]) ?? []).length}</div>`,
    };
    mountRendererSurface(contextSpec, container, deps);
    await flush();
    expect(container.querySelector("[data-r]")?.textContent).toBe("0");
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining("context resolve failed"),
      expect.any(Error),
      { skipToast: true },
    );
  });

  it("forwards host.workspace actions to the injected platform workspace actions", async () => {
    const addition = { done: Promise.resolve({ ok: true }), onProgress: vi.fn(), cancel: vi.fn() };
    const workspace = {
      cloneRepository: vi.fn(() => addition),
      addRepository: vi.fn(() => addition),
      addWorktree: vi.fn(async () => ({ ok: true, path: "/wt" })),
    };
    const instance = mountRendererSurface(
      counterSpec(),
      document.createElement("div"),
      makeDeps({ workspace }),
    );
    expect(instance.host.workspace.addRepository("u")).toBe(addition);
    await expect(instance.host.workspace.addWorktree("app", "main")).resolves.toEqual({
      ok: true,
      path: "/wt",
    });
    expect(workspace.addRepository).toHaveBeenCalledWith("u");
    expect(instance.host.workspace.cloneRepository("c")).toBe(addition);
    expect(workspace.cloneRepository).toHaveBeenCalledWith("c");
    expect(workspace.addWorktree).toHaveBeenCalledWith("app", "main");
  });

  it("fails host.workspace actions cleanly when the platform does not wire them", async () => {
    const instance = mountRendererSurface(counterSpec(), document.createElement("div"), makeDeps());
    await expect(instance.host.workspace.addWorktree("app", "main")).resolves.toMatchObject({
      ok: false,
    });
    const addition = instance.host.workspace.addRepository("u");
    await expect(addition.done).resolves.toMatchObject({ ok: false });
    await expect(instance.host.workspace.cloneRepository("u").done).resolves.toMatchObject({
      ok: false,
    });
    expect(typeof addition.onProgress(() => undefined)).toBe("function");
    addition.cancel();
  });

  it("forwards host.showContextMenu to the platform, and is inert when not wired", () => {
    const showContextMenu = vi.fn();
    const instance = mountRendererSurface(
      counterSpec(),
      document.createElement("div"),
      makeDeps({ showContextMenu }),
    );
    const event = new MouseEvent("contextmenu", { clientX: 5, clientY: 6 });
    const items = [{ label: "Refresh", onSelect: () => undefined }];
    instance.host.showContextMenu(event, items);
    expect(showContextMenu).toHaveBeenCalledWith(event, items);

    const bare = mountRendererSurface(counterSpec(), document.createElement("div"), makeDeps());
    expect(() => bare.host.showContextMenu(event, items)).not.toThrow();
  });

  it("re-resolves the context and re-renders when the workspace changes", async () => {
    const container = document.createElement("div");
    let repos = ["app"];
    const buildContext = vi.fn(async () => ({ repos: [...repos] }));
    let notify: (() => void) | undefined;
    const unsubscribe = vi.fn();
    const onWorkspaceChange = vi.fn((fn: () => void) => {
      notify = fn;
      return unsubscribe;
    });
    const spec: SidebarSurfaceSpec = {
      kind: "sidebar",
      id: "repos",
      title: "Repos",
      render: (host) => html`<div data-repos>${(host.context.repos as string[]).join(",")}</div>`,
    };
    const instance = mountRendererSurface(
      spec,
      container,
      makeDeps({ buildContext, onWorkspaceChange }),
    );
    await flush();
    expect(container.querySelector("[data-repos]")?.textContent).toBe("app");

    repos = ["app", "lib"];
    notify?.();
    await flush();
    expect(buildContext).toHaveBeenCalledTimes(2);
    expect(container.querySelector("[data-repos]")?.textContent).toBe("app,lib");

    instance.dispose();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe("loadExtensionRenderers", () => {
  const specs: GridSurfaceSpec[] = [{ kind: "grid", id: "a", title: "A", render: counterSpec().render }];

  it("captures renderers registered by the loaded module", async () => {
    const result = await loadExtensionRenderers({ id: "ext-a", version: "1.0.0" }, async () => {
      registerRenderers(specs);
    });
    expect(result.error).toBeUndefined();
    expect(result.renderers).toHaveLength(1);
    expect(result.renderers[0]).toMatchObject({ kind: "grid", id: "a" });
  });

  it("captures the config schema registered by the loaded module", async () => {
    const schema = { type: "object", properties: { a: { type: "string", default: "x" } } } as const;
    const result = await loadExtensionRenderers({ id: "ext-a", version: "1.0.0" }, async () => {
      registerConfigSchema(schema);
    });
    expect(result.configSchema).toBe(schema);
    const none = await loadExtensionRenderers({ id: "ext-a", version: "1.0.0" }, async () => {});
    expect(none.configSchema).toBeNull();
  });

  it("captures drag declarations registered by the loaded module", async () => {
    const result = await loadExtensionRenderers({ id: "ext-a", version: "1.0.0" }, async () => {
      registerRenderers(specs);
      registerDragDecls({
        dropTargets: [{ id: "attach", surface: "grid:a", accepts: ["openp41ge/file-path"] }],
      });
    });
    expect(result.drag).toEqual({
      kinds: [],
      sources: [],
      consumers: [],
      dropTargets: [{ id: "attach", surface: "grid:a", accepts: ["openp41ge/file-path"] }],
    });
  });

  it("returns empty drag declarations when the module registers none or throws", async () => {
    const ok = await loadExtensionRenderers({ id: "ext-a", version: "1.0.0" }, async () => {
      registerRenderers(specs);
    });
    expect(ok.drag).toEqual({ kinds: [], sources: [], consumers: [], dropTargets: [] });
    const failed = await loadExtensionRenderers({ id: "ext-a", version: "1.0.0" }, async () => {
      throw new Error("boom");
    });
    expect(failed.drag).toEqual({ kinds: [], sources: [], consumers: [], dropTargets: [] });
  });

  it("returns an error when the module throws", async () => {
    const result = await loadExtensionRenderers({ id: "ext-a", version: "1.0.0" }, async () => {
      throw new Error("module load failed");
    });
    expect(result.renderers).toEqual([]);
    expect(result.error).toBe("module load failed");
  });

  it("does not accumulate registrations across reloads (HMR dedup)", async () => {
    const load = () =>
      loadExtensionRenderers({ id: "ext-a", version: "1.0.0" }, async () => {
        registerRenderers(specs);
      });
    const first = await load();
    const second = await load();
    expect(first.renderers).toHaveLength(1);
    expect(second.renderers).toHaveLength(1);
  });
});

describe("deriveSurfaceCatalog", () => {
  const renderers = [
    { kind: "grid", id: "dashboard", title: "Dashboard", icon: "D", description: "Dash", render: counterSpec().render },
    { kind: "sidebar", id: "explorer", title: "Explorer", defaultSide: "left", render: counterSpec().render },
  ] as const;

  it("passes a grid surface's tabLabel through to its app registration", () => {
    const tabLabel = (p: Readonly<Record<string, unknown>>) => ({ title: String(p.name) });
    const catalog = deriveSurfaceCatalog(
      "ext-a",
      [{ kind: "grid", id: "doc", title: "Doc", tabLabel, render: counterSpec().render }],
      makeDeps(),
    );
    expect(catalog.apps[0].tabLabel?.({ name: "README" })).toEqual({ title: "README" });
  });

  it("derives namespaced app and system-tab registrations", () => {
    const catalog = deriveSurfaceCatalog("ext-a", renderers, makeDeps());
    expect(catalog.apps).toHaveLength(1);
    expect(catalog.systemTabs).toHaveLength(1);
    expect(catalog.apps[0]).toMatchObject({
      id: "ext:ext-a:dashboard",
      label: "Dashboard",
      icon: "D",
      description: "Dash",
    });
    expect(catalog.systemTabs[0]).toMatchObject({
      id: "ext:ext-a:explorer",
      label: "Explorer",
      defaultSide: "left",
    });
  });

  it("createController returns the surface's app-type controller", () => {
    const catalog = deriveSurfaceCatalog("ext-a", renderers, makeDeps());
    const ctrl = catalog.apps[0].createController("tab-1");
    expect(ctrl.appType).toBe("ext:ext-a:dashboard");
    expect(typeof ctrl.mount).toBe("function");
  });

  it("falls back to defaults for missing icon/description", () => {
    const bare: SidebarSurfaceSpec[] = [{ kind: "sidebar", id: "x", title: "X", defaultSide: "right", render: counterSpec().render }];
    const catalog = deriveSurfaceCatalog("ext-a", bare, makeDeps());
    expect(catalog.systemTabs[0].icon).toBeTruthy();
    expect(catalog.systemTabs[0].description).toContain("ext-a");
  });
});

describe("subscribeExtensionTopic (backend → renderer pushes)", () => {
  // The runtime reads the bridge from window.openp41ge.extension.onEvent.
  // Install a fake so we can drive pushes synchronously.
  beforeEach(() => {
    (window as unknown as { openp41ge?: unknown }).openp41ge = undefined;
  });

  function installBridge(): (evt: { topic: string; payload: unknown }) => void {
    let handler: ((evt: { topic: string; payload: unknown }) => void) | undefined;
    (window as unknown as { openp41ge?: { extension: { onEvent: unknown } } }).openp41ge = {
      extension: {
        onEvent: (cb: (evt: { topic: string; payload: unknown }) => void) => {
          handler = cb;
          return () => {};
        },
      },
    };
    return (evt) => handler?.(evt);
  }

  it("routes only matching qualified topics to a subscriber and unsubscribes", () => {
    const push = installBridge();
    const seen: unknown[] = [];
    const unsub = subscribeExtensionTopic("demo", "changed", (p) => seen.push(p));

    push({ topic: "demo/other", payload: { v: 0 } });
    expect(seen).toEqual([]);

    push({ topic: "demo/changed", payload: { v: 1 } });
    expect(seen).toEqual([{ v: 1 }]);

    unsub();
    push({ topic: "demo/changed", payload: { v: 2 } });
    expect(seen).toEqual([{ v: 1 }]);
  });

  it("does not deliver another extension's topic to a subscriber", () => {
    const push = installBridge();
    const seen: unknown[] = [];
    subscribeExtensionTopic("demo", "changed", (p) => seen.push(p));

    push({ topic: "other/changed", payload: { v: 9 } });
    expect(seen).toEqual([]);
  });
});
