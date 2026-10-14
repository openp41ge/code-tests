import { describe, it, expect, vi } from "vitest";
import {
  startRepoClone,
  undoEditorState,
  saveEditorState,
  removeRepo,
  reloadEditorFromDisk,
  followWorkspaceFile,
} from "@openp41ge-extension-workspaces/workspace-editor";
import type {
  WorkspaceEditorState,
  WorkspaceEditorHost,
} from "@openp41ge-extension-workspaces/workspace-editor";
import type { WorkspaceFileData } from "@openp41ge-extension-workspaces/workspace-file";

/** Minimal host that captures `setState` mutations into a live `state`. */
function fakeHost(
  initial: WorkspaceEditorState,
  dispatch: () => Promise<unknown> = async () => ({}),
): { host: WorkspaceEditorHost; grab: () => WorkspaceEditorState } {
  const box = { current: initial };
  const host = {
    surface: "grid:workspace-editor",
    context: { path: "/w.json", dir: "/w" },
    get state() {
      return box.current;
    },
    setState(update: WorkspaceEditorState | ((prev: WorkspaceEditorState) => WorkspaceEditorState)) {
      box.current =
        typeof update === "function" ? update(box.current) : update;
    },
    dispatch,
    subscribe: () => () => {},
    log: { debug() {}, info() {}, warn() {}, error() {} },
    openTab: () => {},
  } as unknown as WorkspaceEditorHost;
  return { host, grab: () => box.current };
}

function base(over: Partial<WorkspaceEditorState>): WorkspaceEditorState {
  return {
    path: "/w.json",
    dir: "/w",
    data: undefined,
    mode: "ui",
    loading: false,
    saved: true,
    savedData: undefined,
    undoStack: [],
    openRepos: [],
    editingRepo: null,
    editingValue: null,
    editingWorktree: null,
    editingWorktreeValue: null,
    addingRepoValue: "",
    addingWorktreeValue: "",
    ...over,
  } as WorkspaceEditorState;
}

describe("workspace editor undo", () => {
  it("restores snapshots last-in/first-out and tracks dirty state", () => {
    const savedData: WorkspaceFileData = { name: "n", repos: [] };
    const v1: WorkspaceFileData = { name: "n", repos: [{ url: "a", worktrees: [] }] };
    const v2: WorkspaceFileData = { name: "n", repos: [{ url: "a", worktrees: ["main"] }] };

    const { host, grab } = fakeHost(
      base({ data: v2, saved: false, savedData, undoStack: [savedData, v1] }),
    );

    undoEditorState(host);
    expect(grab().data).toEqual(v1);
    expect(grab().saved).toBe(false);

    undoEditorState(host);
    expect(grab().data).toEqual(savedData);
    // Restored snapshot matches the last saved one → clean again.
    expect(grab().saved).toBe(true);

    undoEditorState(host);
    // Empty history: state is untouched.
    expect(grab().data).toEqual(savedData);
    expect(grab().undoStack).toEqual([]);
  });

  it("keeps each host's undo history isolated", () => {
    const a = base({ data: { name: "A", repos: [] } as WorkspaceFileData, undoStack: [] });
    const { host: hostA } = fakeHost(a);
    const { host: hostB } = fakeHost(base({ data: { name: "B", repos: [] } as WorkspaceFileData, saved: true }));

    undoEditorState(hostA);
    // hostB has no history; a no-op elsewhere must not leak.
    expect(hostB.state.data).toEqual({ name: "B", repos: [] });
  });
});

describe("workspace editor save", () => {
  it("records the saved snapshot on a successful write", async () => {
    const data: WorkspaceFileData = { name: "n", dataDir: "/w/wsdata", repos: [{ url: "a", worktrees: ["main"] }] };
    const state = base({ data, saved: false, savedData: undefined });
    const { host, grab } = fakeHost(state, async () => ({ ok: true }));

    await saveEditorState(host);

    expect(grab().saved).toBe(true);
    expect(grab().error).toBeUndefined();
    // The exact current data object is remembered as the saved snapshot.
    expect(grab().savedData).toBe(data);
  });

  it("re-locks the name field on a successful save", async () => {
    const data: WorkspaceFileData = { name: "n", repos: [] };
    const { host, grab } = fakeHost(
      base({ data, saved: false, savedData: data, nameLocked: false }),
      async () => ({ ok: true }),
    );

    await saveEditorState(host);

    expect(grab().saved).toBe(true);
    expect(grab().nameLocked).toBe(true);
  });

  it("keeps the name field unlocked when the save fails", async () => {
    const data: WorkspaceFileData = { name: "n", repos: [] };
    const { host, grab } = fakeHost(
      base({ data, saved: false, savedData: undefined, nameLocked: false }),
      async () => ({ ok: false, error: "nope" }),
    );

    await saveEditorState(host);

    expect(grab().saved).toBe(false);
    expect(grab().nameLocked).toBe(false);
  });

  /** Saved with app + web; the draft dropped app. */
  function droppingHost(write: { ok: boolean; error?: string }, deleted = { ok: true }) {
    const prevSaved: WorkspaceFileData = {
      name: "n",
      repos: [
        { url: "git@github.com:openp41ge/app.git", worktrees: [] },
        { url: "git@github.com:openp41ge/web.git", worktrees: [] },
      ],
    };
    const data: WorkspaceFileData = {
      name: "n",
      repos: [{ url: "https://github.com/openp41ge/web", worktrees: [] }],
    };
    const { host, grab } = fakeHost(base({ data, saved: false, savedData: prevSaved }), async () => write);
    const deleteRepository = vi.fn(async () => deleted);
    (host as unknown as { workspace: unknown }).workspace = { deleteRepository };
    return { host, grab, deleteRepository };
  }

  it("deletes each repo the save dropped, for this workspace file (the platform asks)", async () => {
    const { host, grab, deleteRepository } = droppingHost({ ok: true });
    await saveEditorState(host);
    // web only changed its URL form: same repository, kept.
    expect(deleteRepository).toHaveBeenCalledTimes(1);
    expect(deleteRepository).toHaveBeenCalledWith("github.com/openp41ge/app", "/w.json");
    expect(grab().error).toBeUndefined();
  });

  it("deletes nothing when the write fails", async () => {
    const { host, deleteRepository } = droppingHost({ ok: false, error: "nope" });
    await saveEditorState(host);
    expect(deleteRepository).not.toHaveBeenCalled();
  });

  it("shows a failed delete; a declined one is not an error", async () => {
    const failed = droppingHost({ ok: true }, { ok: false, error: "disk full" } as never);
    await saveEditorState(failed.host);
    expect(failed.grab().saved).toBe(true);
    expect(failed.grab().error).toBe("github.com/openp41ge/app was not deleted: disk full");

    const declined = droppingHost({ ok: true }, { ok: false, cancelled: true } as never);
    await saveEditorState(declined.host);
    expect(declined.grab().error).toBeUndefined();
  });
});

describe("workspace editor clone (platform)", () => {
  function cloningHost(done: Promise<{ ok: boolean; error?: string }>) {
    const { host, grab } = fakeHost(base({}));
    const cloneRepository = vi.fn(() => ({ done, onProgress: () => () => {}, cancel: () => {} }));
    (host as unknown as { workspace: unknown }).workspace = {
      cloneRepository,
      addRepository: vi.fn(),
      addWorktree: vi.fn(),
    };
    return { host, grab, cloneRepository };
  }

  it("clones through the platform and marks the repo cloning, then done", async () => {
    const { host, grab, cloneRepository } = cloningHost(Promise.resolve({ ok: true }));
    startRepoClone(host, "git@github.com:openp41ge/app.git");
    // For the workspace being edited (its file), not the window's workspace.
    expect(cloneRepository).toHaveBeenCalledWith("git@github.com:openp41ge/app.git", "/w.json");
    expect(grab().cloneStates?.["git@github.com:openp41ge/app.git"]).toEqual({ phase: "cloning" });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(grab().cloneStates?.["git@github.com:openp41ge/app.git"]).toEqual({ phase: "done" });
  });

  it("marks the repo failed with the platform's error", async () => {
    const { host, grab } = cloningHost(Promise.resolve({ ok: false, error: "auth failed" }));
    startRepoClone(host, "git@github.com:openp41ge/app.git");
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(grab().cloneStates?.["git@github.com:openp41ge/app.git"]).toEqual({
      phase: "failed",
      error: "auth failed",
    });
  });
});

describe("workspace editor remove repo (confirm)", () => {
  it("does not remove a repo when the confirmation is cancelled", async () => {
    const data: WorkspaceFileData = {
      name: "n",
      repos: [
        { url: "a", worktrees: [] },
        { url: "b", worktrees: ["main"] },
      ],
    };
    const { host, grab } = fakeHost(base({ data, mode: "ui" }));
    const confirm = vi.fn(async () => false);

    const removed = await removeRepo(host, 0, confirm);

    expect(confirm).toHaveBeenCalledWith("a");
    expect(removed).toBe(false);
    expect(grab().data).toEqual(data);
    expect(grab().undoStack).toEqual([]);
  });

  it("removes the repo on confirm without saving and adjusts open/edit indices", async () => {
    const savedData: WorkspaceFileData = { name: "n", repos: [{ url: "a", worktrees: [] }] };
    const data: WorkspaceFileData = {
      name: "n",
      repos: [
        { url: "a", worktrees: [] },
        { url: "b", worktrees: ["main"] },
        { url: "c", worktrees: [] },
      ],
    };
    const { host, grab } = fakeHost(
      base({
        data,
        mode: "ui",
        saved: true,
        savedData,
        undoStack: [],
        openRepos: [0, 1, 2],
        editingRepo: 0,
        editingWorktree: { repo: 2, index: 0 },
        addingWorktree: { repo: 1, value: "feat" },
      }),
    );

    const removed = await removeRepo(host, 1, async () => true);

    expect(removed).toBe(true);
    const s = grab();
    expect(s.data?.repos?.map((r) => r.url)).toEqual(["a", "c"]);
    // Open repos keep their state: 0 untouched, 1 (removed) dropped, 2 → 1.
    expect(s.openRepos).toEqual([0, 1]);
    expect(s.editingRepo).toBe(0);
    expect(s.editingWorktree).toEqual({ repo: 1, index: 0 });
    // The add-worktree input belonged to the removed repo.
    expect(s.addingWorktree).toBeNull();
    // Removed repo is pushed onto the undo stack and the file stays unsaved.
    expect(s.undoStack).toEqual([data]);
    expect(s.saved).toBe(false);
  });

  it("clears open/edit indices when they pointed at the removed repo", async () => {
    const data: WorkspaceFileData = {
      name: "n",
      repos: [
        { url: "a", worktrees: [] },
        { url: "b", worktrees: [] },
      ],
    };
    const { host, grab } = fakeHost(
      base({
        data,
        mode: "ui",
        openRepos: [0],
        editingRepo: 0,
        editingWorktree: { repo: 0, index: 0 },
      }),
    );

    await removeRepo(host, 0, async () => true);

    const s = grab();
    expect(s.data?.repos?.map((r) => r.url)).toEqual(["b"]);
    expect(s.openRepos).toEqual([]);
    expect(s.editingRepo).toBeNull();
    expect(s.editingWorktree).toBeNull();
  });
});

describe("workspace editor follows its file on disk", () => {
  const A = { url: "git@github.com:o/a.git", worktrees: [] };
  const B = { url: "git@github.com:o/b.git", worktrees: [] };
  const C = { url: "git@github.com:o/c.git", worktrees: [] };
  const onDisk = (data: WorkspaceFileData) => async () => ({
    ok: true,
    entry: { filePath: "/w.json", data },
  });

  it("shows the file as it is now when nothing is unsaved", async () => {
    const saved: WorkspaceFileData = { id: "w", name: "W", repos: [A] };
    const disk: WorkspaceFileData = { id: "w", name: "W", repos: [A, B] };
    const { host, grab } = fakeHost(base({ data: saved, savedData: saved }), onDisk(disk));
    await reloadEditorFromDisk(host);
    expect(grab().data?.repos).toEqual([A, B]);
    expect(grab().savedData?.repos).toEqual([A, B]);
    expect(grab().saved).toBe(true);
  });

  it("merges the change into unsaved edits, and its undo history", async () => {
    const saved: WorkspaceFileData = { id: "w", name: "W", repos: [A] };
    const edited: WorkspaceFileData = { id: "w", name: "Mine", repos: [A, C] };
    const disk: WorkspaceFileData = { id: "w", name: "W", repos: [A, B] };
    const { host, grab } = fakeHost(
      base({ data: edited, savedData: saved, saved: false, undoStack: [saved] }),
      onDisk(disk),
    );
    await reloadEditorFromDisk(host);
    expect(grab().data?.name).toBe("Mine");
    expect(grab().data?.repos).toEqual([A, B, C]);
    expect(grab().savedData?.repos).toEqual([A, B]);
    expect(grab().saved).toBe(false);
    // Undoing back past the merge does not drop their repo.
    undoEditorState(host);
    expect(grab().data?.repos).toEqual([A, B]);
    expect(grab().saved).toBe(true);
  });

  it("reloads when its own file changes, not another, and stops on unsubscribe", async () => {
    const listeners = new Set<(c: { path: string }) => void>();
    const dispatch = vi.fn(onDisk({ id: "w", repos: [A, B] }));
    const { host, grab } = fakeHost(
      base({ data: { id: "w", repos: [A] }, savedData: { id: "w", repos: [A] } }),
      dispatch,
    );
    (host as unknown as { workspace: unknown }).workspace = {
      onWorkspaceFileChanged: (fn: (c: { path: string }) => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    };
    const off = followWorkspaceFile(host);
    expect(followWorkspaceFile(host)).toBe(off); // once per editor
    listeners.forEach((fn) => fn({ path: "/other.json" }));
    expect(dispatch).not.toHaveBeenCalled();
    listeners.forEach((fn) => fn({ path: "/w.json" }));
    await vi.waitFor(() => expect(grab().data?.repos).toEqual([A, B]));
    off();
    expect(listeners.size).toBe(0);
  });
});

describe("workspace editor opened from a dropped workspace", () => {
  it("uses the platform's workspaces directory when the tab carries no dir", async () => {
    const dispatch = vi.fn(async () => ({ ok: true }));
    const { host } = fakeHost(
      base({
        dir: undefined,
        data: { name: "n", repos: [] },
        savedData: { name: "old", repos: [] },
        saved: false,
      }),
      dispatch,
    );
    (host as unknown as { context: unknown }).context = {
      path: "/ws/a.openp41ge-workspace",
      name: "a",
      workspacesDir: "/ws",
    };
    await saveEditorState(host);
    expect(dispatch).toHaveBeenCalledWith(
      "write",
      expect.objectContaining({ dir: "/ws", path: "/w.json" }),
    );
  });
});
