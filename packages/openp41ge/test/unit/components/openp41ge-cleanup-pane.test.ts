/**
 * <openp41ge-cleanup-pane>, the manager window's Cleanup tab: what the
 * repository cleanup kept because it holds work, summarised per worktree /
 * branch (never per file), with Delete (asks first) and Show in Finder.
 */
import { describe, test, expect, afterEach, vi } from "vitest";
import {
  Openp41geCleanupPane,
  type CleanupPaneDeps,
} from "../../../src/renderer/components/openp41ge-cleanup-pane";

type Item = Awaited<ReturnType<CleanupPaneDeps["list"]>>[number];

const ITEM: Item = {
  kind: "repository",
  path: "/data/repositories/github.com/acme/old",
  name: "github.com/acme/old",
  repositories: [
    {
      repoName: "github.com/acme/old",
      branches: [
        { branch: "main", worktree: true, staged: 0, unstaged: 2, untracked: 1, unpushed: 0 },
        { branch: "wip", worktree: false, staged: 0, unstaged: 0, untracked: 0, unpushed: 3 },
        { branch: "clean", worktree: true, staged: 0, unstaged: 0, untracked: 0, unpushed: 0 },
      ],
      stashed: true,
    },
  ],
};

const WORKSPACE: Item = {
  kind: "workspace",
  path: "/data/workspaces-data/gone",
  name: "gone",
  repositories: [
    { repoName: "github.com/acme/app", branches: [], stashed: false, error: "fatal: bad object" },
  ],
};

function makeDeps(items: Item[], over: Partial<CleanupPaneDeps> = {}) {
  let changed: () => void = () => {};
  const deps: CleanupPaneDeps = {
    list: vi.fn(async () => items),
    run: vi.fn(async () => items),
    delete: vi.fn(async () => ({ ok: true })),
    reveal: vi.fn(async () => true),
    onChanged: (fn) => {
      changed = fn;
      return () => {};
    },
    confirm: vi.fn(async () => true),
    ...over,
  };
  return { deps, fireChanged: () => changed() };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

async function mount(deps: CleanupPaneDeps): Promise<Openp41geCleanupPane> {
  Openp41geCleanupPane.deps = deps;
  const el = document.createElement("openp41ge-cleanup-pane") as Openp41geCleanupPane;
  document.body.appendChild(el);
  await tick();
  await el.updateComplete;
  return el;
}

const $ = (el: Openp41geCleanupPane, sel: string) => el.shadowRoot!.querySelector<HTMLElement>(sel);
const $$ = (el: Openp41geCleanupPane, sel: string) => [
  ...el.shadowRoot!.querySelectorAll<HTMLElement>(sel),
];

describe("openp41ge-cleanup-pane", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("says when there is nothing to clean up", async () => {
    const el = await mount(makeDeps([]).deps);
    expect($(el, ".cp-state")?.textContent).toContain("Nothing to clean up");
  });

  test("lists each item with its worktrees' / branches' work, never files", async () => {
    const el = await mount(makeDeps([ITEM, WORKSPACE]).deps);
    const items = $$(el, ".cp-item");
    expect(items).toHaveLength(2);
    expect(items[0].querySelector(".cp-name")?.textContent).toBe("github.com/acme/old");
    expect(items[0].querySelector(".cp-path")?.textContent).toBe(ITEM.path);
    const lines = [...items[0].querySelectorAll(".cp-work li")].map((li) => li.textContent?.trim());
    expect(lines).toEqual([
      "main: 2 changed, 1 untracked",
      "wip (no worktree): 3 commits not pushed",
      "stashed changes",
    ]);
    // A deleted workspace's folder names each clone in it.
    expect(items[1].querySelector(".cp-name")?.textContent).toBe("Deleted workspace gone");
    expect(items[1].textContent).toContain("github.com/acme/app");
    expect(items[1].textContent).toContain("state could not be read: fatal: bad object");
  });

  test("Delete asks first, with the same summary, then deletes", async () => {
    const { deps } = makeDeps([ITEM]);
    const el = await mount(deps);
    $(el, ".cp-delete")!.click();
    await tick();
    expect(deps.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Delete github.com/acme/old?",
        detail: expect.stringContaining("• main: 2 changed, 1 untracked"),
        confirmLabel: "Delete",
      }),
    );
    expect(deps.delete).toHaveBeenCalledWith(ITEM.path);
  });

  test("a declined Delete deletes nothing", async () => {
    const { deps } = makeDeps([ITEM], { confirm: vi.fn(async () => false) });
    const el = await mount(deps);
    $(el, ".cp-delete")!.click();
    await tick();
    expect(deps.delete).not.toHaveBeenCalled();
  });

  test("Show in Finder reveals the folder", async () => {
    const { deps } = makeDeps([ITEM]);
    const el = await mount(deps);
    $(el, ".cp-reveal")!.click();
    expect(deps.reveal).toHaveBeenCalledWith(ITEM.path);
  });

  test("Run cleanup runs it now and shows what it kept", async () => {
    const { deps } = makeDeps([], { run: vi.fn(async () => [ITEM]) });
    const el = await mount(deps);
    $(el, ".cp-run")!.click();
    await tick();
    await el.updateComplete;
    expect(deps.run).toHaveBeenCalled();
    expect($$(el, ".cp-item")).toHaveLength(1);
  });

  test("follows changes to the list", async () => {
    let items: Item[] = [ITEM];
    const { deps, fireChanged } = makeDeps([], { list: vi.fn(async () => items) });
    const el = await mount(deps);
    expect($$(el, ".cp-item")).toHaveLength(1);
    items = [];
    fireChanged();
    await tick();
    await el.updateComplete;
    expect($$(el, ".cp-item")).toHaveLength(0);
  });
});
