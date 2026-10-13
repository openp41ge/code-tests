// @vitest-environment jsdom
/**
 * The Explorer keeps which repos, worktrees and folders are open across
 * workspace opens: on mount it loads the saved paths (`load-expanded`) and
 * opens them again, reading folders as it goes; after that, every change to
 * what is open is saved (`save-expanded`). Nothing is saved before the
 * restore finishes, so a mount never overwrites the saved set with nothing.
 */
import { describe, it, expect, vi } from "vitest";
import { render as litRender } from "lit";
import {
  renderExplorer,
  expandedPaths,
  toggleNode,
  type ExplorerHost,
  type ExplorerState,
  type ReadDirEntry,
} from "@openp41ge-extension-explorer/tree-view";

const REPOS = [
  { name: "github.com/acme/app", worktrees: [{ name: "main", path: "/w/app" }] },
  { name: "github.com/acme/web", worktrees: [{ name: "main", path: "/w/web" }] },
];

const LISTINGS: Record<string, ReadDirEntry[]> = {
  "/w/app": [
    { name: "src", path: "/w/app/src", kind: "dir" },
    { name: "a.txt", path: "/w/app/a.txt", kind: "file" },
  ],
  "/w/app/src": [{ name: "lib", path: "/w/app/src/lib", kind: "dir" }],
  "/w/app/src/lib": [{ name: "x.ts", path: "/w/app/src/lib/x.ts", kind: "file" }],
};

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise<void>((r) => setTimeout(r, 0));
};

function mount(saved: string[] | null) {
  const container = document.createElement("div");
  const saves: string[][] = [];
  const dispatch = vi.fn(async (command: string, payload?: Record<string, unknown>) => {
    if (command === "load-expanded") return { ok: true, paths: saved ?? [] };
    if (command === "save-expanded") {
      saves.push([...(payload!.paths as string[])]);
      return { ok: true };
    }
    if (command === "read-dir") {
      // depth 0: one level at a time, so restoring must read each folder.
      return { ok: true, entries: LISTINGS[payload!.path as string] ?? [] };
    }
    return { ok: true };
  });
  let state = {} as ExplorerState;
  const host = {
    context: { workspaceRepos: REPOS },
    get state() {
      return state;
    },
    dispatch,
    setState(update: (prev: ExplorerState) => ExplorerState) {
      state = update(state);
      litRender(renderExplorer(host), container);
    },
    openTab: vi.fn(),
    config: { get: () => ({ prefetchDepth: 0 }), subscribe: () => () => {}, openEditor() {} },
  } as unknown as ExplorerHost;
  litRender(renderExplorer(host), container);
  return { host, dispatch, saves, state: () => state };
}

describe("Explorer: open rows kept across workspace opens", () => {
  it("expandedPaths lists every open repo, worktree and folder", async () => {
    const m = mount(["github.com/acme/app", "/w/app", "/w/app/src"]);
    await flush();
    expect(expandedPaths(m.state().roots)).toEqual([
      "github.com/acme/app",
      "/w/app",
      "/w/app/src",
    ]);
  });

  it("on mount: loads the saved paths and opens them again, reading each folder", async () => {
    const m = mount(["github.com/acme/app", "/w/app", "/w/app/src", "/w/app/src/lib"]);
    await flush();
    expect(m.dispatch).toHaveBeenCalledWith("load-expanded", expect.anything());
    expect(expandedPaths(m.state().roots)).toEqual([
      "github.com/acme/app",
      "/w/app",
      "/w/app/src",
      "/w/app/src/lib",
    ]);
    // The deepest folder's contents were read too.
    const read = m.dispatch.mock.calls.filter(([c]) => c === "read-dir").map(([, p]) => p.path);
    expect(read).toEqual(["/w/app", "/w/app/src", "/w/app/src/lib"]);
  });

  it("skips saved paths that are gone (a removed repo or folder)", async () => {
    const m = mount(["github.com/acme/gone", "github.com/acme/app", "/w/app", "/w/app/nope"]);
    await flush();
    expect(expandedPaths(m.state().roots)).toEqual(["github.com/acme/app", "/w/app"]);
  });

  it("saves nothing while restoring; then saves each change", async () => {
    const m = mount(["github.com/acme/app"]);
    await flush();
    expect(m.saves).toEqual([]);
    toggleNode(m.host, "github.com/acme/web", true);
    await flush();
    expect(m.saves.at(-1)).toEqual(["github.com/acme/app", "github.com/acme/web"]);
    toggleNode(m.host, "github.com/acme/app", false);
    await flush();
    expect(m.saves.at(-1)).toEqual(["github.com/acme/web"]);
  });

  it("with nothing saved, the first change is saved", async () => {
    const m = mount(null);
    await flush();
    toggleNode(m.host, "github.com/acme/app", true);
    await flush();
    expect(m.saves).toEqual([["github.com/acme/app"]]);
  });
});
