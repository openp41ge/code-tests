/**
 * End to end: the git extension's backend (its built entry), loaded by the
 * extension host, answers a query whose git runs through the platform's
 * runner — `ctx.git` bound to the calling window's workspace — on a real
 * repository. Proves the pieces fit: SDK context → host → platform runner →
 * the extension's queries.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { ExtensionHost } from "openp41ge-core-extension-host";
import { createNoopLogger } from "openp41ge-core-logger";
import { runExtensionGit } from "../../src/main/services/extension-git";
import { inApp } from "@code-tests/support";

/** This test's directory in the app checkout (it reads app files). */
const APP_HERE = inApp(__dirname);

const APP = "github.com/acme/app";
const EXT_ROOT = path.resolve(APP_HERE, "../../../openp41ge-extension-git");
let root: string;
let reposDir: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ext-git-chain-"));
  const src = path.join(root, "src");
  fs.mkdirSync(src);
  const git = (cwd: string, args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf-8" });
  git(src, ["init", "-q", "-b", "main", "."]);
  fs.writeFileSync(path.join(src, "a.txt"), "a\n");
  git(src, ["add", "."]);
  git(src, ["commit", "-qm", "the only commit"]);
  reposDir = path.join(root, "repos");
  git(root, ["clone", "--bare", "--quiet", src, path.join(reposDir, APP, ".git")]);
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("git extension backend through the platform's git runner", () => {
  it("answers commit-log for a repo of the caller's workspace, and refuses another", async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(EXT_ROOT, "package.json"), "utf-8"));
    const id = manifest.openp41ge.id as string;
    const host = new ExtensionHost({
      discoveryDirs: [],
      createLogger: createNoopLogger,
      loadEntry: (p: string) => import(p),
      discover: async () => [
        {
          manifest,
          root: EXT_ROOT,
          entryPath: path.join(EXT_ROOT, manifest.openp41ge.entry),
        },
      ],
    });
    const [loaded] = await host.loadAll();
    expect(loaded?.error).toBeUndefined();

    const caller = {
      git: (request: Parameters<typeof runExtensionGit>[1]) =>
        runExtensionGit({ reposDir, repoNames: [APP] }, request),
    };
    const ok = (await host.dispatch(`${id}/commit-log`, { repo: APP, branch: "main" }, caller)) as {
      ok: boolean;
      result: Array<{ message: string }>;
    };
    expect(ok.ok).toBe(true);
    expect(ok.result.map((c) => c.message)).toEqual(["the only commit"]);

    const refused = await host.dispatch(
      `${id}/branches`,
      { repo: "github.com/acme/other" },
      caller,
    );
    expect(refused).toMatchObject({
      ok: false,
      error: expect.stringMatching(/not a repository of this workspace/),
    });
  });
});
