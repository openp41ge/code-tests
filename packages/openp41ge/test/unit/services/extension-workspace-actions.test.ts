/**
 * Unit tests for the platform's workspace actions behind `host.workspace`
 * (`addRepository` / `addWorktree`): git work through the injected git API,
 * recording + saving the change in the open workspace, and never throwing.
 */
import { describe, it, expect, vi } from "vitest";
import {
  createWorkspaceActions,
  type WorkspaceActionsGit,
  type WorkspaceActionsStore,
} from "@openp41ge/renderer/services/extension-workspace-actions";

type CloneResult = {
  success: boolean;
  path?: string;
  error?: string;
  transcript?: { command: string; output: string };
};

/** A controllable clone session. */
function fakeClone() {
  let settle!: (r: CloneResult) => void;
  let fail!: (e: unknown) => void;
  const promise = new Promise<CloneResult>((res, rej) => {
    settle = res;
    fail = rej;
  });
  const progress = new Set<(p: { percent: number; message: string }) => void>();
  const session = {
    promise,
    onProgress: vi.fn((fn: (p: { percent: number; message: string }) => void) => {
      progress.add(fn);
      return () => progress.delete(fn);
    }),
    destroy: vi.fn(),
  };
  return {
    session,
    settle,
    fail,
    emit: (percent: number, message = "") => progress.forEach((fn) => fn({ percent, message })),
  };
}

function setup(gitOverrides: Partial<WorkspaceActionsGit> = {}) {
  const clone = fakeClone();
  const git: WorkspaceActionsGit = {
    clone: vi.fn(() => clone.session),
    fetch: vi.fn(async () => undefined),
    removeWorktree: vi.fn(async () => ({ ok: true })),
    repositoryState: vi.fn(async (repoName: string) => ({ repoName, branches: [] })),
    deleteRepository: vi.fn(async () => ({ ok: true })),
    onWorkspaceFileChanged: vi.fn(() => () => undefined),
    checkoutWorktree: vi.fn(async (_repo: string, branch: string) => ({
      branch,
      path: `/repos/app/${branch}`,
      exists: true,
    })),
    ...gitOverrides,
  };
  const store: WorkspaceActionsStore = {
    addRepo: vi.fn(() => true),
    addWorktree: vi.fn(() => true),
    hasWorktree: vi.fn(() => false),
    removeRepo: vi.fn(() => true),
    removeWorktree: vi.fn(() => true),
    refreshed: vi.fn(),
    save: vi.fn(async () => undefined),
  };
  const confirm = vi.fn(async () => true);
  const openWindow = vi.fn();
  return {
    clone,
    git,
    store,
    confirm,
    openWindow,
    actions: createWorkspaceActions(() => git, store, confirm, openWindow),
  };
}

describe("openWindow", () => {
  it("opens (or focuses) the workspace file's window", () => {
    const { actions, openWindow } = setup();
    actions.openWindow("/ws/a.openp41ge-workspace");
    expect(openWindow).toHaveBeenCalledWith("/ws/a.openp41ge-workspace");
  });
});

describe("addRepository", () => {
  it("clones, records the repo in the open workspace, saves, and reports its name", async () => {
    const { clone, git, store, actions } = setup();
    const addition = actions.addRepository("git@github.com:acme/app.git");
    clone.settle({ success: true, path: "/repos/app" });
    await expect(addition.done).resolves.toEqual({ ok: true, repoName: "github.com/acme/app" });
    expect(git.clone).toHaveBeenCalledWith("git@github.com:acme/app.git");
    expect(store.addRepo).toHaveBeenCalledWith("git@github.com:acme/app.git");
    expect(store.save).toHaveBeenCalled();
  });

  it("forwards clone progress until unsubscribed", async () => {
    const { clone, actions } = setup();
    const addition = actions.addRepository("https://example.com/app.git");
    const seen: number[] = [];
    const off = addition.onProgress((p) => seen.push(p.percent));
    clone.emit(10);
    off();
    clone.emit(50);
    expect(seen).toEqual([10]);
  });

  it("reports a failed clone without recording it", async () => {
    const { clone, store, actions } = setup();
    const addition = actions.addRepository("https://example.com/app.git");
    clone.settle({ success: false, error: "auth failed" });
    await expect(addition.done).resolves.toEqual({ ok: false, error: "auth failed" });
    expect(store.addRepo).not.toHaveBeenCalled();
  });

  it("passes git's transcript on with a failed clone", async () => {
    const { clone, actions } = setup();
    const addition = actions.addRepository("https://example.com/app.git");
    const transcript = { command: "git clone --bare --progress x", output: "fatal: nope\n" };
    clone.settle({ success: false, error: "fatal: nope", transcript } as never);
    await expect(addition.done).resolves.toEqual({ ok: false, error: "fatal: nope", transcript });
  });

  it("reports a rejected clone as a failure instead of throwing", async () => {
    const { clone, actions } = setup();
    const addition = actions.addRepository("https://example.com/app.git");
    clone.fail(new Error("boom"));
    await expect(addition.done).resolves.toEqual({ ok: false, error: "boom" });
  });

  it("cancel destroys the clone and settles as cancelled", async () => {
    const { clone, store, actions } = setup();
    const addition = actions.addRepository("https://example.com/app.git");
    addition.cancel();
    await expect(addition.done).resolves.toEqual({ ok: false, error: "cancelled" });
    expect(clone.session.destroy).toHaveBeenCalled();
    clone.settle({ success: true });
    await Promise.resolve();
    expect(store.addRepo).not.toHaveBeenCalled();
  });

  it("rejects an empty url without cloning", async () => {
    const { git, actions } = setup();
    const addition = actions.addRepository("  ");
    await expect(addition.done).resolves.toMatchObject({ ok: false });
    expect(git.clone).not.toHaveBeenCalled();
  });

  it("rejects a URL that is not a full clone URL without cloning", async () => {
    const { git, actions } = setup();
    for (const url of ["github.com/acme/app", "acme/app", "http://github.com/acme/app"]) {
      await expect(actions.addRepository(url).done).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining("full clone URL"),
      });
    }
    expect(git.clone).not.toHaveBeenCalled();
  });

  it("fails cleanly when the git API is unavailable", async () => {
    const store: WorkspaceActionsStore = {
      addRepo: vi.fn(),
      addWorktree: vi.fn(),
      hasWorktree: vi.fn(() => false),
      removeRepo: vi.fn(),
      removeWorktree: vi.fn(),
      refreshed: vi.fn(),
      save: vi.fn(),
    };
    const actions = createWorkspaceActions(
      () => undefined,
      store,
      async () => true,
      vi.fn(),
    );
    await expect(actions.addRepository("https://example.com/app.git").done).resolves.toMatchObject({
      ok: false,
    });
    await expect(actions.addWorktree("app", "main")).resolves.toMatchObject({ ok: false });
  });
});

describe("cloneRepository", () => {
  it("clones into the repos directory without recording it in the open workspace", async () => {
    const { clone, git, store, actions } = setup();
    const cloning = actions.cloneRepository("git@github.com:acme/app.git");
    clone.settle({ success: true, path: "/repos/app" });
    await expect(cloning.done).resolves.toEqual({ ok: true, repoName: "github.com/acme/app" });
    expect(git.clone).toHaveBeenCalledWith("git@github.com:acme/app.git");
    expect(store.addRepo).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("clones for the workspace file it names", async () => {
    const { clone, git, actions } = setup();
    const cloning = actions.cloneRepository("git@github.com:acme/app.git", "/ws/b.json");
    clone.settle({ success: true, path: "/repos/app" });
    await cloning.done;
    expect(git.clone).toHaveBeenCalledWith("git@github.com:acme/app.git", "/ws/b.json");
  });

  it("rejects a URL that is not a full clone URL without cloning", async () => {
    const { git, actions } = setup();
    await expect(actions.cloneRepository("acme/app").done).resolves.toMatchObject({ ok: false });
    expect(git.clone).not.toHaveBeenCalled();
  });

  it("reports a failed clone and supports cancel", async () => {
    const { clone, actions } = setup();
    const failing = actions.cloneRepository("https://example.com/app.git");
    clone.settle({ success: false, error: "auth failed" });
    await expect(failing.done).resolves.toEqual({ ok: false, error: "auth failed" });
  });
});

describe("addWorktree", () => {
  it("checks out the worktree, records it, saves, and returns its path", async () => {
    const { git, store, actions } = setup();
    await expect(actions.addWorktree("app", "feature")).resolves.toEqual({
      ok: true,
      path: "/repos/app/feature",
    });
    expect(git.checkoutWorktree).toHaveBeenCalledWith("app", "feature");
    expect(store.addWorktree).toHaveBeenCalledWith("app", "feature");
    expect(store.save).toHaveBeenCalled();
  });

  it("refuses a worktree already in the workspace, without checking out", async () => {
    const { git, store, actions } = setup();
    (store.hasWorktree as ReturnType<typeof vi.fn>).mockReturnValue(true);
    await expect(actions.addWorktree("app", "main")).resolves.toEqual({
      ok: false,
      error: "main is already a worktree of app",
    });
    expect(store.hasWorktree).toHaveBeenCalledWith("app", "main");
    expect(git.checkoutWorktree).not.toHaveBeenCalled();
  });

  it("reports a checkout that produced no worktree", async () => {
    const { store, actions } = setup({
      checkoutWorktree: vi.fn(async () => ({ branch: "x", path: "", exists: false })),
    });
    await expect(actions.addWorktree("app", "x")).resolves.toMatchObject({ ok: false });
    expect(store.addWorktree).not.toHaveBeenCalled();
  });

  it("reports a failed checkout instead of throwing", async () => {
    const { actions } = setup({
      checkoutWorktree: vi.fn(async () => {
        throw new Error("no such repo");
      }),
    });
    await expect(actions.addWorktree("app", "x")).resolves.toEqual({
      ok: false,
      error: "no such repo",
    });
  });

  it("rejects an empty repo name or branch without checking out", async () => {
    const { git, actions } = setup();
    await expect(actions.addWorktree("app", " ")).resolves.toMatchObject({ ok: false });
    await expect(actions.addWorktree("", "main")).resolves.toMatchObject({ ok: false });
    expect(git.checkoutWorktree).not.toHaveBeenCalled();
  });
});

describe("fetchRepository", () => {
  it("fetches from the remote, then refreshes every surface's repo list", async () => {
    const { git, store, actions } = setup();
    await expect(actions.fetchRepository("app")).resolves.toEqual({ ok: true });
    expect(git.fetch).toHaveBeenCalledWith("app");
    expect(store.refreshed).toHaveBeenCalled();
  });

  it("reports a failed fetch, and still re-reads the list", async () => {
    const { store, actions } = setup({
      fetch: vi.fn(async () => {
        throw new Error("fatal: could not read from remote");
      }),
    });
    await expect(actions.fetchRepository("app")).resolves.toEqual({
      ok: false,
      error: "fatal: could not read from remote",
    });
    expect(store.refreshed).toHaveBeenCalled();
  });
});

describe("deleteRepository", () => {
  const app = "github.com/acme/app";
  const branch = (b: string, over: object = {}) => ({
    branch: b,
    worktree: true,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    unpushed: 0,
    ...over,
  });

  it("asks with the repo's state, deletes the clone, then takes it out of the open workspace", async () => {
    const { confirm, git, store, actions } = setup({
      repositoryState: vi.fn(async (repoName: string) => ({
        repoName,
        branches: [
          branch("master", { unstaged: 2, untracked: 1 }),
          branch("test", { unpushed: 3 }),
          branch("old", { worktree: false, unpushed: 1 }),
          branch("clean"),
        ],
      })),
    });
    await expect(actions.deleteRepository(app)).resolves.toEqual({ ok: true });
    expect(confirm).toHaveBeenCalledWith({
      title: "Delete repository",
      message: `Delete ${app}?`,
      detail:
        "Its clone and 3 worktrees are deleted from disk.\n\n" +
        "Not saved anywhere else:\n" +
        "• master: 2 changed, 1 untracked\n" +
        "• test: 3 commits not pushed\n" +
        "• old (no worktree): 1 commit not pushed",
      confirmLabel: "Delete",
    });
    expect(git.deleteRepository).toHaveBeenCalledWith(app, undefined);
    expect(store.removeRepo).toHaveBeenCalledWith(app);
    expect(store.save).toHaveBeenCalled();
  });

  it("says when nothing would be lost", async () => {
    const { confirm, actions } = setup({
      repositoryState: vi.fn(async (repoName: string) => ({
        repoName,
        branches: [branch("main")],
      })),
    });
    await actions.deleteRepository(app);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        detail:
          "Its clone and 1 worktree are deleted from disk. Nothing in it is uncommitted or unpushed.",
      }),
    );
  });

  it("warns when the state cannot be read", async () => {
    const { confirm, actions } = setup({
      repositoryState: vi.fn(async (repoName: string) => ({
        repoName,
        branches: [],
        error: "fatal: bad object",
      })),
    });
    await actions.deleteRepository(app);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        detail:
          "Its clone and its worktrees are deleted from disk.\n\n" +
          "Its state could not be read (fatal: bad object): uncommitted or unpushed work may be lost.",
      }),
    );
  });

  it("for a named workspace file, reads and deletes there and leaves the open workspace alone", async () => {
    const { git, store, actions } = setup();
    await expect(actions.deleteRepository(app, "/ws/b.openp41ge-workspace")).resolves.toEqual({
      ok: true,
    });
    expect(git.repositoryState).toHaveBeenCalledWith(app, "/ws/b.openp41ge-workspace");
    expect(git.deleteRepository).toHaveBeenCalledWith(app, "/ws/b.openp41ge-workspace");
    expect(store.removeRepo).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("does nothing when the user declines", async () => {
    const { confirm, git, store, actions } = setup();
    confirm.mockResolvedValueOnce(false);
    await expect(actions.deleteRepository(app)).resolves.toEqual({ ok: false, cancelled: true });
    expect(git.deleteRepository).not.toHaveBeenCalled();
    expect(store.removeRepo).not.toHaveBeenCalled();
  });

  it("keeps the repo in the workspace when the delete fails", async () => {
    const { store, actions } = setup({
      deleteRepository: vi.fn(async () => ({ ok: false, error: 'also used by workspace "B"' })),
    });
    await expect(actions.deleteRepository(app)).resolves.toEqual({
      ok: false,
      error: 'also used by workspace "B"',
    });
    expect(store.removeRepo).not.toHaveBeenCalled();
  });
});

describe("deleteWorktree", () => {
  it("deletes a worktree's folder with git, then takes it out of the workspace", async () => {
    const { confirm, git, store, actions } = setup();
    await expect(actions.deleteWorktree("github.com/acme/app", "dev")).resolves.toEqual({
      ok: true,
    });
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Delete worktree dev?", confirmLabel: "Delete" }),
    );
    expect(git.removeWorktree).toHaveBeenCalledWith("github.com/acme/app", "dev");
    expect(store.removeWorktree).toHaveBeenCalledWith("github.com/acme/app", "dev");
    expect(store.save).toHaveBeenCalled();
  });

  it("keeps a worktree git refuses to delete (uncommitted changes)", async () => {
    const { git, store, actions } = setup();
    (git.removeWorktree as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      error: "fatal: '…/dev' contains modified or untracked files, use --force to delete it",
    });
    await expect(actions.deleteWorktree("github.com/acme/app", "dev")).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("modified or untracked"),
    });
    expect(store.removeWorktree).not.toHaveBeenCalled();
  });

  it("does not delete a worktree when the user declines", async () => {
    const { confirm, git, actions } = setup();
    confirm.mockResolvedValueOnce(false);
    await expect(actions.deleteWorktree("github.com/acme/app", "dev")).resolves.toEqual({
      ok: false,
      cancelled: true,
    });
    expect(git.removeWorktree).not.toHaveBeenCalled();
  });
});

describe("repositoryState", () => {
  it("asks the platform for the repository's state", async () => {
    const { git, actions } = setup();
    await expect(actions.repositoryState("app")).resolves.toEqual({
      repoName: "app",
      branches: [],
    });
    expect(git.repositoryState).toHaveBeenCalledWith("app");
  });

  it("never rejects: a failure is the state's error", async () => {
    const { actions } = setup({
      repositoryState: vi.fn(async () => {
        throw new Error("ipc gone");
      }),
    });
    await expect(actions.repositoryState("app")).resolves.toEqual({
      repoName: "app",
      branches: [],
      error: "ipc gone",
    });
  });
});

describe("onWorkspaceFileChanged", () => {
  it("relays the platform's workspace file changes, and unsubscribes", () => {
    const listeners = new Set<(c: { path: string }) => void>();
    const { actions } = setup({
      onWorkspaceFileChanged: vi.fn((fn: (c: { path: string }) => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      }),
    });
    const seen: unknown[] = [];
    const off = actions.onWorkspaceFileChanged((c) => seen.push(c));
    listeners.forEach((fn) => fn({ path: "/ws/a.openp41ge-workspace" }));
    expect(seen).toEqual([{ path: "/ws/a.openp41ge-workspace" }]);
    off();
    expect(listeners.size).toBe(0);
  });

  it("is inert without the platform's git API", () => {
    const actions = createWorkspaceActions(
      () => undefined,
      {} as WorkspaceActionsStore,
      vi.fn(async () => true),
      vi.fn(),
    );
    expect(() => actions.onWorkspaceFileChanged(() => undefined)()).not.toThrow();
  });
});
