// @vitest-environment jsdom
/**
 * One focused row at a time. File rows are drag sources, and the platform's
 * drag service cancels their mousedown, so the browser does not move focus
 * to a clicked file row: the Explorer moves it itself, and only its own
 * focused row (`row--focused`) is highlighted, never a row merely holding
 * DOM focus.
 */
import { describe, it, expect, vi } from "vitest";
import { render as litRender } from "lit";
import {
  renderExplorer,
  applyReadDir,
  seedRoots,
  type ExplorerHost,
  type ExplorerState,
} from "@openp41ge-extension-explorer/tree-view";

const REPO = { name: "repo", worktrees: [{ name: "main", path: "/w/repo" }] };

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  let state = applyReadDir({ roots: seedRoots([REPO]) } as ExplorerState, "/w/repo", [
    { name: "src", path: "/w/repo/src", kind: "dir", children: [] },
    { name: "a.txt", path: "/w/repo/a.txt", kind: "file" },
  ]);
  state = { ...state, roots: state.roots.map((r) => ({ ...r, expanded: true })) };
  const host = {
    context: { workspaceRepos: [REPO] },
    get state() {
      return state;
    },
    dispatch: vi.fn(async (command: string) =>
      command === "load-expanded" ? { ok: true, paths: [] } : { ok: false, error: "no" },
    ),
    setState(update: (prev: ExplorerState) => ExplorerState) {
      state = update(state);
      litRender(renderExplorer(host), container);
    },
    openTab: vi.fn(),
  } as unknown as ExplorerHost;
  litRender(renderExplorer(host), container);
  const row = (path: string) => container.querySelector<HTMLElement>(`.row[data-path='${path}']`)!;
  return { container, row, state: () => state };
}

describe("Explorer row focus", () => {
  it("clicking a file row moves focus to it, off the folder row", () => {
    const m = mount();
    m.row("/w/repo/src").focus();
    m.row("/w/repo/src").click();
    expect(document.activeElement).toBe(m.row("/w/repo/src"));
    // The file row's mousedown is cancelled (drag source): only the click arrives.
    m.row("/w/repo/a.txt").click();
    expect(m.state().focusedId).toBe("/w/repo/a.txt");
    expect(document.activeElement).toBe(m.row("/w/repo/a.txt"));
    expect(m.container.querySelectorAll(".row--focused")).toHaveLength(1);
  });

  it("highlights only the Explorer's focused row, not a row holding DOM focus", () => {
    const m = mount();
    const css = [...m.container.querySelectorAll("style")].map((s) => s.textContent).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
    const highlight = /([^{}]*)\{[^}]*box-shadow: inset 0 0 0 1px var\(--tree-focus/.exec(css)!;
    const selectors = highlight[1].split(",").map((s) => s.trim());
    expect(selectors).toEqual([".explorer-tree:focus-within .row.row--focused"]);
  });
});
