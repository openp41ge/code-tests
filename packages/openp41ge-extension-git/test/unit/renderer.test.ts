/**
 * The git extension's renderer entry self-registers its Repositories sidebar,
 * its grid tabs, and the drag source for repo / worktree rows.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  beginExtensionScope,
  endExtensionScope,
  getScopedRenderers,
  getScopedDragDecls,
} from "openp41ge-core-extension-host/scope";
import { validateDragDeclSurfaces, type DragDecls, type SurfaceSpec } from "openp41ge-sdk";

let renderers: readonly SurfaceSpec[] | null = null;
let drag: DragDecls | null = null;

beforeAll(async () => {
  beginExtensionScope("openp41ge-extension-git", "0.1.0");
  try {
    await import("@openp41ge-extension-git/renderer");
    renderers = getScopedRenderers();
    drag = getScopedDragDecls();
  } finally {
    endExtensionScope();
  }
});

describe("renderer registration", () => {
  it("registers the Repositories sidebar and the Git output, Repository, Commit and File diff grid tabs, and the Git History Search sidebar", () => {
    expect(renderers).toHaveLength(6);
    expect(renderers![5]).toMatchObject({
      kind: "sidebar",
      id: "history-search",
      title: "Git History Search",
      defaultSide: "right",
    });
    expect(renderers![4]).toMatchObject({ kind: "grid", id: "commit", title: "Commit" });
    expect(renderers![1]).toMatchObject({ kind: "grid", id: "git-output", title: "Git output" });
    expect(renderers![2]).toMatchObject({ kind: "grid", id: "repository", title: "Repository" });
    expect(renderers![3]).toMatchObject({ kind: "grid", id: "file-diff", title: "File diff" });
    const repo = renderers![2] as { tabLabel?: (p: Record<string, unknown>) => unknown };
    expect(repo.tabLabel?.({ repoName: "github.com/a/b", branch: "dev" })).toMatchObject({
      title: "dev",
      description: "github.com/a/b",
    });
    expect(repo.tabLabel?.({ repoName: "github.com/a/b" })).toMatchObject({
      title: "github.com/a/b",
    });
    const diff = renderers![3] as { tabLabel?: (p: Record<string, unknown>) => unknown };
    expect(diff.tabLabel?.({ repoName: "r", path: "src/a.ts", hash: "abcdef123" })).toEqual({
      title: "a.ts",
      description: "abcdef1",
    });
    expect(renderers![0]).toMatchObject({
      kind: "sidebar",
      id: "repositories",
      title: "Repositories",
      defaultSide: "left",
    });
  });

  it("opens dropped repositories and commits, and drags their rows (cross-window)", () => {
    expect(drag?.sources).toEqual([
      {
        id: "repository",
        label: "Repository",
        kind: "openp41ge-extension-git/repository",
        attrs: { repoName: "data-repo-name", branch: "data-branch" },
        contexts: ["workspace"],
        crossWindow: true,
      },
      {
        id: "commit",
        label: "Commit",
        kind: "openp41ge-extension-git/commit",
        attrs: { repoName: "data-repo-name", hash: "data-hash", shortHash: "data-short-hash" },
        contexts: ["workspace"],
        crossWindow: true,
      },
    ]);
    expect(drag?.consumers).toEqual([
      {
        id: "repository",
        accepts: ["openp41ge-extension-git/repository"],
        placement: ["grid"],
        open: { kind: "renderer-surface", surface: "grid:repository" },
      },
      {
        id: "commit",
        accepts: ["openp41ge-extension-git/commit"],
        placement: ["grid"],
        open: { kind: "renderer-surface", surface: "grid:commit" },
      },
    ]);
    expect(drag?.dropTargets).toEqual([]);
    // Repositories and commits are this extension's own payload kinds.
    expect(drag?.kinds.map((k) => [k.name, k.schema.required])).toEqual([
      ["openp41ge-extension-git/repository", ["repoName"]],
      ["openp41ge-extension-git/commit", ["repoName", "hash"]],
    ]);
    const own = renderers!.map((r) => `${r.kind}:${r.id}`);
    expect(() => validateDragDeclSurfaces(drag!, own)).not.toThrow();
  });
});
