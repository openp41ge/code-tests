/**
 * Regression + behaviour tests for NodeGitService.checkoutWorktree.
 *
 * Uses a real local git repo so worktree semantics are exercised exactly as in
 * production (bare clone under reposDir/<provider>/<org>/<repo>/.git, worktrees
 * as siblings of .git/).
 *
 * Regression (2026-08-29): workspace activation — sometimes concurrent from two
 * windows, with clone() short-circuiting on another window's in-progress clone
 * dir — used to surface `fatal: a branch named '<branch>' already exists` from
 * checkoutWorktree's create-from-HEAD path. checkoutWorktree must now be
 * idempotent and collision-tolerant.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { currentBranchOf, NodeGitService } from "../../../src/main/services/node-git-service";

const wtDir = (branch: string) => branch.replace(/\//g, "--");

function git(cwd: string, args: string[]): string {
  return execSync(`git ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ")}`, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t.co",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t.co",
      GIT_TERMINAL_PROMPT: "0",
    },
    encoding: "utf8",
  }).trim();
}

describe("NodeGitService.checkoutWorktree", () => {
  let root: string;
  let srcRepo: string;
  let reposDir: string;
  let svc: NodeGitService;
  const repoName = "github.com/example/demo";
  const branch = "feat/of-7";

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "openp41ge-git-test-"));
    srcRepo = path.join(root, "src");
    fs.mkdirSync(srcRepo, { recursive: true });
    git(srcRepo, ["init", "-q", "-b", "main", "."]);
    fs.writeFileSync(path.join(srcRepo, "a.txt"), "a\n");
    git(srcRepo, ["add", "."]);
    git(srcRepo, ["commit", "-qm", "init"]);
    git(srcRepo, ["branch", branch]);
    git(srcRepo, ["branch", "feat/other"]);

    reposDir = path.join(root, "repos");
    fs.mkdirSync(reposDir, { recursive: true });
    git(reposDir, ["clone", "--bare", "--quiet", srcRepo, path.join(reposDir, repoName, ".git")]);
    svc = new NodeGitService(reposDir);
  });

  afterAll(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("creates a worktree for an existing local branch without throwing", async () => {
    const info = await svc.checkoutWorktree(repoName, branch);
    expect(info.exists).toBe(true);
    expect(info.path).toBe(path.join(reposDir, repoName, wtDir(branch)));
    expect(fs.existsSync(info.path)).toBe(true);
  });

  it("is idempotent on a second call (worktree already exists)", async () => {
    await expect(svc.checkoutWorktree(repoName, branch)).resolves.toMatchObject({ exists: true });
  });

  it("does not throw 'already exists' when the branch ref pre-exists but the worktree is missing", async () => {
    // Regression: while another window's clone is in progress, rev-parse sees no
    // refs yet, so checkoutWorktree used to hit `git branch <b>` and throw
    // `fatal: a branch named '<b>' already exists`. It must settle to exists:true.
    //
    // To force that path deterministically: a branch that exists only in local
    // refs/heads (not on origin) + a rev-parse failure (stubbed mid-clone). Old
    // code fell through to `git branch` -> fatal "already exists"; new code must
    // tolerate it and materialize the worktree.
    const b = "feat/local-only";
    git(path.join(reposDir, repoName), ["--git-dir=.git", "branch", b]);
    const dir = path.join(reposDir, repoName, wtDir(b));
    fs.rmSync(dir, { recursive: true, force: true });

    const svcAny = svc as unknown as { _execGit: (...a: unknown[]) => Promise<string> };
    const realExec = svcAny._execGit.bind(svc);
    vi.spyOn(svcAny, "_execGit").mockImplementation(async (args: string[], name: string) => {
      if (args[0] === "rev-parse") throw new Error("simulated mid-clone: refs not visible yet");
      return realExec(args, name);
    });

    await expect(svc.checkoutWorktree(repoName, b)).resolves.toMatchObject({ exists: true });
    expect(fs.existsSync(dir)).toBe(true);
    vi.restoreAllMocks();
  });

  it("checks out a branch that exists only on the remote", async () => {
    const remoteOnly = "feat/remote-only";
    git(srcRepo, ["branch", remoteOnly]);
    const info = await svc.checkoutWorktree(repoName, remoteOnly);
    expect(info.exists).toBe(true);
    const wtList = git(path.join(reposDir, repoName), ["worktree", "list", "--porcelain"]);
    expect(wtList).toContain(`branch refs/heads/${remoteOnly}`);
  });

  it("creates a brand-new branch and materializes it as a worktree", async () => {
    const fresh = "feat/newbranch";
    const info = await svc.checkoutWorktree(repoName, fresh);
    expect(info.exists).toBe(true);
    const wtList = git(path.join(reposDir, repoName), ["worktree", "list", "--porcelain"]);
    expect(wtList).toContain(`branch refs/heads/${fresh}`);
  });

  it("never throws 'already exists' across repeated activations", async () => {
    for (let i = 0; i < 3; i += 1) {
      for (const b of [branch, "feat/other", "feat/remote-only", "feat/newbranch"]) {
        await expect(svc.checkoutWorktree(repoName, b)).resolves.toMatchObject({ exists: true });
      }
    }
  });

  it("re-creates a worktree after its folder was deleted (prunes stale registration)", async () => {
    // Regression: a declared worktree whose folder was removed behind git's back
    // leaves '... is a missing but already registered worktree' metadata, which
    // used to THROW out of workspace:checkoutWorktree → blocking error overlay on
    // activation. checkoutWorktree must prune + retry once instead.
    const b = "feat/of-7";
    const dir = path.join(reposDir, repoName, wtDir(b));
    await expect(svc.checkoutWorktree(repoName, b)).resolves.toMatchObject({ exists: true });
    fs.rmSync(dir, { recursive: true, force: true });
    expect(fs.existsSync(dir)).toBe(false);

    await expect(svc.checkoutWorktree(repoName, b)).resolves.toMatchObject({ exists: true });
    expect(fs.existsSync(dir)).toBe(true);
  });
});

describe("NodeGitService.clone — URL check", () => {
  it.each(["acme/app", "github.com/acme/app", "http://github.com/acme/app", "--upload-pack=x"])(
    "refuses %j without running git or touching the repos dir",
    async (url) => {
      const reposDir = fs.mkdtempSync(path.join(os.tmpdir(), "ngs-clone-"));
      try {
        const session = new NodeGitService(reposDir).clone(url);
        const result = await session.promise;
        expect(result.success).toBe(false);
        expect(result.error).toContain("full clone URL");
        expect(fs.readdirSync(reposDir)).toEqual([]);
      } finally {
        fs.rmSync(reposDir, { recursive: true, force: true });
      }
    },
  );
});

describe("NodeGitService — unusable git", () => {
  it("refuses git work with the startup check's problem instead of running git", async () => {
    const reposDir = fs.mkdtempSync(path.join(os.tmpdir(), "ngs-nogit-"));
    try {
      fs.mkdirSync(path.join(reposDir, "github.com/acme/app/.git"), { recursive: true });
      const svc = new NodeGitService(reposDir, () => "Git was not found.");
      const clone = await svc.clone("git@github.com:acme/other.git").promise;
      expect(clone).toEqual({ success: false, error: "Git was not found." });
      await expect(svc.fetch("github.com/acme/app")).rejects.toThrow("Git was not found.");
      expect(fs.existsSync(path.join(reposDir, "github.com/acme/other"))).toBe(false);
    } finally {
      fs.rmSync(reposDir, { recursive: true, force: true });
    }
  });
});

describe("NodeGitService.clone — transcript", () => {
  it("reports git's own error and a transcript of the command and its output", async () => {
    const reposDir = fs.mkdtempSync(path.join(os.tmpdir(), "ngs-transcript-"));
    try {
      // Nothing listens on port 9: git fails fast with its own message.
      const url = "https://127.0.0.1:9/acme/app.git";
      const result = await new NodeGitService(reposDir).clone(url).promise;
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/^fatal: /);
      expect(result.error).not.toBe("Unknown error");
      expect(result.transcript?.command).toBe(`git clone --bare --progress ${url}`);
      expect(result.transcript?.output).toContain(result.error);
    } finally {
      fs.rmSync(reposDir, { recursive: true, force: true });
    }
  }, 20_000);
});

describe("NodeGitService.clone — remote-tracking branches", () => {
  it("records the remote's branches, so a fresh clone has nothing unpushed", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ngs-clone-remote-"));
    const src = path.join(root, "src");
    fs.mkdirSync(src);
    git(src, ["init", "-q", "-b", "main", "."]);
    fs.writeFileSync(path.join(src, "a.txt"), "a\n");
    git(src, ["add", "."]);
    git(src, ["commit", "-qm", "init"]);
    // A full clone URL that git resolves to the local source repo.
    const url = "https://example.test/acme/app.git";
    vi.stubEnv("GIT_CONFIG_COUNT", "1");
    vi.stubEnv("GIT_CONFIG_KEY_0", `url.${src}.insteadOf`);
    vi.stubEnv("GIT_CONFIG_VALUE_0", url);
    try {
      const svc = new NodeGitService(path.join(root, "repos"));
      const result = await svc.clone(url).promise;
      expect(result.success).toBe(true);
      const state = await svc.repositoryState("example.test/acme/app");
      expect(state.branches.map((b) => [b.branch, b.unpushed])).toEqual([["main", 0]]);
    } finally {
      vi.unstubAllEnvs();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 20_000);
});

describe("NodeGitService.removeWorktree (strict)", () => {
  let root: string;
  let reposDir: string;
  let svc: NodeGitService;
  const repoName = "github.com/example/demo";

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "openp41ge-wt-remove-"));
    const src = path.join(root, "src");
    fs.mkdirSync(src, { recursive: true });
    git(src, ["init", "-q", "-b", "main", "."]);
    fs.writeFileSync(path.join(src, "a.txt"), "a\n");
    git(src, ["add", "."]);
    git(src, ["commit", "-qm", "init"]);
    git(src, ["branch", "clean"]);
    git(src, ["branch", "dirty"]);
    reposDir = path.join(root, "repos");
    fs.mkdirSync(reposDir, { recursive: true });
    git(reposDir, ["clone", "--bare", "--quiet", src, path.join(reposDir, repoName, ".git")]);
    svc = new NodeGitService(reposDir);
  });

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it("refuses a worktree with uncommitted changes and keeps its files", async () => {
    const wt = await svc.checkoutWorktree(repoName, "dirty");
    fs.writeFileSync(path.join(wt.path, "a.txt"), "changed\n");
    const result = await svc.removeWorktree(repoName, "dirty");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/modified or untracked|contains/);
    expect(fs.readFileSync(path.join(wt.path, "a.txt"), "utf8")).toBe("changed\n");
  });

  it("deletes a clean worktree's folder and keeps its branch", async () => {
    const wt = await svc.checkoutWorktree(repoName, "clean");
    await expect(svc.removeWorktree(repoName, "clean")).resolves.toEqual({ ok: true });
    expect(fs.existsSync(wt.path)).toBe(false);
    const gitDir = path.join(reposDir, repoName, ".git");
    expect(git(gitDir, ["branch", "--list", "clean"])).toContain("clean");
  });

  it("succeeds when the folder is already gone", async () => {
    await expect(svc.removeWorktree(repoName, "never-made")).resolves.toEqual({ ok: true });
  });
});

describe("NodeGitService.repositoryState", () => {
  let root: string;
  let reposDir: string;
  let svc: NodeGitService;
  const repoName = "github.com/example/demo";

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "openp41ge-repo-state-"));
    const src = path.join(root, "src");
    fs.mkdirSync(src, { recursive: true });
    git(src, ["init", "-q", "-b", "main", "."]);
    fs.writeFileSync(path.join(src, "a.txt"), "a\n");
    fs.writeFileSync(path.join(src, "b.txt"), "b\n");
    git(src, ["add", "."]);
    git(src, ["commit", "-qm", "init"]);
    git(src, ["branch", "feature"]);
    reposDir = path.join(root, "repos");
    fs.mkdirSync(reposDir, { recursive: true });
    git(reposDir, ["clone", "--bare", "--quiet", src, path.join(reposDir, repoName, ".git")]);
    svc = new NodeGitService(reposDir);
    await svc.fetch(repoName); // remote-tracking branches, as clone() records them

    // main: one unstaged, one staged, one untracked file; nothing unpushed.
    const main = await svc.checkoutWorktree(repoName, "main");
    fs.writeFileSync(path.join(main.path, "a.txt"), "changed\n");
    fs.writeFileSync(path.join(main.path, "b.txt"), "staged\n");
    git(main.path, ["add", "b.txt"]);
    fs.writeFileSync(path.join(main.path, "new.txt"), "new\n");
    // feature: clean, one commit no remote has.
    const feature = await svc.checkoutWorktree(repoName, "feature");
    fs.writeFileSync(path.join(feature.path, "a.txt"), "feature\n");
    git(feature.path, ["commit", "-qam", "local work"]);
    // never-pushed: a branch no remote has, without a worktree.
    git(path.join(reposDir, repoName, ".git"), ["branch", "never-pushed", "feature"]);
  }, 20_000);

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it("counts each branch's uncommitted files and the commits no remote has", async () => {
    const state = await svc.repositoryState(repoName);
    expect(state.repoName).toBe(repoName);
    expect(state.error).toBeUndefined();
    const byBranch = Object.fromEntries(state.branches.map((b) => [b.branch, b]));
    expect(byBranch.main).toEqual({
      branch: "main",
      worktree: true,
      staged: 1,
      unstaged: 1,
      untracked: 1,
      unpushed: 0,
    });
    expect(byBranch.feature).toEqual({
      branch: "feature",
      worktree: true,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      unpushed: 1,
    });
    expect(byBranch["never-pushed"]).toEqual({
      branch: "never-pushed",
      worktree: false,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      unpushed: 1,
    });
  });

  it("is empty for a repository that is not cloned", async () => {
    await expect(svc.repositoryState("github.com/example/none")).resolves.toEqual({
      repoName: "github.com/example/none",
      branches: [],
    });
  });
});

describe("NodeGitService.deleteRepository", () => {
  let root: string;
  let reposDir: string;
  const repoName = "github.com/example/demo";

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "openp41ge-repo-delete-"));
    const src = path.join(root, "src");
    fs.mkdirSync(src, { recursive: true });
    git(src, ["init", "-q", "-b", "main", "."]);
    fs.writeFileSync(path.join(src, "a.txt"), "a\n");
    git(src, ["add", "."]);
    git(src, ["commit", "-qm", "init"]);
    reposDir = path.join(root, "repos");
    git(root, ["clone", "--bare", "--quiet", src, path.join(reposDir, repoName, ".git")]);
    git(root, [
      "clone",
      "--bare",
      "--quiet",
      src,
      path.join(reposDir, "github.com/example/other", ".git"),
    ]);
  }, 20_000);

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it("deletes the clone with its worktrees, even uncommitted ones, and nothing else", async () => {
    const svc = new NodeGitService(reposDir);
    const main = await svc.checkoutWorktree(repoName, "main");
    fs.writeFileSync(path.join(main.path, "a.txt"), "uncommitted\n");
    await expect(svc.deleteRepository(repoName)).resolves.toEqual({ ok: true });
    expect(fs.existsSync(path.join(reposDir, repoName))).toBe(false);
    // Its host / org folders stay while another repository is in them.
    expect(fs.existsSync(path.join(reposDir, "github.com/example/other/.git"))).toBe(true);
  });

  it("removes the host / org folders it leaves empty", async () => {
    const svc = new NodeGitService(reposDir);
    await expect(svc.deleteRepository("github.com/example/other")).resolves.toEqual({ ok: true });
    expect(fs.readdirSync(reposDir)).toEqual([]);
  });

  it.each(["", "..", "github.com/../x", "/etc", "github.com//x", "github.com/example/none"])(
    "refuses %j: not a repository of the folder",
    async (name) => {
      const svc = new NodeGitService(reposDir);
      const result = await svc.deleteRepository(name);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/not a repository/);
    },
  );
});

describe("NodeGitService.hasStash", () => {
  it("is true once a worktree stashes, false before and for an unknown repo", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ngs-stash-"));
    try {
      const src = path.join(root, "src");
      fs.mkdirSync(src);
      git(src, ["init", "-q", "-b", "main", "."]);
      fs.writeFileSync(path.join(src, "a.txt"), "a\n");
      git(src, ["add", "."]);
      git(src, ["commit", "-qm", "init"]);
      const reposDir = path.join(root, "repos");
      const repoName = "github.com/example/demo";
      git(root, ["clone", "--bare", "--quiet", src, path.join(reposDir, repoName, ".git")]);
      const svc = new NodeGitService(reposDir);
      const main = await svc.checkoutWorktree(repoName, "main");
      await expect(svc.hasStash(repoName)).resolves.toBe(false);
      fs.writeFileSync(path.join(main.path, "a.txt"), "changed\n");
      git(main.path, ["stash", "-q"]);
      await expect(svc.hasStash(repoName)).resolves.toBe(true);
      await expect(svc.hasStash("github.com/example/none")).resolves.toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 20_000);
});

describe("NodeGitService.isCloning", () => {
  it("is true while a clone runs, false once it settles", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ngs-cloning-"));
    const src = path.join(root, "src");
    fs.mkdirSync(src);
    git(src, ["init", "-q", "-b", "main", "."]);
    fs.writeFileSync(path.join(src, "a.txt"), "a\n");
    git(src, ["add", "."]);
    git(src, ["commit", "-qm", "init"]);
    const url = "https://example.test/acme/app.git";
    vi.stubEnv("GIT_CONFIG_COUNT", "1");
    vi.stubEnv("GIT_CONFIG_KEY_0", `url.${src}.insteadOf`);
    vi.stubEnv("GIT_CONFIG_VALUE_0", url);
    try {
      const svc = new NodeGitService(path.join(root, "repos"));
      expect(svc.isCloning("example.test/acme/app")).toBe(false);
      const session = svc.clone(url);
      expect(svc.isCloning("example.test/acme/app")).toBe(true);
      await session.promise;
      expect(svc.isCloning("example.test/acme/app")).toBe(false);
    } finally {
      vi.unstubAllEnvs();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 20_000);
});

describe("currentBranchOf", () => {
  it("reads the branch of a repository folder or a worktree, null elsewhere", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ngs-branch-"));
    try {
      const src = path.join(root, "src");
      fs.mkdirSync(src);
      git(src, ["init", "-q", "-b", "main", "."]);
      fs.writeFileSync(path.join(src, "a.txt"), "a\n");
      git(src, ["add", "."]);
      git(src, ["commit", "-qm", "init"]);
      git(src, ["worktree", "add", "-q", path.join(root, "wt"), "-b", "feat/x"]);
      expect(currentBranchOf(src)).toBe("main");
      expect(currentBranchOf(path.join(root, "wt"))).toBe("feat/x");
      expect(currentBranchOf(root)).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("NodeGitService.deleteWorktree (never forced)", () => {
  it("refuses a worktree with uncommitted changes and keeps its files; deletes a clean one", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ngs-delete-wt-"));
    try {
      const src = path.join(root, "src");
      fs.mkdirSync(src);
      git(src, ["init", "-q", "-b", "main", "."]);
      fs.writeFileSync(path.join(src, "a.txt"), "a\n");
      git(src, ["add", "."]);
      git(src, ["commit", "-qm", "init"]);
      git(src, ["branch", "dirty"]);
      git(src, ["branch", "clean"]);
      const reposDir = path.join(root, "repos");
      const repoName = "github.com/example/demo";
      git(root, ["clone", "--bare", "--quiet", src, path.join(reposDir, repoName, ".git")]);
      const svc = new NodeGitService(reposDir);
      const dirty = await svc.checkoutWorktree(repoName, "dirty");
      const clean = await svc.checkoutWorktree(repoName, "clean");
      fs.writeFileSync(path.join(dirty.path, "a.txt"), "uncommitted\n");

      await expect(svc.deleteWorktree(repoName, "dirty")).rejects.toThrow(/modified or untracked/);
      expect(fs.readFileSync(path.join(dirty.path, "a.txt"), "utf-8")).toBe("uncommitted\n");

      await expect(svc.deleteWorktree(repoName, "clean")).resolves.toBeUndefined();
      expect(fs.existsSync(clean.path)).toBe(false);
      // Already gone: nothing to do.
      await expect(svc.deleteWorktree(repoName, "clean")).resolves.toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 20_000);
});
