// @vitest-environment jsdom
/**
 * Tests for the Explorer render function + its pure state helpers.
 *
 * The render function is a pure function of the host: it seeds the tree from
 * `context.workspaceRepos` (repos at the top level, worktrees beneath them),
 * lazily dispatches `read-dir` on worktree expand, and opens files in the host
 * editor after the backend's `open-file` gate passes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as litRender } from "lit";
import {
  renderExplorer,
  seedRoots,
  applyReadDir,
  applyWorktrees,
  addRepoNode,
  setNodeExpanded,
  setNodeError,
  setFocused,
  createRowKey,
  collapseAll,
  indentUnit,
  prefetchDepthOf,
  resetDoubleClickTracking,
  type ExplorerHost,
  type ExplorerState,
  type WorkspaceRepoInfo,
} from "@openp41ge-extension-explorer/tree-view";

const REPO: WorkspaceRepoInfo = {
  name: "repo",
  worktrees: [{ name: "main", path: "/w/repo" }],
};

interface Harness {
  host: ExplorerHost;
  container: HTMLElement;
  state: ExplorerState;
  dispatch: ReturnType<typeof vi.fn>;
  openTab: ReturnType<typeof vi.fn>;
}

/** The platform's `host.config`, as far as the Explorer uses it. */
function fakeConfig(values: Record<string, unknown> = {}) {
  const listeners = new Set<(c: Record<string, unknown>) => void>();
  let current = values;
  return {
    get: () => current,
    subscribe: vi.fn((fn: (c: Record<string, unknown>) => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }),
    openEditor: vi.fn(),
    /** Change the merged config (as a save in the editor would). */
    change(next: Record<string, unknown>) {
      current = next;
      listeners.forEach((fn) => fn(next));
    },
  };
}

function makeHost(
  context: Record<string, unknown>,
  dispatchImpl: (...args: unknown[]) => unknown = () => Promise.resolve({ ok: true }),
  initial?: ExplorerState,
  workspace?: Record<string, unknown>,
  config?: ReturnType<typeof fakeConfig>,
): Harness {
  const container = document.createElement("div");
  const dispatch = vi.fn(dispatchImpl);
  const openTab = vi.fn();
  let state: ExplorerState = initial ?? ({} as ExplorerState);
  const host = {
    context,
    state,
    // The open rows' load / save (tree-view-expanded.test.ts) are answered
    // here, so `dispatch` sees only the commands these tests are about.
    dispatch: (command: string, payload?: unknown) =>
      command === "load-expanded"
        ? Promise.resolve({ ok: true, paths: [] })
        : command === "save-expanded"
          ? Promise.resolve({ ok: true })
          : dispatch(command, payload),
    setState: (update: (prev: ExplorerState) => ExplorerState) => {
      state = update(state);
      host.state = state;
      litRender(renderExplorer(host), container);
    },
    openTab,
    workspace,
    config,
  } as unknown as ExplorerHost;
  litRender(renderExplorer(host), container);
  return {
    host,
    container,
    dispatch,
    openTab,
    get state() {
      return state;
    },
  };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Select a row by its `data-node-type` attribute. */
function rowByType(container: HTMLElement, type: string): Element {
  const el = container.querySelector(`.row[data-node-type='${type}']`);
  if (!el) throw new Error(`no row of type ${type}`);
  return el;
}

describe("renderExplorer", () => {
  beforeEach(() => {
    resetDoubleClickTracking();
  });

  it("seeds repos at the top level and reveals their worktrees on expand", () => {
    const { container } = makeHost({ workspaceRepos: [REPO] });
    // Only the repo row (plus the root add-repository row) is visible initially;
    // the worktree is nested beneath the repo.
    expect(container.querySelectorAll(".row")).toHaveLength(2);
    const repo = rowByType(container, "repo");
    expect(repo.querySelector(".label")?.textContent).toBe("repo");

    repo.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // repo + worktree + the repo's add-worktree row + the root add-repository row
    expect(container.querySelectorAll(".row")).toHaveLength(4);
    const wt = rowByType(container, "worktree");
    expect(wt.querySelector(".label")?.textContent).toBe("main");
  });

  it("follows the context's repos and worktrees after the tree was expanded", async () => {
    const two: WorkspaceRepoInfo = {
      name: "repo",
      worktrees: [
        { name: "main", path: "/w/repo/main" },
        { name: "dev", path: "/w/repo/dev" },
      ],
    };
    const other: WorkspaceRepoInfo = { name: "other", worktrees: [] };
    const h = makeHost({ workspaceRepos: [two, other] }, () =>
      Promise.resolve({
        ok: true,
        entries: [{ name: "a.txt", path: "/w/repo/main/a.txt", kind: "file" }],
      }),
    );
    rowByType(h.container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    rowByType(h.container, "worktree").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();

    // `other` was deleted, `dev` too; `added` arrived.
    const added: WorkspaceRepoInfo = { name: "added", worktrees: [] };
    (h.host as { context: Record<string, unknown> }).context = {
      workspaceRepos: [{ ...two, worktrees: [two.worktrees[0]] }, added],
    };
    litRender(renderExplorer(h.host), h.container);

    const labels = (type: string) =>
      [...h.container.querySelectorAll(`.row[data-node-type='${type}'] .label`)].map(
        (el) => el.textContent,
      );
    expect(labels("repo")).toEqual(["repo", "added"]);
    expect(labels("worktree")).toEqual(["main"]);
    // What was expanded and loaded stays so.
    expect(h.container.querySelector(".row[data-kind='file'] .label")?.textContent).toBe("a.txt");
  });

  it("renders an empty state when there are no repos", () => {
    const { container } = makeHost({ workspaceRepos: [] });
    expect(container.querySelector(".empty")?.textContent).toContain("No repositories");
  });

  it("wraps the tree in the shared sidebar-tab-content shell", () => {
    const { container } = makeHost({ workspaceRepos: [REPO] });
    expect(container.querySelector("openp41ge-sidebar-tab-content")).toBeTruthy();
  });

  it("dispatches read-dir and renders children when a worktree is expanded", async () => {
    const dispatchImpl = () =>
      Promise.resolve({
        ok: true,
        entries: [
          { name: "src", path: "/w/repo/src", kind: "dir" },
          { name: "a.txt", path: "/w/repo/a.txt", kind: "file" },
        ],
      });
    const { container, dispatch } = makeHost({ workspaceRepos: [REPO] }, dispatchImpl);

    // Expand the repo to reveal the worktree, then expand the worktree.
    rowByType(container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    rowByType(container, "worktree").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith("read-dir", { path: "/w/repo", depth: 2 });
    // repo + worktree + src dir + a.txt + the two create rows under the
    // worktree + the repo's add-worktree row + the root add-repository row
    const rows = container.querySelectorAll(".row");
    expect(rows).toHaveLength(8);
    const file = container.querySelector(".row[data-kind='file']");
    expect(file?.querySelector(".label")?.textContent).toBe("a.txt");
    // The create rows appear at the worktree level (folder/file) and the repo
    // level (add-worktree), plus the root add-repository row.
    const addRows = container.querySelectorAll(".row[data-new-entry]");
    expect(addRows).toHaveLength(4);
    expect(addRows[0]?.querySelector(".label")?.textContent).toBe("add folder");
    expect(addRows[1]?.querySelector(".label")?.textContent).toBe("add file");
    expect(addRows[2]?.querySelector(".label")?.textContent).toBe("add worktree");
    expect(addRows[3]?.querySelector(".label")?.textContent).toBe("add repository");
  });

  it("collapses an expanded worktree without a re-dispatch", async () => {
    const dispatchImpl = () => Promise.resolve({ ok: true, entries: [] });
    const initial = applyReadDir({ roots: seedRoots([REPO]) }, "/w/repo", [
      { name: "a.txt", path: "/w/repo/a.txt", kind: "file" },
    ]);
    const { container, dispatch } = makeHost({ workspaceRepos: [REPO] }, dispatchImpl, initial);

    // Expand the repo: worktree (already expanded) + its file + the two create
    // rows under it + the repo's add-worktree row become visible.
    rowByType(container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(container.querySelectorAll(".row")).toHaveLength(7);

    // Collapsing the worktree hides its children, no re-dispatch.
    rowByType(container, "worktree").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // repo (still expanded) + collapsed worktree + add-worktree + add-repository;
    // the file and its create rows are hidden.
    expect(container.querySelectorAll(".row")).toHaveLength(4);
    expect(container.querySelector(".row[data-kind='file']")).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("tags only file rows as the extension's file drag source", async () => {
    const initial = applyReadDir({ roots: seedRoots([REPO]) }, "/w/repo", [
      { name: "a.txt", path: "/w/repo/a.txt", kind: "file" },
      { name: "src", path: "/w/repo/src", kind: "dir" },
    ]);
    const { container } = makeHost({ workspaceRepos: [REPO] }, undefined, initial);
    rowByType(container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // A file row carries the registered source id + its path attribute; the
    // platform owns the gesture, ghost and drop. No native HTML5 drag and no
    // legacy platform file-drag marker (data-file-path).
    const fileRow = container.querySelector<HTMLElement>(".row[data-kind='file']")!;
    expect(fileRow.getAttribute("data-drag-source-id")).toBe("file");
    expect(fileRow.getAttribute("data-path")).toBe("/w/repo/a.txt");
    expect(fileRow.hasAttribute("data-file-path")).toBe(false);
    expect(fileRow.hasAttribute("draggable")).toBe(false);

    for (const type of ["worktree", "repo"]) {
      const row = container.querySelector<HTMLElement>(`.row[data-node-type='${type}']`)!;
      expect(row.hasAttribute("data-drag-source-id")).toBe(false);
    }
    const dirRow = container.querySelector<HTMLElement>(".row[data-kind='dir']")!;
    expect(dirRow.hasAttribute("data-drag-source-id")).toBe(false);
  });

  it("opens a file in the host editor after the open-file gate passes", async () => {
    const initial = applyReadDir({ roots: seedRoots([REPO]) }, "/w/repo", [
      { name: "a.txt", path: "/w/repo/a.txt", kind: "file" },
    ]);
    const { container, dispatch, openTab } = makeHost(
      { workspaceRepos: [REPO] },
      () => Promise.resolve({ ok: true }),
      initial,
    );

    rowByType(container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    container
      .querySelector(".row[data-kind='file']")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();

    expect(dispatch).toHaveBeenCalledWith("open-file", { path: "/w/repo/a.txt", root: "/w/repo" });
    expect(openTab).toHaveBeenCalledWith({
      appType: "file-viewer",
      params: { filePath: "/w/repo/a.txt" },
      pinned: false,
    });
  });

  it("pins a file when it is double-clicked in quick succession", async () => {
    const initial = applyReadDir({ roots: seedRoots([REPO]) }, "/w/repo", [
      { name: "b.txt", path: "/w/repo/b.txt", kind: "file" },
    ]);
    const { container, openTab } = makeHost(
      { workspaceRepos: [REPO] },
      () => Promise.resolve({ ok: true }),
      initial,
    );

    rowByType(container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const row = container.querySelector(".row[data-kind='file']")!;
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();

    expect(openTab).toHaveBeenCalledTimes(2);
    expect(openTab.mock.calls[0][0]).toMatchObject({
      params: { filePath: "/w/repo/b.txt" },
      pinned: false,
    });
    expect(openTab.mock.calls[1][0]).toMatchObject({
      params: { filePath: "/w/repo/b.txt" },
      pinned: true,
    });
  });

  it("does not pin single clicks in quick succession on different files", async () => {
    const initial = applyReadDir({ roots: seedRoots([REPO]) }, "/w/repo", [
      { name: "c.txt", path: "/w/repo/c.txt", kind: "file" },
      { name: "d.txt", path: "/w/repo/d.txt", kind: "file" },
    ]);
    const { container, openTab } = makeHost(
      { workspaceRepos: [REPO] },
      () => Promise.resolve({ ok: true }),
      initial,
    );

    rowByType(container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const fileRows = container.querySelectorAll(".row[data-kind='file']");
    fileRows[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    fileRows[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();

    expect(openTab).toHaveBeenCalledTimes(2);
    expect(openTab.mock.calls[0][0]).toMatchObject({ pinned: false });
    expect(openTab.mock.calls[1][0]).toMatchObject({ pinned: false });
  });

  it("does not open a file the backend gate rejects", async () => {
    const initial = applyReadDir({ roots: seedRoots([REPO]) }, "/w/repo", [
      { name: "secret.txt", path: "/outside/secret.txt", kind: "file" },
    ]);
    const { container, openTab } = makeHost(
      { workspaceRepos: [REPO] },
      () => Promise.resolve({ ok: false, error: "outside root" }),
      initial,
    );

    rowByType(container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    container
      .querySelector(".row[data-kind='file']")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    expect(openTab).not.toHaveBeenCalled();
  });

  it("adds an add-worktree row (but no folder/file rows) to a repo grouping row", () => {
    const initial = applyReadDir({ roots: seedRoots([REPO]) }, "/w/repo", [
      { name: "a.txt", path: "/w/repo/a.txt", kind: "file" },
    ]);
    const { container } = makeHost({ workspaceRepos: [REPO] }, undefined, initial);
    rowByType(container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // repo + worktree + a.txt + the two create rows *under the worktree*
    // + the repo's own add-worktree row + the root add-repository row
    expect(container.querySelectorAll(".row")).toHaveLength(7);
    // Only the repo-level add-worktree row is a create row at the repo's own
    // level; the folder/file rows live under the worktree directory, keyed to
    // its path. The root add-repository row is keyed to the empty path.
    const addPaths = Array.from(container.querySelectorAll(".row[data-new-entry]")).map((r) =>
      r.getAttribute("data-path"),
    );
    expect(addPaths).toEqual(["/w/repo", "/w/repo", "repo", ""]);
  });

  it("enters edit mode on clicking an add row and creates a folder on Enter", async () => {
    const dispatchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, entries: [] }) // read-dir for the worktree
      .mockResolvedValueOnce({ ok: true }) // create-dir
      .mockResolvedValueOnce({ ok: true, entries: [] }); // refresh read-dir
    const { container } = makeHost({ workspaceRepos: [REPO] }, dispatchImpl);

    rowByType(container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    rowByType(container, "worktree").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();

    // Click the add folder row → an inline input appears.
    const addFolder = container.querySelector(".row[data-new-entry='folder']")!;
    addFolder.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    const input = container.querySelector<HTMLInputElement>(".new-entry-input");
    expect(input).not.toBeNull();

    // Type a name, then press Enter.
    input!.value = "src";
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    input!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    await flush();

    expect(dispatchImpl).toHaveBeenCalledWith("create-dir", {
      path: "/w/repo/src",
      root: "/w/repo",
    });
    // Leaves edit mode after confirm (the input row is gone).
    expect(container.querySelector(".new-entry-input")).toBeNull();
  });

  it("creates a file via write-file and refreshes the parent listing", async () => {
    const dispatchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, entries: [] }) // read-dir worktree
      .mockResolvedValueOnce({ ok: true }) // write-file
      .mockResolvedValueOnce({
        ok: true,
        entries: [{ name: "notes.md", path: "/w/repo/notes.md", kind: "file" }],
      }); // refresh
    const { container } = makeHost({ workspaceRepos: [REPO] }, dispatchImpl);

    rowByType(container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    rowByType(container, "worktree").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();

    const addFile = container.querySelector(".row[data-new-entry='file']")!;
    addFile.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    const input = container.querySelector<HTMLInputElement>(".new-entry-input");
    input!.value = "notes.md";
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    input!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    await flush();

    expect(dispatchImpl).toHaveBeenCalledWith("write-file", {
      path: "/w/repo/notes.md",
      root: "/w/repo",
    });
    // The refreshed listing now shows the new file.
    expect(
      container.querySelector(".row[data-kind='file']")?.querySelector(".label")?.textContent,
    ).toBe("notes.md");
  });

  it("Escape cancels an inline create row without creating anything", async () => {
    const dispatchImpl = vi.fn().mockResolvedValue({ ok: true, entries: [] });
    const { container } = makeHost({ workspaceRepos: [REPO] }, dispatchImpl);

    rowByType(container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    rowByType(container, "worktree").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();

    const addFolder = container.querySelector(".row[data-new-entry='folder']")!;
    addFolder.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    const input = container.querySelector<HTMLInputElement>(".new-entry-input");
    input!.value = "src";
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    input!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await flush();

    // No create command was dispatched; edit mode was exited.
    expect(dispatchImpl).not.toHaveBeenCalledWith("create-dir", expect.anything());
    expect(container.querySelector(".new-entry-input")).toBeNull();
  });
});

describe("state helpers", () => {
  const withConfig = (values: Record<string, unknown>) =>
    makeHost({}, undefined, undefined, undefined, fakeConfig(values)).host;

  it("reads the indent unit from the extension's config, defaulting to 16", () => {
    expect(indentUnit(makeHost({}).host)).toBe(16);
    expect(indentUnit(withConfig({ indentSize: 28 }))).toBe(28);
    expect(indentUnit(withConfig({ indentSize: 999 }))).toBe(48);
    expect(indentUnit(withConfig({ indentSize: 1 }))).toBe(4);
  });

  it("reads the prefetch depth from the extension's config, defaulting to 2", () => {
    expect(prefetchDepthOf(makeHost({}).host)).toBe(2);
    expect(prefetchDepthOf(withConfig({ prefetchDepth: 3 }))).toBe(3);
    expect(prefetchDepthOf(withConfig({ prefetchDepth: 99 }))).toBe(4);
    expect(prefetchDepthOf(withConfig({ prefetchDepth: -1 }))).toBe(0);
  });

  it("re-renders when its config changes", () => {
    const config = fakeConfig({ indentSize: 16 });
    const harness = makeHost({ workspaceRepos: [REPO] }, undefined, undefined, undefined, config);
    const before = harness.state;
    config.change({ indentSize: 40 });
    expect(config.subscribe).toHaveBeenCalledTimes(1);
    expect(harness.state).not.toBe(before);
    expect(indentUnit(harness.host)).toBe(40);
  });

  it("seedRoots groups repos → worktrees; worktrees are unloaded for lazy fetch", () => {
    const roots = seedRoots([REPO]);
    expect(roots[0]).toMatchObject({
      kind: "dir",
      nodeType: "repo",
      loaded: true,
      expanded: false,
      root: "repo",
    });
    expect(roots[0].children[0]).toMatchObject({
      kind: "dir",
      nodeType: "worktree",
      loaded: false,
      expanded: false,
      root: "/w/repo",
    });
  });

  it("applyReadDir fills a worktree's children, preserving the worktree root", () => {
    const next = applyReadDir({ roots: seedRoots([REPO]) }, "/w/repo", [
      { name: "src", path: "/w/repo/src", kind: "dir" },
    ]);
    const wt = next.roots[0].children[0];
    expect(wt.loaded).toBe(true);
    expect(wt.expanded).toBe(true);
    expect(wt.children).toHaveLength(1);
    expect(wt.children[0].root).toBe("/w/repo");
  });

  it("setNodeExpanded / setNodeError mutate only the targeted worktree", () => {
    const seeded = seedRoots([
      REPO,
      { name: "two", worktrees: [{ name: "main", path: "/w/two" }] },
    ]);
    const expanded = setNodeExpanded({ roots: seeded }, "/w/repo", true);
    expect(expanded.roots[0].children[0].expanded).toBe(true);
    expect(expanded.roots[1].children[0].expanded).toBe(false);

    const errored = setNodeError(expanded, "/w/repo", "boom");
    expect(errored.roots[0].children[0].error).toBe("boom");
    expect(errored.roots[0].children[0].expanded).toBe(false);
    expect(errored.roots[1].children[0].error).toBeUndefined();
  });

  it("setFocused moves the focus cursor; createRowKey is namespaced per kind+path", () => {
    expect(setFocused({ roots: [] }, "/w/repo").focusedId).toBe("/w/repo");
    expect(setFocused({ roots: [] }, null).focusedId).toBeNull();
    const key = createRowKey({ path: "/w/repo", kind: "worktree" });
    expect(key).toBe("create:worktree:/w/repo");
    const fileKey = createRowKey({ path: "/w/repo/a.ts", kind: "file" });
    expect(fileKey).not.toBe(key);
  });

  it("composing state helpers preserves unrelated state (focusedId / newEntry)", () => {
    const seeded = seedRoots([REPO]);
    const base: ExplorerState = {
      roots: seeded,
      focusedId: "/w/repo",
      newEntry: { path: "/w/repo", kind: "worktree" },
      newEntryName: "feat",
    };
    const expanded = setNodeExpanded(base, "/w/repo", true);
    expect(expanded.focusedId).toBe("/w/repo");
    expect(expanded.newEntry?.kind).toBe("worktree");
    const filled = applyReadDir(base, "/w/repo", [
      { name: "src", path: "/w/repo/src", kind: "dir" },
    ]);
    expect(filled.focusedId).toBe("/w/repo");
    expect(filled.newEntryName).toBe("feat");
    const errored = setNodeError(base, "/w/repo", "boom");
    expect(errored.focusedId).toBe("/w/repo");
  });

  it("applyWorktrees preserves unrelated state when rebuilding a repo's children", () => {
    const base: ExplorerState = {
      roots: seedRoots([REPO]),
      focusedId: "/w/repo",
    };
    const next = applyWorktrees(base, "repo", [
      { name: "main", path: "/w/repo", exists: true },
      { name: "next", path: "/w/next", exists: true },
    ]);
    expect(next.focusedId).toBe("/w/repo");
    expect(next.roots[0].children).toHaveLength(2);
  });

  it("collapseAll collapses every expanded node recursively", () => {
    const collapsed = collapseAll([
      {
        path: "/w/repo",
        name: "repo",
        kind: "dir",
        nodeType: "repo",
        root: "repo",
        loaded: true,
        expanded: true,
        children: [
          {
            path: "/w/repo/src",
            name: "src",
            kind: "dir",
            root: "/w/repo",
            loaded: true,
            expanded: true,
            children: [
              {
                path: "/w/repo/src/utils.ts",
                name: "utils.ts",
                kind: "file",
                root: "/w/repo",
                loaded: true,
                expanded: false,
                children: [],
              },
            ],
          },
        ],
      },
    ]);
    expect(collapsed[0].expanded).toBe(false);
    expect(collapsed[0].children[0].expanded).toBe(false);
    expect(collapsed[0].children[0].children[0].expanded).toBe(false);
  });

  it("applyWorktrees rebuilds a repo's worktree children, preserving expanded ones", () => {
    const seeded = seedRoots([REPO]);
    const next = applyWorktrees({ roots: seeded }, "repo", [
      { branch: "main", path: "/w/repo/main", exists: true },
      { branch: "feat", path: "/w/repo/feat", exists: true },
    ]);
    expect(next.roots[0].expanded).toBe(true);
    expect(next.roots[0].children.map((c) => c.name)).toEqual(["main", "feat"]);
    expect(next.roots[0].children[1]).toMatchObject({
      path: "/w/repo/feat",
      nodeType: "worktree",
      root: "/w/repo/feat",
    });
  });

  it("applyWorktrees filters out branches not checked out on disk", () => {
    const next = applyWorktrees({ roots: seedRoots([REPO]) }, "repo", [
      { branch: "main", path: "/w/repo/main", exists: false },
    ]);
    expect(next.roots[0].children).toHaveLength(0);
  });

  it("addRepoNode appends a repo once and is a no-op for a duplicate", () => {
    const roots = seedRoots([REPO]);
    const added = addRepoNode(roots, "org/new");
    expect(added).toHaveLength(2);
    expect(added[1]).toMatchObject({ path: "org/new", nodeType: "repo", root: "org/new" });
    expect(addRepoNode(added, "repo")).toHaveLength(2);
  });
});

describe("add-worktree / add-repository create rows", () => {
  it("adds a worktree through host.workspace and shows it under the repo", async () => {
    const addWorktree = vi.fn(() => Promise.resolve({ ok: true, path: "/w/repo/feat" }));
    const { container, host } = makeHost(
      { workspaceRepos: [REPO] },
      undefined,
      { roots: seedRoots([REPO]) },
      { addWorktree, addRepository: vi.fn() },
    );
    rowByType(container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const addWt = container.querySelector(".row[data-new-entry='worktree']")!;
    addWt.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const input = container.querySelector("input[data-new-entry='worktree']") as HTMLInputElement;
    input.value = "feat";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    (container.querySelector(".new-entry-confirm") as HTMLElement).dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await flush();

    expect(addWorktree).toHaveBeenCalledWith("repo", "feat");
    expect((host.state as ExplorerState).roots[0].children.map((c) => c.name)).toEqual([
      "main",
      "feat",
    ]);
  });

  it("leaves the rows unchanged when adding a worktree fails", async () => {
    const addWorktree = vi.fn(() => Promise.resolve({ ok: false, error: "nope" }));
    const { container, host } = makeHost(
      { workspaceRepos: [REPO] },
      undefined,
      { roots: seedRoots([REPO]) },
      { addWorktree, addRepository: vi.fn() },
    );
    rowByType(container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    container
      .querySelector(".row[data-new-entry='worktree']")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const input = container.querySelector("input[data-new-entry='worktree']") as HTMLInputElement;
    input.value = "feat";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    (container.querySelector(".new-entry-confirm") as HTMLElement).dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await flush();

    expect((host.state as ExplorerState).roots[0].children.map((c) => c.name)).toEqual(["main"]);
  });

  it("clones a repository through host.workspace and appends it to the roots", async () => {
    const addRepository = vi.fn(() => ({
      done: Promise.resolve({ ok: true, repoName: "github.com/org/app" }),
      onProgress: () => () => {},
      cancel: () => {},
    }));
    const { container, host } = makeHost({ workspaceRepos: [] }, undefined, undefined, {
      addRepository,
      addWorktree: vi.fn(),
    });
    const addRepo = container.querySelector(".row[data-new-entry='repo']")!;
    addRepo.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const input = container.querySelector("input[data-new-entry='repo']") as HTMLInputElement;
    input.value = "git@github.com:org/app.git";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    (container.querySelector(".new-entry-confirm") as HTMLElement).dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await flush();

    expect(addRepository).toHaveBeenCalledWith("git@github.com:org/app.git");
    expect(((host.state as ExplorerState).roots ?? []).map((r) => r.name)).toEqual([
      "github.com/org/app",
    ]);
  });
});

describe("create row icons", () => {
  it("puts the + in the chevron column and a kind glyph in the icon column", async () => {
    const { container } = makeHost({ workspaceRepos: [REPO] });
    // Expand repo → worktree, then the worktree (empty dir → its two create rows).
    rowByType(container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    rowByType(container, "worktree").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();

    const folder = container.querySelector<HTMLElement>(".row[data-new-entry='folder']")!;
    const file = container.querySelector<HTMLElement>(".row[data-new-entry='file']")!;
    expect(folder.querySelector(".chevron")?.innerHTML).toContain('name="plus"');
    expect(folder.querySelector(".icon")?.innerHTML).toContain('name="folder-closed"');
    expect(file.querySelector(".chevron")?.innerHTML).toContain('name="plus"');
    expect(file.querySelector(".icon")?.innerHTML).toContain('name="file"');
  });
});

describe("arrow-key navigation", () => {
  it("moves focus with Up/Down and collapses/expands with Left/Right", () => {
    const { container } = makeHost({ workspaceRepos: [REPO] });
    const tree = container.querySelector<HTMLElement>(".explorer-tree")!;
    const press = (k: string) =>
      tree.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));

    // Expand the repo, leaving focus on it.
    const repo = rowByType(container, "repo");
    repo.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(repo.classList.contains("row--focused")).toBe(true);

    // Down → the worktree row.
    press("ArrowDown");
    expect(rowByType(container, "worktree").classList.contains("row--focused")).toBe(true);

    // Down → the repo's + add worktree create row.
    press("ArrowDown");
    const addWt = container.querySelector<HTMLElement>(".row[data-new-entry='worktree']")!;
    expect(addWt.classList.contains("row--focused")).toBe(true);
    expect(addWt.getAttribute("data-depth")).toBe("1");

    // Up → back to the worktree, again up → back to the repo.
    press("ArrowUp");
    expect(rowByType(container, "worktree").classList.contains("row--focused")).toBe(true);
    press("ArrowUp");
    expect(repo.classList.contains("row--focused")).toBe(true);

    // Left on an expanded dir collapses it.
    press("ArrowLeft");
    expect(repo.getAttribute("data-expanded")).toBe("false");

    // Right on a collapsed dir expands it again (repo is preloaded).
    press("ArrowRight");
    expect(repo.getAttribute("data-expanded")).toBe("true");
  });

  it("lets the inline edit input keep arrow keys (no row navigation while typing)", async () => {
    const { container } = makeHost({ workspaceRepos: [REPO] });
    const tree = container.querySelector<HTMLElement>(".explorer-tree")!;
    // Expand repo, then click the worktree's + add worktree row to enter edit mode.
    rowByType(container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    container
      .querySelector<HTMLElement>(".row[data-new-entry='worktree']")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const input = container.querySelector<HTMLInputElement>("input[data-new-entry='worktree']")!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(input.value).toBe("");
    // The arrow key on the input must not move row focus (input wins).
    expect(input).toBeTruthy();
  });

  it("Enter on a focused create row (reached via arrows) enters edit mode", async () => {
    const { container } = makeHost({ workspaceRepos: [REPO] });
    const tree = container.querySelector<HTMLElement>(".explorer-tree")!;
    const press = (k: string) =>
      tree.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));

    rowByType(container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    press("ArrowDown"); // → worktree
    press("ArrowDown"); // → + add worktree (focused but not editing)
    const addWt = container.querySelector<HTMLElement>(".row[data-new-entry='worktree']")!;
    expect(addWt.classList.contains("row--focused")).toBe(true);
    expect(addWt.classList.contains("new-entry-row")).toBe(false);

    press("Enter");
    const editRow = container.querySelector<HTMLElement>(
      ".row.new-entry-row[data-new-entry='worktree']",
    );
    expect(editRow).toBeTruthy();
    expect(
      container.querySelector<HTMLInputElement>("input[data-new-entry='worktree']"),
    ).toBeTruthy();
  });

  it("uses the requested placeholder text for each create kind", async () => {
    const { container } = makeHost({ workspaceRepos: [REPO] });
    rowByType(container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // Worktree create row.
    const addWt = container.querySelector<HTMLElement>(".row[data-new-entry='worktree']")!;
    addWt.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(
      container.querySelector<HTMLInputElement>("input[data-new-entry='worktree']")!.placeholder,
    ).toBe("worktree name");
    // Cancel, then the repo create row.
    container
      .querySelector<HTMLElement>(".new-entry-cancel")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const addRepo = container.querySelector<HTMLElement>(".row[data-new-entry='repo']")!;
    addRepo.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(
      container.querySelector<HTMLInputElement>("input[data-new-entry='repo']")!.placeholder,
    ).toBe("repository URL");
  });
});

describe("row context menu", () => {
  type Entry = { label?: string; onSelect?: () => void; separator?: true };
  function menuHost(workspace: Record<string, unknown>) {
    const h = makeHost({ workspaceRepos: [REPO] }, undefined, undefined, workspace);
    const showContextMenu = vi.fn();
    (h.host as unknown as { showContextMenu: unknown }).showContextMenu = showContextMenu;
    const rightClick = (el: Element) =>
      el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const menu = (): Entry[] => showContextMenu.mock.calls.at(-1)?.[1] ?? [];
    return { ...h, showContextMenu, rightClick, menu };
  }

  it("deletes a repository from its row (the platform asks first)", async () => {
    const deleteRepository = vi.fn(async () => ({ ok: true }));
    const h = menuHost({ deleteRepository });
    h.rightClick(rowByType(h.container, "repo"));
    expect(h.menu().map((e) => e.label)).toEqual(["Delete"]);
    h.menu()[0].onSelect!();
    expect(deleteRepository).toHaveBeenCalledWith("repo");
  });

  it("deletes a worktree from its row", async () => {
    const deleteWorktree = vi.fn(async () => ({ ok: true }));
    const h = menuHost({ deleteWorktree });
    rowByType(h.container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    h.rightClick(rowByType(h.container, "worktree"));
    expect(h.menu().map((e) => e.label)).toEqual(["Delete"]);
    h.menu()[0].onSelect!();
    expect(deleteWorktree).toHaveBeenCalledWith("repo", "main");
  });

  it("offers no menu on file and folder rows", async () => {
    const h = menuHost({});
    h.host.setState(() =>
      applyReadDir(
        setNodeExpanded(
          setNodeExpanded({ roots: seedRoots([REPO]) }, "repo", true),
          "/w/repo",
          true,
        ),
        "/w/repo",
        [
          { name: "src", path: "/w/repo/src", kind: "dir" },
          { name: "a.txt", path: "/w/repo/a.txt", kind: "file" },
        ],
      ),
    );
    h.rightClick(h.container.querySelector(".row[data-kind='file']")!);
    h.rightClick(h.container.querySelector(".row[data-path='/w/repo/src']")!);
    expect(h.showContextMenu).not.toHaveBeenCalled();
  });

  it("marks the row when the delete fails, not when it is declined", async () => {
    const deleteRepository = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, cancelled: true })
      .mockResolvedValueOnce({ ok: false, error: "disk full" });
    const h = menuHost({ deleteRepository });
    h.rightClick(rowByType(h.container, "repo"));
    h.menu()[0].onSelect!();
    await flush();
    expect(rowByType(h.container, "repo").classList.contains("row--error")).toBe(false);
    h.rightClick(rowByType(h.container, "repo"));
    h.menu()[0].onSelect!();
    await flush();
    const row = rowByType(h.container, "repo");
    expect(row.classList.contains("row--error")).toBe(true);
    expect(row.getAttribute("title")).toBe("Delete failed: disk full");
  });
});

describe("add rows while the platform works", () => {
  /** Type into the open create row of `kind` and confirm it. */
  function confirmCreate(container: HTMLElement, kind: string, value: string): void {
    const input = container.querySelector(`input[data-new-entry='${kind}']`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    (container.querySelector(".new-entry-confirm") as HTMLElement).dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
  }
  const pendingRow = (container: HTMLElement) =>
    container.querySelector<HTMLElement>(".row.pending-row");

  it("shows the repository being cloned, with its progress, until it is added", async () => {
    let finish!: (r: { ok: boolean; repoName?: string }) => void;
    let progress!: (p: { percent: number }) => void;
    const addRepository = vi.fn(() => ({
      done: new Promise((r) => (finish = r)),
      onProgress: (fn: (p: { percent: number }) => void) => {
        progress = fn;
        return () => {};
      },
      cancel: () => {},
    }));
    const { container } = makeHost({ workspaceRepos: [] }, undefined, undefined, {
      addRepository,
    });
    container
      .querySelector(".row[data-new-entry='repo']")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    confirmCreate(container, "repo", "git@github.com:org/app.git");

    expect(pendingRow(container)?.textContent).toContain("git@github.com:org/app.git");
    expect(pendingRow(container)?.textContent).toContain("Cloning…");
    progress({ percent: 42 });
    expect(pendingRow(container)?.textContent).toContain("Cloning 42%");

    finish({ ok: true, repoName: "github.com/org/app" });
    await flush();
    expect(pendingRow(container)).toBeNull();
    expect(rowByType(container, "repo").textContent).toContain("github.com/org/app");
  });

  it("shows the worktree being checked out until it is added", async () => {
    let finish!: (r: { ok: boolean; path?: string }) => void;
    const addWorktree = vi.fn(() => new Promise((r) => (finish = r)));
    const { container } = makeHost(
      { workspaceRepos: [REPO] },
      undefined,
      { roots: seedRoots([REPO]) },
      { addWorktree },
    );
    rowByType(container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    container
      .querySelector(".row[data-new-entry='worktree']")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    confirmCreate(container, "worktree", "feat");

    expect(pendingRow(container)?.textContent).toContain("feat");
    expect(pendingRow(container)?.textContent).toContain("Checking out…");
    finish({ ok: true, path: "/w/repo/feat" });
    await flush();
    expect(pendingRow(container)).toBeNull();
  });

  it("keeps + add repository free while a clone runs, so another can be added", async () => {
    const finishes: Array<(r: { ok: boolean; repoName?: string }) => void> = [];
    const addRepository = vi.fn(() => ({
      done: new Promise((r) => finishes.push(r)),
      onProgress: () => () => {},
      cancel: () => {},
    }));
    const { container } = makeHost({ workspaceRepos: [] }, undefined, undefined, {
      addRepository,
    });
    const addRow = () =>
      container.querySelector<HTMLElement>(".row.add-row[data-new-entry='repo']");
    addRow()!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    confirmCreate(container, "repo", "git@github.com:org/one.git");
    expect(addRow()).not.toBeNull();
    addRow()!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    confirmCreate(container, "repo", "git@github.com:org/two.git");

    expect(addRepository).toHaveBeenCalledTimes(2);
    const pending = () =>
      [...container.querySelectorAll<HTMLElement>(".row.pending-row .label")].map(
        (l) => l.textContent,
      );
    expect(pending()).toEqual(["git@github.com:org/one.git", "git@github.com:org/two.git"]);
    finishes[0]({ ok: true, repoName: "github.com/org/one" });
    await flush();
    expect(pending()).toEqual(["git@github.com:org/two.git"]);
    expect(rowByType(container, "repo").textContent).toContain("github.com/org/one");
  });

  it("keeps a failed clone as its own row while another is being typed", async () => {
    let fail!: (r: { ok: boolean; error?: string }) => void;
    const addRepository = vi.fn(() => ({
      done: new Promise((r) => (fail = r)),
      onProgress: () => () => {},
      cancel: () => {},
    }));
    const { container } = makeHost({ workspaceRepos: [] }, undefined, undefined, {
      addRepository,
    });
    const addRow = () =>
      container.querySelector<HTMLElement>(".row.add-row[data-new-entry='repo']");
    addRow()!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    confirmCreate(container, "repo", "git@github.com:org/one.git");
    addRow()!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const input = container.querySelector("input[data-new-entry='repo']") as HTMLInputElement;
    input.value = "git@github.com:org/half";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    fail({ ok: false, error: "fatal: denied" });
    await flush();
    expect(
      (container.querySelector("input[data-new-entry='repo']") as HTMLInputElement).value,
    ).toBe("git@github.com:org/half");
    const failed = pendingRow(container)!;
    expect(failed.classList.contains("row--error")).toBe(true);
    expect(failed.title).toBe("fatal: denied");
    expect(failed.textContent).toContain("git@github.com:org/one.git");
  });

  it("reopens the row with what was typed, and the error, when it fails", async () => {
    const addWorktree = vi.fn(async () => ({ ok: false, error: "fatal: invalid reference" }));
    const { container } = makeHost(
      { workspaceRepos: [REPO] },
      undefined,
      { roots: seedRoots([REPO]) },
      { addWorktree },
    );
    rowByType(container, "repo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    container
      .querySelector(".row[data-new-entry='worktree']")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    confirmCreate(container, "worktree", "nope");
    await flush();

    expect(pendingRow(container)).toBeNull();
    const row = container.querySelector<HTMLElement>(".row.new-entry-row")!;
    expect(row.classList.contains("row--error")).toBe(true);
    expect(row.title).toBe("fatal: invalid reference");
    const input = row.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("nope");
  });
});

describe("the Explorer's settings button", () => {
  it("opens the extension's config editor", () => {
    class FakeShell extends HTMLElement {
      readonly buttons = new Map<string, { onClick?: () => void; title?: string }>();
      registerBottomBarButton(spec: { id: string; onClick?: () => void; title?: string }) {
        this.buttons.set(spec.id, spec);
        return () => this.buttons.delete(spec.id);
      }
    }
    if (!customElements.get("openp41ge-sidebar-tab-content")) {
      customElements.define("openp41ge-sidebar-tab-content", FakeShell);
    }
    const config = fakeConfig({});
    const { container } = makeHost({}, undefined, undefined, undefined, config);
    const shell = container.querySelector("openp41ge-sidebar-tab-content") as unknown as FakeShell;
    const button = shell.buttons.get("explorer-settings");
    expect(button?.title).toBe("Explorer settings");
    button!.onClick!();
    expect(config.openEditor).toHaveBeenCalled();
  });
});
