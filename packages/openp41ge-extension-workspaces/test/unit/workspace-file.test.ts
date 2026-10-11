import { describe, it, expect } from "vitest";
import {
  migrateWorkspaceFileData,
  serializeWorkspaceFile,
  deserializeWorkspaceFile,
  workspaceDisplayName,
  emptySharedSidebars,
  WORKSPACE_FILE_VERSION,
  findRepoByName,
  mergeWorkspaceEdits,
  type WorkspaceFileData,
} from "@openp41ge-extension-workspaces/workspace-file";

describe("workspace-file model", () => {
  it("fills defaults for a manifest-only (v1) input", () => {
    const data = migrateWorkspaceFileData({ id: "abc" });
    expect(data.id).toBe("abc");
    expect(data.version).toBe(WORKSPACE_FILE_VERSION);
    expect(data.repos).toEqual([]);
    expect(data.dataDir).toBe("");
    expect(data.sharedSidebars).toEqual(emptySharedSidebars());
    expect(typeof data.createdAt).toBe("string");
  });

  it("returns an empty object for garbage input (never throws)", () => {
    const data = migrateWorkspaceFileData(null);
    expect(data.id).toBe("");
    expect(data.repos).toEqual([]);
  });

  it("preserves unknown/future fields on round-trip", () => {
    const raw = {
      id: "ws-1",
      version: 2,
      createdAt: "2024-01-01T00:00:00.000Z",
      dataDir: "/tmp/data",
      repos: [{ url: "git@github.com:openp41ge/x.git", worktrees: ["main"] }],
      futureField: { nested: true },
    };
    const migrated = migrateWorkspaceFileData(raw);
    expect((migrated as Record<string, unknown>).futureField).toEqual({ nested: true });
    // Round-trip through serialize/deserialize keeps the unknown field.
    const text = serializeWorkspaceFile(migrated);
    const parsed: Record<string, unknown> = deserializeWorkspaceFile(text) as Record<string, unknown>;
    expect(parsed.futureField).toEqual({ nested: true });
  });

  it("serializes as pretty-printed JSON with a trailing newline", () => {
    const data = migrateWorkspaceFileData({ id: "ws-1", name: "Demo", repos: [] });
    const text = serializeWorkspaceFile(data);
    expect(text.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(text);
    expect(parsed.name).toBe("Demo");
  });

  it("derives a display name from the file name when `name` is blank", () => {
    const data = migrateWorkspaceFileData({ id: "ws-1", name: "", repos: [] });
    expect(workspaceDisplayName(data, "/a/b/my-ws.openp41ge-workspace")).toBe("my-ws");
    expect(workspaceDisplayName(data, "/a/b/Untitled.openp41ge-workspace")).toBe("Untitled");
  });

  it("prefers the user-set name over the file name", () => {
    const data = migrateWorkspaceFileData({ id: "ws-1", name: "My Workspace", repos: [] });
    expect(workspaceDisplayName(data, "/a/b/other.openp41ge-workspace")).toBe("My Workspace");
  });
});

describe("findRepoByName", () => {
  const repos = [
    { url: "git@github.com:acme/app.git", worktrees: [] },
    { url: "https://github.com/acme/web.git", worktrees: [] },
  ];

  it("finds a repo by name whatever URL form is used", () => {
    expect(findRepoByName(repos, "https://github.com/acme/app")).toBe(0);
    expect(findRepoByName(repos, "git@github.com:acme/web.git")).toBe(1);
  });

  it("returns -1 for a repo not in the list", () => {
    expect(findRepoByName(repos, "git@github.com:acme/other.git")).toBe(-1);
  });

  it("skips the entry being edited", () => {
    expect(findRepoByName(repos, "https://github.com/acme/app", 0)).toBe(-1);
    expect(findRepoByName(repos, "https://github.com/acme/app", 1)).toBe(0);
  });
});

describe("mergeWorkspaceEdits", () => {
  const A = { url: "git@github.com:o/a.git", worktrees: ["main"] };
  const B = { url: "git@github.com:o/b.git", worktrees: [] };
  const C = { url: "git@github.com:o/c.git", worktrees: [] };
  const file = (over: Partial<WorkspaceFileData> = {}): WorkspaceFileData =>
    migrateWorkspaceFileData({
      id: "w",
      name: "W",
      createdAt: "t",
      dataDir: "",
      repos: [A],
      windows: [{ id: "base" }],
      ...over,
    });

  it("takes every field I left alone from disk", () => {
    const base = file();
    const theirs = file({ name: "Theirs", repos: [A, B], windows: [{ id: "theirs" }] });
    expect(mergeWorkspaceEdits(base, base, theirs)).toEqual(theirs);
  });

  it("keeps the fields I edited", () => {
    const base = file();
    const mine = file({ name: "Mine" });
    const theirs = file({ name: "Theirs", dataDir: "/d" });
    const merged = mergeWorkspaceEdits(base, mine, theirs);
    expect(merged.name).toBe("Mine");
    expect(merged.dataDir).toBe("/d");
  });

  it("merges repos by name: their additions and my additions both stay", () => {
    const base = file();
    const mine = file({ repos: [A, C] });
    const theirs = file({ repos: [A, B] });
    expect(mergeWorkspaceEdits(base, mine, theirs).repos).toEqual([A, B, C]);
  });

  it("drops a repo either side removed, unless the other side edited it", () => {
    const base = file({ repos: [A, B] });
    // I removed B; they left it alone → gone. They removed A; I left it → gone.
    expect(mergeWorkspaceEdits(base, file({ repos: [A] }), file({ repos: [B] })).repos).toEqual([]);
    // They removed A, but I edited it (a worktree) → mine stays.
    const editedA = { ...A, worktrees: ["main", "dev"] };
    expect(
      mergeWorkspaceEdits(base, file({ repos: [editedA, B] }), file({ repos: [B] })).repos,
    ).toEqual([B, editedA]);
  });

  it("keeps my edit of a repo over theirs, and takes theirs when I left it alone", () => {
    const base = file({ repos: [A, B] });
    const mineA = { ...A, worktrees: ["mine"] };
    const theirsA = { ...A, worktrees: ["theirs"] };
    const theirsB = { ...B, worktrees: ["theirs"] };
    expect(
      mergeWorkspaceEdits(base, file({ repos: [mineA, B] }), file({ repos: [theirsA, theirsB] }))
        .repos,
    ).toEqual([mineA, theirsB]);
  });

  it("always takes the layout session from disk", () => {
    const base = file();
    const mine = file({ name: "Mine", windows: [{ id: "mine" }] });
    const theirs = file({ windows: [{ id: "theirs" }] });
    expect(mergeWorkspaceEdits(base, mine, theirs).windows).toEqual([{ id: "theirs" }]);
  });
});
