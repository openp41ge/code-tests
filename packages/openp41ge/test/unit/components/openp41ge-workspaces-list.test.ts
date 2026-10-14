/**
 * <openp41ge-workspaces-list>, the Workspaces sidebar tab: the workspaces as
 * rows (name, repo and worktree counts), with search, a new-workspace row and
 * a delete mode. A click opens a workspace's editor, a double-click pins it.
 * With a drag source id its rows are platform drag sources
 * (`openp41ge/workspace-config` from `data-workspace-path` / `-name`).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  Openp41geWorkspacesList,
  matchesWorkspaceQuery,
  type WorkspaceListEntry,
  type WorkspacesListDeps,
} from "@openp41ge/renderer/components/openp41ge-workspaces-list";

const flush = () => new Promise((r) => setTimeout(r, 0));

const W = (
  filePath: string,
  name: string,
  repos: Array<{ url: string; worktrees: string[] }> = [],
): WorkspaceListEntry => ({ filePath, data: { name, repos } as never });

const ALPHA = W("/w/a", "Alpha", [{ url: "https://github.com/acme/app", worktrees: ["main", "feat-x"] }]);
const BETA = W("/w/b", "Beta", [{ url: "https://x/z", worktrees: [] }]);

function fakeDeps(initial: WorkspaceListEntry[]) {
  let list = [...initial];
  const changed: Array<() => void> = [];
  const deps: WorkspacesListDeps & { create: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> } = {
    list: async () => list,
    create: vi.fn(async (name: string) => {
      list = [...list, W(`/w/${name}`, name)];
    }),
    delete: vi.fn(async (path: string) => {
      list = list.filter((w) => w.filePath !== path);
    }),
    onChanged: (fn) => {
      changed.push(fn);
      return () => undefined;
    },
  };
  return { deps, fireChanged: () => changed.forEach((fn) => fn()) };
}

async function mount(
  workspaces: WorkspaceListEntry[] = [ALPHA, BETA],
  setup: (el: Openp41geWorkspacesList) => void = () => undefined,
) {
  const el = new Openp41geWorkspacesList();
  const fake = fakeDeps(workspaces);
  el.deps = fake.deps;
  const onOpen = vi.fn();
  el.onOpen = onOpen;
  setup(el);
  document.body.appendChild(el);
  await flush();
  await el.updateComplete;
  return { el, onOpen, ...fake };
}

const rows = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>("li.ws-row:not(.ws-row--new)")];
const names = (el: HTMLElement) => rows(el).map((r) => r.querySelector(".ws-name")?.textContent);
const button = (el: HTMLElement, label: string) =>
  el.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;

afterEach(() => {
  document.body.innerHTML = "";
  document.head.querySelectorAll("style[data-openp41ge-workspaces-list]").forEach((s) => s.remove());
});

describe("openp41ge-workspaces-list", () => {
  it("lists each workspace with its repo and worktree counts", async () => {
    const { el } = await mount();
    expect(names(el)).toEqual(["Alpha", "Beta"]);
    expect(rows(el)[0].querySelector(".ws-meta")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "1 repo · 2 worktrees",
    );
    expect(rows(el)[0].dataset.workspacePath).toBe("/w/a");
    expect(rows(el)[0].dataset.workspaceName).toBe("Alpha");
  });

  it("says when there are no workspaces", async () => {
    const { el } = await mount([]);
    expect(el.querySelector(".empty")?.textContent).toContain("No workspaces yet.");
  });

  it("a click opens the workspace's editor, a double-click pins it", async () => {
    const { el, onOpen } = await mount();
    rows(el)[1].click();
    rows(el)[1].dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(onOpen.mock.calls).toEqual([
      [BETA, false],
      [BETA, true],
    ]);
  });

  it("does not open on a click the host swallows (the end of its row drag)", async () => {
    const { el, onOpen } = await mount(undefined, (l) => (l.ignoreClick = () => true));
    rows(el)[0].click();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("reloads when a workspace file changes", async () => {
    const { el, deps, fireChanged } = await mount([ALPHA]);
    await deps.create("Gamma");
    fireChanged();
    await flush();
    await el.updateComplete;
    expect(names(el)).toEqual(["Alpha", "Gamma"]);
  });

  describe("drag", () => {
    it("tags rows as drag sources when given a source id", async () => {
      const { el } = await mount(undefined, (l) => (l.dragSourceId = "workspace-row"));
      expect(rows(el).map((r) => r.dataset.dragSourceId)).toEqual(["workspace-row", "workspace-row"]);
    });

    it("leaves rows untagged without one (the management window drags them itself)", async () => {
      const { el } = await mount();
      expect(rows(el).some((r) => r.hasAttribute("data-drag-source-id"))).toBe(false);
    });

    it("rows do not drag in delete mode", async () => {
      const { el } = await mount(undefined, (l) => (l.dragSourceId = "workspace-row"));
      button(el, "Delete workspaces").click();
      await el.updateComplete;
      expect(el.deleteMode).toBe(true);
      expect(rows(el).some((r) => r.hasAttribute("data-drag-source-id"))).toBe(false);
    });
  });

  describe("delete mode", () => {
    it("rows select instead of opening, and Delete removes the selected ones", async () => {
      const { el, onOpen, deps } = await mount();
      button(el, "Delete workspaces").click();
      await el.updateComplete;
      rows(el)[0].click();
      await el.updateComplete;
      expect(onOpen).not.toHaveBeenCalled();
      expect(rows(el)[0].querySelector(".dw-checkbox--checked")).not.toBeNull();
      el.querySelector<HTMLButtonElement>(".dw-delete-confirm")!.click();
      await flush();
      await el.updateComplete;
      expect(deps.delete).toHaveBeenCalledWith("/w/a");
      expect(names(el)).toEqual(["Beta"]);
      expect(el.deleteMode).toBe(false);
    });

    it("Escape leaves it", async () => {
      const { el } = await mount();
      button(el, "Delete workspaces").click();
      await el.updateComplete;
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await el.updateComplete;
      expect(el.deleteMode).toBe(false);
    });
  });

  it("the + adds a workspace from the name row", async () => {
    const { el, deps } = await mount([ALPHA]);
    button(el, "New workspace").click();
    await el.updateComplete;
    const input = el.querySelector<HTMLInputElement>(".wm-new-ws-input")!;
    input.value = "Gamma";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await flush();
    await el.updateComplete;
    expect(deps.create).toHaveBeenCalledWith("Gamma");
    expect(names(el)).toEqual(["Alpha", "Gamma"]);
  });

  describe("search", () => {
    it("matches a workspace by name, repo URL, and worktree name", () => {
      expect(matchesWorkspaceQuery(ALPHA, "alpha", false, false)).toBe(true);
      expect(matchesWorkspaceQuery(ALPHA, "acme/app", false, false)).toBe(true);
      expect(matchesWorkspaceQuery(ALPHA, "feat-x", false, false)).toBe(true);
      expect(matchesWorkspaceQuery(ALPHA, "nomatch", false, false)).toBe(false);
    });

    it("is case-insensitive by default and case-sensitive when toggled", () => {
      expect(matchesWorkspaceQuery(ALPHA, "ALPHA", false, false)).toBe(true);
      expect(matchesWorkspaceQuery(ALPHA, "alpha", true, false)).toBe(false);
      expect(matchesWorkspaceQuery(ALPHA, "Alpha", true, false)).toBe(true);
    });

    it("supports regex matching and returns false for an invalid regex", () => {
      expect(matchesWorkspaceQuery(ALPHA, "^Al", false, true)).toBe(true);
      expect(matchesWorkspaceQuery(ALPHA, "A.*a$", false, true)).toBe(true);
      expect(matchesWorkspaceQuery(ALPHA, "[", false, true)).toBe(false);
    });

    it("filters the rows as you type; Escape closes it and shows them all", async () => {
      const { el } = await mount();
      button(el, "Search workspaces").click();
      await el.updateComplete;
      const input = el.querySelector<HTMLInputElement>(".wm-search-input")!;
      input.value = "acme";
      input.dispatchEvent(new Event("input"));
      await el.updateComplete;
      expect(names(el)).toEqual(["Alpha"]);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await el.updateComplete;
      expect(el.querySelector(".wm-search-input")).toBeNull();
      expect(names(el)).toEqual(["Alpha", "Beta"]);
    });

    it("says when nothing matches", async () => {
      const { el } = await mount();
      button(el, "Search workspaces").click();
      await el.updateComplete;
      const input = el.querySelector<HTMLInputElement>(".wm-search-input")!;
      input.value = "zzz";
      input.dispatchEvent(new Event("input"));
      await el.updateComplete;
      expect(el.querySelector(".empty")?.textContent).toContain("No workspaces match “zzz”.");
    });
  });

  it("brings its own styles (it renders into its light DOM, wherever it is)", async () => {
    await mount();
    const css = document.head.querySelector("style[data-openp41ge-workspaces-list]")?.textContent;
    expect(css).toMatch(/openp41ge-workspaces-list li\.ws-row\s*\{[^}]*padding: 7px 10px;/);
  });
});
