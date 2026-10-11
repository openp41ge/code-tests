/**
 * Unit tests for WorkspaceRepositories: one set of git services per
 * workspace, built for the repositories folder its rule gives.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  readWorkspaceFiles,
  scanWorkspaceFiles,
  repoNameOfPath,
  WorkspaceRepositories,
  workspaceDataDirOf,
  workspaceReposDir,
} from "@openp41ge/main/services/workspace-repositories";
import type { IFileSystemService } from "@openp41ge/main/interfaces/file-system-service";

const fileSystem = {} as IFileSystemService;
const ws = (id: string) => ({ id, dataDir: `/data/${id}` });

describe("WorkspaceRepositories", () => {
  it("gives each workspace its own git services, built once", () => {
    const repos = new WorkspaceRepositories({ fileSystem, reposDirOf: workspaceReposDir });
    const a = repos.of(ws("a"));
    expect(repos.of(ws("a"))).toBe(a);
    const b = repos.of(ws("b"));
    expect(b).not.toBe(a);
    expect(b.git).not.toBe(a.git);
    expect(b.service).not.toBe(a.service);
  });

  it("builds the services for the folder the rule gives", () => {
    const repos = new WorkspaceRepositories({ fileSystem, reposDirOf: workspaceReposDir });
    expect(repos.of(ws("a")).reposDir).toBe(path.join("/data/a", "repositories"));
    expect(repos.of(ws("a")).git.reposDir).toBe(path.join("/data/a", "repositories"));
  });

  it("reports each repositories folder once, when first used", () => {
    const seen: string[] = [];
    const repos = new WorkspaceRepositories({
      fileSystem,
      reposDirOf: () => "/shared/repositories",
      onReposDir: (dir) => seen.push(dir),
    });
    repos.of(ws("a"));
    repos.of(ws("b"));
    repos.of(ws("a"));
    expect(seen).toEqual(["/shared/repositories"]);
  });
});

describe("workspaceDataDirOf", () => {
  it("uses the file's dataDir, else workspaces-data/<id>, and needs an id", () => {
    expect(workspaceDataDirOf({ id: "w", dataDir: "/d" }, "/app")).toEqual({
      id: "w",
      dataDir: "/d",
    });
    expect(workspaceDataDirOf({ id: "w", dataDir: "" }, "/app")).toEqual({
      id: "w",
      dataDir: path.join("/app", "workspaces-data", "w"),
    });
    expect(workspaceDataDirOf({ dataDir: "/d" }, "/app")).toBeNull();
  });
});

describe("repoNameOfPath", () => {
  const reposDir = path.join("/data", "repositories");
  const repoDir = path.join(reposDir, "github.com", "acme", "app");
  const isRepoDir = (dir: string) => dir === repoDir;

  it("names the repository a changed path is in (worktree files or .git)", () => {
    for (const p of [
      repoDir,
      path.join(repoDir, "main", "src", "x.ts"),
      path.join(repoDir, ".git", "refs", "heads", "main"),
    ]) {
      expect(repoNameOfPath(reposDir, p, isRepoDir), p).toBe("github.com/acme/app");
    }
  });

  it("is null outside any repository", () => {
    expect(repoNameOfPath(reposDir, reposDir, isRepoDir)).toBeNull();
    expect(repoNameOfPath(reposDir, path.join(reposDir, "github.com"), isRepoDir)).toBeNull();
    expect(repoNameOfPath(reposDir, "/elsewhere/x", isRepoDir)).toBeNull();
  });
});

describe("WorkspaceRepositories.deleteRepository", () => {
  const shared = "/shared/repositories";
  function setup(others: { id: string; name: string; repoNames: string[]; reposDir?: string }[]) {
    const repos = new WorkspaceRepositories({
      fileSystem,
      reposDirOf: (w) => (w.id === "elsewhere" ? "/elsewhere/repositories" : shared),
      listWorkspaces: () =>
        others.map((o) => ({
          file: `/w/${o.id}.openp41ge-workspace`,
          workspace: ws(o.id),
          name: o.name,
          repoNames: o.repoNames,
        })),
    });
    const deleted = vi
      .spyOn(repos.of(ws("a")).git, "deleteRepository")
      .mockResolvedValue({ ok: true });
    return { repos, deleted };
  }

  it("deletes the clone when no other workspace uses it", async () => {
    const { repos, deleted } = setup([
      { id: "a", name: "A", repoNames: ["github.com/acme/app"] },
      { id: "b", name: "B", repoNames: ["github.com/acme/web"] },
      { id: "elsewhere", name: "E", repoNames: ["github.com/acme/app"] },
    ]);
    await expect(repos.deleteRepository(ws("a"), "github.com/acme/app")).resolves.toEqual({
      ok: true,
    });
    expect(deleted).toHaveBeenCalledWith("github.com/acme/app");
  });

  it("keeps a clone another workspace shares, and says which", async () => {
    const { repos, deleted } = setup([{ id: "b", name: "B", repoNames: ["github.com/acme/app"] }]);
    const result = await repos.deleteRepository(ws("a"), "github.com/acme/app");
    expect(result.ok).toBe(false);
    expect(result.error).toContain('"B"');
    expect(deleted).not.toHaveBeenCalled();
  });
});

describe("readWorkspaceFiles", () => {
  it("reads each workspace file's id, name and repositories (even an invalid URL's), skipping unreadable ones", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-files-"));
    try {
      fs.writeFileSync(
        path.join(dir, "a.openp41ge-workspace"),
        JSON.stringify({
          id: "a",
          name: "A",
          repos: [{ url: "git@github.com:acme/app.git" }, { url: "github.com/acme/typo" }],
        }),
      );
      fs.writeFileSync(path.join(dir, "broken.openp41ge-workspace"), "{");
      fs.writeFileSync(path.join(dir, "notes.txt"), "{}");
      expect(readWorkspaceFiles(dir, "/app")).toEqual([
        {
          file: path.join(dir, "a.openp41ge-workspace"),
          workspace: { id: "a", dataDir: path.join("/app", "workspaces-data", "a") },
          name: "A",
          // A workspace that lists a repo by a mistyped URL still uses it.
          repoNames: ["github.com/acme/app", "github.com/acme/typo"],
        },
      ]);
      expect(readWorkspaceFiles(path.join(dir, "missing"), "/app")).toEqual([]);
      // Whether every workspace file could be read (one could not).
      expect(scanWorkspaceFiles(dir, "/app").complete).toBe(false);
      fs.rmSync(path.join(dir, "broken.openp41ge-workspace"));
      expect(scanWorkspaceFiles(dir, "/app").complete).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("WorkspaceRepositories.isCloning", () => {
  it("is true when any workspace using that folder is cloning the repo", () => {
    const repos = new WorkspaceRepositories({ fileSystem, reposDirOf: () => "/shared" });
    vi.spyOn(repos.of(ws("a")).git, "isCloning").mockImplementation((n) => n === "x/y/z");
    repos.of(ws("b"));
    expect(repos.isCloning("/shared", "x/y/z")).toBe(true);
    expect(repos.isCloning("/shared", "x/y/other")).toBe(false);
    expect(repos.isCloning("/elsewhere", "x/y/z")).toBe(false);
  });
});
