// @vitest-environment jsdom
/**
 * The Repositories sidebar: the workspace's repos and their worktrees (no
 * files), draggable into the grid and opened on click, with + add repository
 * / + add worktree rows that ask the platform (host.workspace).
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "lit";
import {
  GIT_OUTPUT_APP_TYPE,
  REPOSITORY_DRAG_SOURCE_ID,
  renderRepositories,
  type RepositoriesHost,
  type RepositoriesState,
} from "@openp41ge-extension-git/repositories-view";

const REPOS = [
  {
    name: "github.com/acme/app",
    gitDir: "/repos/github.com/acme/app/.git",
    worktrees: [
      { name: "main", path: "/repos/github.com/acme/app/main" },
      { name: "feat/x", path: "/repos/github.com/acme/app/feat--x" },
    ],
  },
  { name: "github.com/acme/web", worktrees: [] },
];

function mount(
  repos: unknown[] = REPOS,
  initial: RepositoriesState = {},
  repositoryStates: Record<string, unknown> = {},
) {
  const container = document.createElement("div");
  document.body.append(container);
  let state = initial;
  const workspace = {
    cloneRepository: vi.fn(),
    addRepository: vi.fn(() => ({
      done: Promise.resolve({ ok: true, repoName: "github.com/acme/new" }),
      onProgress: () => () => {},
      cancel: () => {},
    })),
    addWorktree: vi.fn(async () => ({ ok: true, path: "/w" })),
    fetchRepository: vi.fn(async () => ({ ok: true })),
    deleteRepository: vi.fn(async () => ({ ok: true })),
    deleteWorktree: vi.fn(async () => ({ ok: true })),
  };
  const host = {
    context: { workspaceRepos: repos, repositoryStates },
    get state() {
      return state;
    },
    setState(update: (prev: RepositoriesState) => RepositoriesState) {
      state = update(state);
      render(renderRepositories(host), container);
    },
    openTab: vi.fn(),
    showContextMenu: vi.fn(),
    workspace,
  } as unknown as RepositoriesHost;
  render(renderRepositories(host), container);
  return { container, host, workspace, state: () => state };
}

/** The platform's sidebar shell, as far as its bottom bar goes. */
class FakeShell extends HTMLElement {
  readonly buttons = new Map<string, { icon?: string; title?: string; onClick?: () => void }>();
  registerBottomBarButton(spec: {
    id: string;
    icon?: string;
    title?: string;
    onClick?: () => void;
  }) {
    this.buttons.set(spec.id, spec);
    return () => this.buttons.delete(spec.id);
  }
}
if (!customElements.get("openp41ge-sidebar-tab-content")) {
  customElements.define("openp41ge-sidebar-tab-content", FakeShell);
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const rows = (c: Element, sel: string) => [...c.querySelectorAll<HTMLElement>(sel)];
const typeInto = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("renderRepositories", () => {
  it("lists repos and their worktrees, without files", () => {
    const { container } = mount();
    expect(rows(container, "[data-row='repo']").map((r) => r.textContent?.trim())).toEqual([
      "github.com/acme/app",
      "github.com/acme/web",
    ]);
    expect(rows(container, "[data-row='worktree']").map((r) => r.textContent?.trim())).toEqual([
      "main",
      "feat/x",
    ]);
  });

  it("shows an empty message when the workspace has no repos", () => {
    const { container } = mount([]);
    expect(container.textContent).toContain("No repositories in this workspace yet.");
    expect(rows(container, "[data-new-entry='repo']")).toHaveLength(1);
  });

  it("makes repo and worktree rows git-repository drag sources", () => {
    const { container } = mount();
    const [repo] = rows(container, "[data-row='repo']");
    const [main] = rows(container, "[data-row='worktree']");
    expect(repo.getAttribute("data-drag-source-id")).toBe(REPOSITORY_DRAG_SOURCE_ID);
    expect(repo.getAttribute("data-repo-name")).toBe("github.com/acme/app");
    expect(repo.hasAttribute("data-branch")).toBe(false);
    expect(main.getAttribute("data-drag-source-id")).toBe(REPOSITORY_DRAG_SOURCE_ID);
    expect(main.getAttribute("data-repo-name")).toBe("github.com/acme/app");
    expect(main.getAttribute("data-branch")).toBe("main");
  });

  it("opens a repo or a worktree on click", () => {
    const { container, host } = mount();
    rows(container, "[data-row='repo']")[0].querySelector<HTMLElement>(".label")!.click();
    rows(container, "[data-row='worktree']")[1].click();
    expect(host.openTab).toHaveBeenNthCalledWith(1, {
      appType: "ext:openp41ge-extension-git:repository",
      params: { repoName: "github.com/acme/app" },
    });
    expect(host.openTab).toHaveBeenNthCalledWith(2, {
      appType: "ext:openp41ge-extension-git:repository",
      params: { repoName: "github.com/acme/app", branch: "feat/x" },
    });
  });

  it("pins a repo or worktree tab on double-click", () => {
    const { container, host } = mount();
    rows(container, "[data-row='worktree']")[0].dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    );
    expect(host.openTab).toHaveBeenCalledWith({
      appType: "ext:openp41ge-extension-git:repository",
      params: { repoName: "github.com/acme/app", branch: "main" },
      pinned: true,
    });
  });

  it("does not outline the add row's input (the row shows the editing state)", () => {
    const { container } = mount();
    rows(container, ".row[data-new-entry='repo']")[0].click();
    const css = container.querySelector("style")!.textContent!;
    expect(css).toMatch(
      /\.add-input:focus-visible\s*\{\s*outline: none !important;\s*box-shadow: none;/,
    );
  });

  it("collapses and expands a repo with its chevron", () => {
    const { container, host } = mount();
    rows(container, "[data-row='repo']")[0].querySelector<HTMLElement>(".chevron")!.click();
    expect(rows(container, "[data-row='worktree']")).toHaveLength(0);
    expect(host.openTab).not.toHaveBeenCalled();
    rows(container, "[data-row='repo']")[0].querySelector<HTMLElement>(".chevron")!.click();
    expect(rows(container, "[data-row='worktree']")).toHaveLength(2);
  });

  it("collapses every repo from the bottom bar's Collapse all button", () => {
    const { container, state } = mount();
    const shell = container.querySelector("openp41ge-sidebar-tab-content") as FakeShell;
    const button = shell.buttons.get("collapse-all");
    expect(button).toMatchObject({ icon: "collapse", title: "Collapse all" });
    button!.onClick!();
    expect(state().collapsed).toEqual(["github.com/acme/app", "github.com/acme/web"]);
    expect(rows(container, "[data-row='worktree']")).toEqual([]);
  });

  it("adds a repository through the platform", async () => {
    const { container, workspace, state } = mount();
    rows(container, ".row[data-new-entry='repo']")[0].click();
    const input = container.querySelector<HTMLInputElement>("input[data-new-entry='repo']")!;
    typeInto(input, " git@github.com:acme/new.git ");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(workspace.addRepository).toHaveBeenCalledWith("git@github.com:acme/new.git");
    await flush();
    // The new repo arrives through context.workspaceRepos; the row closes.
    expect(state().editing).toBeNull();
    expect(state().error).toBeNull();
  });

  it("rejects a URL that is not a full clone URL without asking the platform", () => {
    const { container, workspace } = mount();
    rows(container, ".row[data-new-entry='repo']")[0].click();
    const input = container.querySelector<HTMLInputElement>("input[data-new-entry='repo']")!;
    typeInto(input, "git@github.com/acme/new.git");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(workspace.addRepository).not.toHaveBeenCalled();
    const row = container.querySelector<HTMLElement>(".row[data-new-entry='repo']")!;
    expect(row.classList.contains("row--error")).toBe(true);
    expect(row.querySelector("[data-error]")?.getAttribute("title")).toContain(
      "git@github.com:acme/new.git",
    );
  });

  it("shows the platform's error when adding fails, keeping what was typed", async () => {
    const { container, workspace } = mount();
    workspace.addWorktree.mockResolvedValueOnce({ ok: false, error: "no such branch" } as never);
    rows(container, ".row[data-new-entry='worktree']")[0].click();
    const input = container.querySelector<HTMLInputElement>("input[data-new-entry='worktree']")!;
    typeInto(input, "nope");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(workspace.addWorktree).toHaveBeenCalledWith("github.com/acme/app", "nope");
    await flush();
    const row = container.querySelector<HTMLElement>(".row[data-new-entry='worktree']")!;
    expect(row.classList.contains("row--error")).toBe(true);
    expect(row.querySelector("[data-error]")?.getAttribute("title")).toBe("no such branch");
    expect(
      container.querySelector<HTMLInputElement>("input[data-new-entry='worktree']")?.value,
    ).toBe("nope");
  });

  it("opens git's output in a tab from the error icon of a failed clone", async () => {
    const { container, host, workspace } = mount();
    const transcript = {
      command: "git clone --bare --progress git@github.com:acme/x.git",
      output: "fatal: denied\n",
    };
    workspace.addRepository.mockReturnValueOnce({
      done: Promise.resolve({ ok: false, error: "fatal: denied", transcript }),
      onProgress: () => () => {},
      cancel: () => {},
    } as never);
    rows(container, ".row[data-new-entry='repo']")[0].click();
    const input = container.querySelector<HTMLInputElement>("input[data-new-entry='repo']")!;
    typeInto(input, "git@github.com:acme/x.git");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
    container.querySelector<HTMLElement>("[data-error]")!.click();
    expect(host.openTab).toHaveBeenCalledWith({
      appType: GIT_OUTPUT_APP_TYPE,
      params: { title: "Clone failed", message: "fatal: denied", ...transcript },
      pinned: true,
    });
  });

  describe("adds in progress", () => {
    /** A clone that settles when `finish` is called. */
    function slowClone() {
      let finish!: (r: { ok: boolean; error?: string }) => void;
      let progress!: (p: { percent: number }) => void;
      const addition = {
        done: new Promise((r) => (finish = r)),
        onProgress: (fn: (p: { percent: number }) => void) => {
          progress = fn;
          return () => {};
        },
        cancel: () => {},
      };
      return {
        addition,
        finish: (r: { ok: boolean; error?: string }) => finish(r),
        progress: (n: number) => progress({ percent: n }),
      };
    }
    const addRepo = (container: HTMLElement, url: string) => {
      container.querySelector<HTMLElement>(".row.add-row[data-new-entry='repo']")!.click();
      const input = container.querySelector<HTMLInputElement>("input[data-new-entry='repo']")!;
      typeInto(input, url);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    };
    const adding = (c: Element) => rows(c, ".row.adding");

    it("shows each clone as its own row and keeps + add repository free for another", async () => {
      const { container, workspace } = mount();
      const a = slowClone();
      const b = slowClone();
      workspace.addRepository
        .mockReturnValueOnce(a.addition as never)
        .mockReturnValueOnce(b.addition as never);
      addRepo(container, "git@github.com:acme/one.git");
      expect(
        adding(container).map((r) => [
          r.querySelector(".label")?.textContent,
          r.querySelector(".busy")?.textContent,
        ]),
      ).toEqual([["git@github.com:acme/one.git", "Cloning…"]]);
      a.progress(30);
      expect(adding(container)[0].textContent).toContain("Cloning 30%");
      addRepo(container, "git@github.com:acme/two.git");
      expect(workspace.addRepository).toHaveBeenCalledTimes(2);
      expect(adding(container)).toHaveLength(2);
      expect(container.querySelector(".row.add-row[data-new-entry='repo']")).not.toBeNull();
      a.finish({ ok: true });
      await flush();
      expect(adding(container).map((r) => r.textContent)).toEqual([
        expect.stringContaining("two.git"),
      ]);
      b.finish({ ok: true });
      await flush();
      expect(adding(container)).toEqual([]);
    });

    it("keeps a failed clone as its own row while another is being typed", async () => {
      const { container, workspace, state } = mount();
      const a = slowClone();
      workspace.addRepository.mockReturnValueOnce(a.addition as never);
      addRepo(container, "git@github.com:acme/one.git");
      container.querySelector<HTMLElement>(".row.add-row[data-new-entry='repo']")!.click();
      typeInto(
        container.querySelector<HTMLInputElement>("input[data-new-entry='repo']")!,
        "git@github.com:acme/half",
      );
      a.finish({ ok: false, error: "fatal: denied" });
      await flush();
      expect(state().value).toBe("git@github.com:acme/half");
      const [failed] = adding(container);
      expect(failed.classList.contains("row--error")).toBe(true);
      expect(failed.getAttribute("title")).toBe("fatal: denied");
      expect(failed.querySelector("[data-error]")).not.toBeNull();
    });

    it("lets a worktree be added while a clone runs", () => {
      const { container, workspace } = mount();
      workspace.addRepository.mockReturnValueOnce(slowClone().addition as never);
      addRepo(container, "git@github.com:acme/one.git");
      rows(container, ".row.add-row[data-new-entry='worktree']")[0].click();
      const input = container.querySelector<HTMLInputElement>("input[data-new-entry='worktree']")!;
      expect(input.disabled).toBe(false);
      typeInto(input, "feat/y");
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      expect(workspace.addWorktree).toHaveBeenCalledWith("github.com/acme/app", "feat/y");
    });
  });

  it("offers + add worktree under each expanded repo", () => {
    const { container } = mount();
    expect(rows(container, ".row[data-new-entry='worktree']")).toHaveLength(2);
  });

  describe("context menu", () => {
    type Entry = { label?: string; separator?: true; onSelect?: () => void };
    const menuOf = (host: RepositoriesHost) => {
      const calls = (host.showContextMenu as ReturnType<typeof vi.fn>).mock.calls;
      return calls[calls.length - 1][1] as Entry[];
    };
    const rightClick = (el: Element) =>
      el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

    it("offers Fetch and Delete on a repo row", async () => {
      const { container, host, workspace } = mount();
      rightClick(rows(container, "[data-row='repo']")[0]);
      const menu = menuOf(host);
      expect(menu.map((e) => e.label ?? "—")).toEqual(["Fetch", "—", "Delete"]);
      menu[0].onSelect!();
      expect(workspace.fetchRepository).toHaveBeenCalledWith("github.com/acme/app");
      menu[2].onSelect!();
      expect(workspace.deleteRepository).toHaveBeenCalledWith("github.com/acme/app");
    });

    it("deletes a worktree (its folder) from a worktree row", () => {
      const { container, host, workspace } = mount();
      rightClick(rows(container, "[data-row='worktree']")[1]);
      const menu = menuOf(host);
      expect(menu.map((e) => e.label ?? "—")).toEqual(["Fetch", "—", "Delete"]);
      menu[2].onSelect!();
      expect(workspace.deleteWorktree).toHaveBeenCalledWith("github.com/acme/app", "feat/x");
      menu[0].onSelect!();
      expect(workspace.fetchRepository).toHaveBeenCalledWith("github.com/acme/app");
    });

    it("shows fetching… then fetched beside the row's name, cleared after a while", async () => {
      vi.useFakeTimers();
      try {
        const { container, host, workspace } = mount();
        let finish!: (r: { ok: boolean }) => void;
        workspace.fetchRepository.mockReturnValueOnce(new Promise((r) => (finish = r)) as never);
        rightClick(rows(container, "[data-row='worktree']")[1]);
        menuOf(host)[0].onSelect!();
        const status = () =>
          rows(container, "[data-row='worktree']")[1].querySelector(".row-status")?.textContent;
        expect(status()).toBe("fetching…");
        // Only the row the fetch was started from.
        expect(rows(container, "[data-row='repo']")[0].querySelector(".row-status")).toBeNull();
        finish({ ok: true });
        await vi.advanceTimersByTimeAsync(0);
        expect(status()).toBe("fetched");
        await vi.advanceTimersByTimeAsync(3000);
        expect(status()).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it("drops the status when the fetch fails (the row turns red instead)", async () => {
      const { container, host, workspace } = mount();
      workspace.fetchRepository.mockResolvedValueOnce({ ok: false, error: "offline" } as never);
      rightClick(rows(container, "[data-row='repo']")[0]);
      menuOf(host)[0].onSelect!();
      await flush();
      const repo = rows(container, "[data-row='repo']")[0];
      expect(repo.querySelector(".row-status")).toBeNull();
      expect(repo.classList.contains("row--error")).toBe(true);
    });

    it("marks the row red when a fetch fails, but not when a deletion is declined", async () => {
      const { container, host, workspace } = mount();
      workspace.fetchRepository.mockResolvedValueOnce({
        ok: false,
        error: "fatal: offline",
      } as never);
      workspace.deleteWorktree.mockResolvedValueOnce({ ok: false, cancelled: true } as never);
      rightClick(rows(container, "[data-row='repo']")[0]);
      menuOf(host)[0].onSelect!();
      rightClick(rows(container, "[data-row='worktree']")[0]);
      menuOf(host)[2].onSelect!();
      await flush();
      const repo = rows(container, "[data-row='repo']")[0];
      expect(repo.classList.contains("row--error")).toBe(true);
      expect(repo.querySelector("[data-error]")?.getAttribute("title")).toBe("fatal: offline");
      expect(rows(container, "[data-row='worktree']")[0].classList.contains("row--error")).toBe(
        false,
      );
    });
  });

  describe("state dots", () => {
    const branch = (name: string, over: Record<string, unknown> = {}) => ({
      branch: name,
      worktree: true,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      unpushed: 0,
      ...over,
    });
    const STATES = {
      "github.com/acme/app": {
        repoName: "github.com/acme/app",
        branches: [
          branch("main", { unstaged: 2, untracked: 1 }),
          branch("feat/x"),
          branch("never-pushed", { worktree: false, unpushed: 3 }),
        ],
      },
      "github.com/acme/web": { repoName: "github.com/acme/web", branches: [branch("main")] },
    };
    const dots = (row: Element) =>
      [...row.querySelectorAll(".dot")].map((d) => d.getAttribute("data-dot"));

    it("marks a worktree with uncommitted changes amber, a clean one not at all", () => {
      const { container } = mount(REPOS, {}, STATES);
      const [main, feat] = rows(container, "[data-row='worktree']");
      expect(dots(main)).toEqual(["uncommitted"]);
      expect(main.querySelector(".dots")?.getAttribute("title")).toBe("2 changed, 1 untracked");
      expect(dots(feat)).toEqual([]);
    });

    it("draws the uncommitted dot a clear orange, not the theme's pale warning colour", () => {
      const { container } = mount(REPOS, {}, STATES);
      const css = [...container.querySelectorAll("style")].map((s) => s.textContent).join("");
      expect(css).toMatch(/\.dot--uncommitted\s*\{\s*background:\s*#e2a03f;/);
    });

    it("sums every branch on the repo row, branches without a worktree too", () => {
      const { container } = mount(REPOS, {}, STATES);
      const [app, web] = rows(container, "[data-row='repo']");
      expect(dots(app)).toEqual(["uncommitted", "unpushed"]);
      expect(app.querySelector(".dots")?.getAttribute("title")).toBe(
        "2 changed, 1 untracked · 3 commits not pushed",
      );
      expect(dots(web)).toEqual([]);
    });

    it("shows no dots before the state arrives", () => {
      const { container } = mount();
      expect(container.querySelectorAll(".dot")).toHaveLength(0);
    });
  });
});
