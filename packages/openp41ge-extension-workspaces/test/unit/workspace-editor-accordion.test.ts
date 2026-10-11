// @vitest-environment jsdom
/**
 * The workspace editor's repositories accordion: several repos can be open at
 * once. Each open repo is its own (detached) card showing its worktrees; runs
 * of closed repos share a card, and the add-repository row ends the last card.
 */
import { describe, it, expect } from "vitest";
import { render } from "lit";
import {
  renderWorkspaceEditor,
  type WorkspaceEditorHost,
  type WorkspaceEditorState,
} from "@openp41ge-extension-workspaces/workspace-editor";

const repos = [
  { url: "git@github.com:acme/app.git", worktrees: ["main"] },
  { url: "git@github.com:acme/web.git", worktrees: ["dev"] },
  { url: "git@github.com:acme/api.git", worktrees: ["next"] },
];

function mount(
  openRepos: number[],
  list: ReadonlyArray<{ url: string; worktrees: string[] }> = repos,
) {
  const container = document.createElement("div");
  document.body.append(container);
  let state = {
    path: "/w.json",
    dir: "/w",
    data: { name: "n", repos: list },
    mode: "ui",
    loading: false,
    saved: true,
    savedData: undefined,
    undoStack: [],
    openRepos,
    editingRepo: null,
    editingValue: null,
    editingWorktree: null,
    editingWorktreeValue: null,
    addingRepoValue: "",
    nameLocked: true,
  } as unknown as WorkspaceEditorState;
  const host = {
    surface: "grid:workspace-editor",
    context: { path: "/w.json", dir: "/w" },
    get state() {
      return state;
    },
    setState(update: (prev: WorkspaceEditorState) => WorkspaceEditorState) {
      state = typeof update === "function" ? update(state) : update;
      render(renderWorkspaceEditor(host), container);
    },
    dispatch: async () => ({}),
    subscribe: () => () => {},
    log: { debug() {}, info() {}, warn() {}, error() {} },
    openTab: () => {},
  } as unknown as WorkspaceEditorHost;
  render(renderWorkspaceEditor(host), container);
  return { container, state: () => state };
}

const names = (card: Element) =>
  [...card.querySelectorAll(".we-card-name")].map((n) => n.textContent?.trim());

describe("workspace editor repositories accordion", () => {
  it("shows several repos open at once, each in its own card", () => {
    const { container } = mount([0, 2]);
    const cards = [...container.querySelectorAll(".we-card")];
    expect(cards.map((c) => c.classList.contains("we-card--detached"))).toEqual([
      true,
      false,
      true,
      false,
    ]);
    expect(names(cards[0])).toEqual(["github.com/acme/app"]);
    expect(names(cards[1])).toEqual(["github.com/acme/web"]);
    expect(names(cards[2])).toEqual(["github.com/acme/api"]);
    // The last card holds only the add-repository row.
    expect(names(cards[3])).toEqual([]);
    expect(container.textContent).toContain("main");
    expect(container.textContent).toContain("next");
    expect(container.textContent).not.toContain("dev");
  });

  it("opening a repo keeps the others open; clicking an open one closes only it", () => {
    const { container, state } = mount([0]);
    const head = (name: string) =>
      [...container.querySelectorAll<HTMLElement>(".we-seg-head")].find((h) =>
        h.textContent?.includes(name),
      )!;
    head("acme/web").click();
    expect(state().openRepos).toEqual([0, 1]);
    head("acme/app").click();
    expect(state().openRepos).toEqual([1]);
  });
});

describe("workspace editor: an entry that is not a clone URL", () => {
  it("is marked invalid with why, since it will never be cloned", () => {
    const { container } = mount(
      [],
      [repos[0], { url: "github.com/openp41ge/app-tests", worktrees: [] }],
    );
    const heads = [...container.querySelectorAll(".we-seg")];
    expect(heads[0].classList.contains("we-seg--invalid")).toBe(false);
    expect(heads[0].querySelector("[data-invalid-url]")).toBeNull();
    expect(heads[1].classList.contains("we-seg--invalid")).toBe(true);
    expect(heads[1].querySelector("[data-invalid-url]")?.textContent).toMatch(
      /Not a clone URL, so it is not cloned\. Enter the full clone URL/,
    );
  });
});
