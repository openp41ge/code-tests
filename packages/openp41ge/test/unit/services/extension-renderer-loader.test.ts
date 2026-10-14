/**
 * Tests for the renderer-driven extension loader (live-air).
 *
 * The loader pulls the renderer entry for each active `api: "0.2"` extension
 * (those with a `renderer` manifest path) and registers the derived surfaces
 * into the platform registries. The entry-loading call is stubbed; the platform
 * catalog derivation runs for real.
 */
import { subscribeLogs } from "openp41ge-core-logger";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ActiveExtensionSummary, SurfaceSpec } from "openp41ge-sdk";
import {
  getAppTypeRegistration,
  getSystemTabRegistration,
} from "@openp41ge/renderer/apps/app-registry";
import {
  loadExtensionRenderers,
  type LoadedRendererSet,
} from "@openp41ge/renderer/services/extension-renderer-runtime";
import {
  registerRendererExtensions,
  createRendererSurfaceDeps,
  buildWorkspaceContext,
  dataDirWorkspaces,
  type WorkspaceRepoInfo,
} from "@openp41ge/renderer/services/extension-renderer-loader";
import { getActiveExtensions } from "@openp41ge/renderer/services/extension-contributions";
import { workspaceFileService } from "@openp41ge/renderer/services/workspace-file-service";
import { extensionDrag } from "@openp41ge/renderer/services/extension-drag";
import { extensionConfigs } from "@openp41ge/renderer/services/extension-configs";

const mockGetActive = vi.fn<() => ActiveExtensionSummary[]>();
const mockLoad = vi.fn<() => Promise<LoadedRendererSet>>();

vi.mock("@openp41ge/renderer/services/extension-contributions", () => ({
  getActiveExtensions: () => mockGetActive(),
  onExtensionsChanged: () => () => {},
  refreshActiveExtensions: vi.fn(async () => []),
}));

vi.mock("@openp41ge/renderer/services/extension-renderer-runtime", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@openp41ge/renderer/services/extension-renderer-runtime")
    >();
  return { ...actual, loadExtensionRenderers: (...args: unknown[]) => mockLoad(...args) };
});

const render = (() => ({})) as unknown as SurfaceSpec["render"];

function spec(kind: "grid" | "sidebar"): SurfaceSpec {
  if (kind === "grid") {
    return { kind: "grid", id: "grid1", title: "Grid one", render };
  }
  return { kind: "sidebar", id: "side1", title: "Side one", defaultSide: "left", render };
}

const noDrag = { sources: [], consumers: [], dropTargets: [] };

describe("registerRendererExtensions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the renderer entry and registers derived grid/sidebar registrations", async () => {
    mockGetActive.mockReturnValue([{ id: "demo", version: "2.0.0", renderer: "dist/index.js" }]);
    mockLoad.mockResolvedValue({
      renderers: [spec("grid"), spec("sidebar")],
      drag: noDrag,
      configSchema: null,
    });

    await registerRendererExtensions();

    expect(mockLoad).toHaveBeenCalledTimes(1);
    const [identity, loadEntry] = mockLoad.mock.calls[0];
    expect(identity).toEqual({ id: "demo", version: "2.0.0" });
    expect(typeof loadEntry).toBe("function");

    const grid = getAppTypeRegistration("ext:demo:grid1");
    expect(grid).toBeDefined();
    expect(grid?.label).toBe("Grid one");
    expect(grid?.createController("t1")?.tabId).toBe("t1");

    const side = getSystemTabRegistration("ext:demo:side1");
    expect(side).toBeDefined();
    expect(side?.label).toBe("Side one");
    expect(side?.defaultSide).toBe("left");
  });

  it("registers the extension's drag declarations with the drag runtime", async () => {
    const register = vi.spyOn(extensionDrag, "registerExtension");
    const drag = {
      sources: [],
      consumers: [],
      dropTargets: [
        { id: "attach", surface: "grid:grid1", accepts: ["openp41ge/file-path" as const] },
      ],
    };
    mockGetActive.mockReturnValue([{ id: "dragger", version: "2.0.0", renderer: "dist/index.js" }]);
    mockLoad.mockResolvedValue({
      renderers: [spec("grid"), spec("sidebar")],
      drag,
      configSchema: null,
    });

    await registerRendererExtensions();

    expect(register).toHaveBeenCalledWith("dragger", drag, ["grid:grid1", "sidebar:side1"]);
    register.mockRestore();
  });

  it("still registers surfaces when the drag declarations are rejected", async () => {
    mockGetActive.mockReturnValue([{ id: "baddrag", version: "2.0.0", renderer: "dist/index.js" }]);
    mockLoad.mockResolvedValue({
      renderers: [spec("grid")],
      drag: {
        sources: [],
        consumers: [],
        dropTargets: [{ id: "attach", surface: "grid:missing", accepts: ["openp41ge/file-path"] }],
      },
      configSchema: null,
    });

    await registerRendererExtensions();

    expect(getAppTypeRegistration("ext:baddrag:grid1")).toBeDefined();
  });

  it("skips extensions without a renderer entry", async () => {
    mockGetActive.mockReturnValue([{ id: "backend-only", version: "1.0.0" }]);

    await registerRendererExtensions();

    expect(mockLoad).not.toHaveBeenCalled();
  });

  it("registers nothing for an extension whose entry fails to load", async () => {
    mockGetActive.mockReturnValue([{ id: "broken", version: "2.0.0", renderer: "dist/index.js" }]);
    mockLoad.mockResolvedValue({ renderers: [], drag: noDrag, configSchema: null, error: "boom" });

    await registerRendererExtensions();

    expect(getAppTypeRegistration("ext:broken:grid1")).toBeUndefined();
  });
});

describe("createRendererSurfaceDeps", () => {
  it("routes openTab(file-viewer) to the existing openp41ge:open-file flow", () => {
    const deps = createRendererSurfaceDeps("openp41ge-extension-explorer", async () => ({}));
    const listener = vi.fn();
    document.addEventListener("openp41ge:open-file", listener);

    deps.openTab({ appType: "file-viewer", params: { filePath: "/w/repo/src/a.txt" } });

    expect(listener).toHaveBeenCalledTimes(1);
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toMatchObject({ path: "/w/repo/src/a.txt", name: "a.txt", pinned: false });
  });

  it("forwards an explicit pinned request on openTab(file-viewer)", () => {
    const deps = createRendererSurfaceDeps("openp41ge-extension-explorer", async () => ({}));
    const listener = vi.fn();
    document.addEventListener("openp41ge:open-file", listener);

    deps.openTab({
      appType: "file-viewer",
      params: { filePath: "/w/repo/src/b.txt" },
      pinned: true,
    });

    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toMatchObject({ path: "/w/repo/src/b.txt", pinned: true });
  });

  it("surfaces the injected context provider", async () => {
    const ctx = { workspaceRoots: [{ name: "repo", path: "/w/repo" }] };
    const provider = async () => ctx;
    const deps = createRendererSurfaceDeps("openp41ge-extension-explorer", provider);
    expect(deps.buildContext).toBe(provider);
    expect(await deps.buildContext!()).toBe(ctx);
  });

  it("opens other app types in the last-focused column, the way a grid drop does", () => {
    const deps = createRendererSurfaceDeps("openp41ge-extension-git", async () => ({}));
    const listener = vi.fn();
    document.addEventListener("grid-open-tab", listener);
    try {
      deps.openTab({ appType: "git-repository", params: { repoName: "github.com/a/b" } });
      expect(listener).toHaveBeenCalledTimes(1);
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
        tabType: "git-repository",
        tabConfig: { repoName: "github.com/a/b" },
        targetCol: 0,
        pinned: false,
      });
    } finally {
      document.removeEventListener("grid-open-tab", listener);
    }
  });
});

describe("createRendererSurfaceDeps — openLog", () => {
  it("opens the Logs window on the error", () => {
    const openLogs = vi.fn();
    const prev = (window as unknown as { openp41ge?: unknown }).openp41ge;
    (window as unknown as { openp41ge: unknown }).openp41ge = {
      ...(prev as object),
      windowManager: { openLogs },
    };
    try {
      createRendererSurfaceDeps("ext-a", async () => ({})).openLog?.("e-1");
      expect(openLogs).toHaveBeenCalledWith({ errorId: "e-1" });
    } finally {
      (window as unknown as { openp41ge?: unknown }).openp41ge = prev;
    }
  });
});

describe("createRendererSurfaceDeps — tab key", () => {
  it("passes the tab's key, so an open tab for it is reused", () => {
    const deps = createRendererSurfaceDeps("openp41ge-extension-agents", async () => ({}));
    const listener = vi.fn();
    document.addEventListener("grid-open-tab", listener);
    try {
      deps.openTab({ appType: "ext:a:chat", params: { chatId: "c1" }, key: "c1", pinned: true });
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
        tabType: "ext:a:chat",
        tabConfig: { chatId: "c1" },
        tabKey: "c1",
        pinned: true,
      });
    } finally {
      document.removeEventListener("grid-open-tab", listener);
    }
  });
});

describe("extension config", () => {
  it("loads each extension's config with the schema its renderer entry registered", async () => {
    const load = vi.spyOn(extensionConfigs(), "load");
    const configSchema = { type: "object", properties: {} } as const;
    mockGetActive.mockReturnValue([
      { id: "configured", version: "2.0.0", renderer: "dist/index.js" },
    ]);
    mockLoad.mockResolvedValue({ renderers: [spec("grid")], drag: noDrag, configSchema });

    await registerRendererExtensions();

    expect(load).toHaveBeenCalledWith("configured", configSchema);
    load.mockRestore();
  });

  it("opens the config editor as a grid tab for the extension", () => {
    const deps = createRendererSurfaceDeps("openp41ge-extension-git", async () => ({}));
    const listener = vi.fn();
    document.addEventListener("grid-open-tab", listener);
    try {
      deps.config!.openEditor();
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
        tabType: "config-editor",
        tabConfig: { extensionId: "openp41ge-extension-git" },
      });
    } finally {
      document.removeEventListener("grid-open-tab", listener);
    }
  });
});

describe("createRendererSurfaceDeps — next-column", () => {
  it("opens right of the calling tab", () => {
    const deps = createRendererSurfaceDeps("openp41ge-extension-git", async () => ({}));
    const listener = vi.fn();
    document.addEventListener("grid-open-tab", listener);
    try {
      deps.openTab(
        { appType: "ext:g:diff", params: { path: "a.ts" }, placement: "next-column" },
        { tabId: "t3" },
      );
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
        tabType: "ext:g:diff",
        tabConfig: { path: "a.ts" },
        targetCol: 0,
        pinned: false,
        nextToTabId: "t3",
      });
      // Without a calling tab (a sidebar surface): the last focused column.
      deps.openTab({ appType: "ext:g:diff", placement: "next-column" });
      expect((listener.mock.calls[1][0] as CustomEvent).detail.nextToTabId).toBeUndefined();
    } finally {
      document.removeEventListener("grid-open-tab", listener);
    }
  });
});

describe("createRendererSurfaceDeps — workspace", () => {
  const openData = workspaceFileService.openData;

  afterEach(() => {
    workspaceFileService.openData = openData;
    delete (window as unknown as Record<string, unknown>).openp41ge;
    vi.restoreAllMocks();
  });

  it("re-notifies surfaces when the open workspace changes", () => {
    workspaceFileService.openData = { repos: [] };
    const deps = createRendererSurfaceDeps("openp41ge-extension-explorer", async () => ({}));
    const fn = vi.fn();
    const off = deps.onWorkspaceChange!(fn);
    workspaceFileService.addRepoToActive("git@github.com:acme/app.git");
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    workspaceFileService.addRepoToActive("git@github.com:acme/web.git");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("re-notifies surfaces after a repository refresh", async () => {
    workspaceFileService.openData = { repos: [] };
    (window as unknown as Record<string, unknown>).openp41ge = {
      workspaceController: { fetch: vi.fn(async () => undefined) },
    };
    const deps = createRendererSurfaceDeps("openp41ge-extension-git", async () => ({}));
    const fn = vi.fn();
    const off = deps.onWorkspaceChange!(fn);
    await deps.workspace!.fetchRepository("github.com/acme/app");
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });

  it("shows the app's context menu and runs the chosen item", () => {
    const deps = createRendererSurfaceDeps("openp41ge-extension-git", async () => ({}));
    const onSelect = vi.fn();
    deps.showContextMenu!(new MouseEvent("contextmenu", { clientX: 10, clientY: 20 }), [
      { label: "Refresh", onSelect },
      { separator: true },
      { label: "Remove from workspace", onSelect: vi.fn() },
    ]);
    const menu = document.querySelector("openp41ge-contextmenu") as HTMLElement & {
      x: number;
      y: number;
      items: Array<{ label?: string; type?: string; action?: () => void }>;
    };
    expect(menu).toBeTruthy();
    expect([menu.x, menu.y]).toEqual([10, 20]);
    expect(menu.items.map((i) => i.label ?? i.type)).toEqual([
      "Refresh",
      "separator",
      "Remove from workspace",
    ]);
    menu.items[0].action!();
    expect(onSelect).toHaveBeenCalled();
    menu.remove();
  });

  it("adds a worktree through the platform git API and records it in the open workspace", async () => {
    workspaceFileService.openData = {
      repos: [{ url: "git@github.com:acme/app.git", worktrees: [] }],
    };
    const save = vi.spyOn(workspaceFileService, "save").mockResolvedValue(undefined);
    const checkoutWorktree = vi.fn(async (_repo: string, branch: string) => ({
      branch,
      path: `/w/app/${branch}`,
      exists: true,
    }));
    (window as unknown as Record<string, unknown>).openp41ge = {
      workspaceController: { checkoutWorktree },
    };
    const deps = createRendererSurfaceDeps("openp41ge-extension-explorer", async () => ({}));

    await expect(deps.workspace!.addWorktree("github.com/acme/app", "feature")).resolves.toEqual({
      ok: true,
      path: "/w/app/feature",
    });
    expect(checkoutWorktree).toHaveBeenCalledWith("github.com/acme/app", "feature");
    expect(workspaceFileService.openData?.repos?.[0].worktrees).toEqual(["feature"]);
    expect(save).toHaveBeenCalled();
  });
});

describe("buildWorkspaceContext", () => {
  const openData = workspaceFileService.openData;

  afterEach(() => {
    workspaceFileService.openData = openData;
    delete (window as unknown as Record<string, unknown>).openp41ge;
  });

  it("includes every workspace repo, even one with no worktrees checked out", async () => {
    workspaceFileService.openData = {
      repos: [
        { url: "git@github.com:openp41ge/app.git", worktrees: [] },
        { url: "git@github.com:openp41ge/web.git", worktrees: [] },
        { url: "git@github.com:openp41ge/app-tests.git", worktrees: [] },
      ],
    };
    (window as unknown as Record<string, unknown>).openp41ge = {
      workspaceController: {
        listWorktrees: vi.fn(async (name: string) => {
          if (name === "github.com/openp41ge/app") {
            return [
              { branch: "master", path: "/w/app", exists: true },
              { branch: "test", path: "/w/app-test", exists: false },
            ];
          }
          return [];
        }),
      },
    };

    const ctx = (await buildWorkspaceContext()) as { workspaceRepos: WorkspaceRepoInfo[] };
    const names = ctx.workspaceRepos.map((r) => r.name);
    expect(names).toEqual([
      "github.com/openp41ge/app",
      "github.com/openp41ge/web",
      "github.com/openp41ge/app-tests",
    ]);
    expect(ctx.workspaceRepos[0].worktrees).toEqual([{ name: "master", path: "/w/app" }]);
    expect(ctx.workspaceRepos[1].worktrees).toEqual([]);
    expect(ctx.workspaceRepos[2].worktrees).toEqual([]);
  });

  it("carries each repo's state, queried from the platform", async () => {
    workspaceFileService.openData = {
      repos: [{ url: "git@github.com:openp41ge/state.git", worktrees: [] }],
    };
    const state = {
      repoName: "github.com/openp41ge/state",
      branches: [
        { branch: "main", worktree: true, staged: 0, unstaged: 2, untracked: 0, unpushed: 1 },
      ],
    };
    (window as unknown as Record<string, unknown>).openp41ge = {
      workspaceController: {
        listWorktrees: vi.fn(async () => []),
        repositoryState: vi.fn(async () => state),
      },
    };
    await buildWorkspaceContext(); // starts the query
    await new Promise<void>((r) => setTimeout(r, 0));
    const ctx = (await buildWorkspaceContext()) as { repositoryStates: Record<string, unknown> };
    expect(ctx.repositoryStates).toEqual({ "github.com/openp41ge/state": state });
  });

  it("leaves out repos whose URL is not a full clone URL", async () => {
    workspaceFileService.openData = {
      repos: [
        { url: "git@github.com:openp41ge/app.git", worktrees: [] },
        { url: "test", worktrees: [] },
        { url: "github.com/openp41ge/web", worktrees: [] },
      ],
    };
    (window as unknown as Record<string, unknown>).openp41ge = {
      workspaceController: { listWorktrees: vi.fn(async () => []) },
    };
    const ctx = (await buildWorkspaceContext()) as { workspaceRepos: WorkspaceRepoInfo[] };
    expect(ctx.workspaceRepos.map((r) => r.name)).toEqual(["github.com/openp41ge/app"]);
  });

  it("warns about a URL that is not a full clone URL once, not on every refresh", async () => {
    workspaceFileService.openData = {
      repos: [{ url: "github.com/openp41ge/warn-once", worktrees: [] }],
    };
    (window as unknown as Record<string, unknown>).openp41ge = {
      workspaceController: { listWorktrees: vi.fn(async () => []) },
    };
    const warnings: string[] = [];
    const off = subscribeLogs((e) => {
      if (e?.message.includes("warn-once")) warnings.push(e.message);
    });
    try {
      await buildWorkspaceContext();
      await buildWorkspaceContext();
      await buildWorkspaceContext();
    } finally {
      off();
    }
    expect(warnings).toHaveLength(1);
  });

  it("carries each repo's git dir", async () => {
    workspaceFileService.openData = {
      repos: [
        { url: "git@github.com:openp41ge/app.git", worktrees: [] },
        { url: "git@github.com:openp41ge/gone.git", worktrees: [] },
      ],
    };
    (window as unknown as Record<string, unknown>).openp41ge = {
      workspaceController: {
        listWorktrees: vi.fn(async () => []),
        listRepos: vi.fn(async () => [
          { name: "github.com/openp41ge/app", path: "/repos/app/.git", url: "x" },
        ]),
      },
    };

    const ctx = (await buildWorkspaceContext()) as { workspaceRepos: WorkspaceRepoInfo[] };
    expect(ctx.workspaceRepos[0]).toMatchObject({
      name: "github.com/openp41ge/app",
      gitDir: "/repos/app/.git",
    });
    // A repo not cloned on disk has no git dir.
    expect(ctx.workspaceRepos[1].gitDir).toBeUndefined();
  });

  it("does not carry the Explorer's settings (they are its own config now)", async () => {
    workspaceFileService.openData = { repos: [] };
    (window as unknown as Record<string, unknown>).openp41ge = {
      config: { getAll: vi.fn(async () => ({ explorer: { indentSize: 28 } })) },
    };
    const ctx = await buildWorkspaceContext();
    expect(ctx).not.toHaveProperty("explorerSettings");
  });

  describe("dataDirWorkspaces", () => {
    it("joins the data dir with the workspaces subdir", () => {
      (window as unknown as Record<string, unknown>).openp41ge = {
        dataDir: vi.fn(() => "/Users/me/.openp41ge"),
      };
      expect(dataDirWorkspaces()).toBe("/Users/me/.openp41ge/workspaces");
    });

    it("trims trailing slashes from the data dir", () => {
      (window as unknown as Record<string, unknown>).openp41ge = {
        dataDir: vi.fn(() => "/Users/me/.openp41ge/"),
      };
      expect(dataDirWorkspaces()).toBe("/Users/me/.openp41ge/workspaces");
    });

    it("returns an empty string when there is no data dir", () => {
      (window as unknown as Record<string, unknown>).openp41ge = { dataDir: vi.fn(() => "") };
      expect(dataDirWorkspaces()).toBe("");
    });
  });
});
