/**
 * A GitRunner over a local repositories folder, for tests: what the
 * platform's `ctx.git` does — `<reposDir>/<repo>` with `--git-dir=.git`, or
 * the named worktree's folder — with real git and no shell.
 */
import { execFile } from "child_process";
import path from "path";
import type { GitRunner } from "@openp41ge-sdk-git/git-queries";

export function localGitRunner(reposDir: string): GitRunner {
  return (repoName, args, worktree, okExitCodes) => {
    const repoDir = path.join(reposDir, repoName);
    const cwd = worktree ? path.join(repoDir, worktree.replace(/\//g, "--")) : repoDir;
    const fullArgs = worktree ? args : ["--git-dir=.git", ...args];
    return new Promise((resolve, reject) => {
      execFile("git", fullArgs, { cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        const code = typeof error?.code === "number" ? error.code : null;
        if (error && !(code !== null && okExitCodes?.includes(code))) {
          reject(new Error(stderr.trim() || error.message));
        } else resolve(stdout.trimEnd());
      });
    });
  };
}
