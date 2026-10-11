/**
 * tabsShowing: the tabs that show a deleted repository, worktree or folder
 * (closed after a Delete — their content no longer exists): any tab whose
 * config names the repository (and, for a worktree, its branch), and any
 * tab whose file was inside the deleted folder.
 */
import { describe, it, expect } from "vitest";
import * as types from "@openp41ge/layout/types";
import * as ops from "@openp41ge/layout/operations";
import { tabsShowing } from "@openp41ge/layout/tabs-showing";

const REPO = "github.com/acme/app";
const CLONE = "/data/repositories/github.com/acme/app";
const GIT = "ext:openp41ge-extension-git";

function workspace() {
  let ws = types.createWorkspace("ws1");
  const winId = ws.windows[0].id;
  const add = (id: string, appType: string, config: Record<string, unknown>) => {
    ws = ops.addTabToCell(ws, winId, types.createTab(id, appType, id, config), 0, 0);
  };
  add("repo", `${GIT}:repository`, { repoName: REPO });
  add("main-wt", `${GIT}:repository`, { repoName: REPO, branch: "main" });
  add("other-repo", `${GIT}:repository`, { repoName: "github.com/acme/web" });
  add("commit", `${GIT}:commit`, { repoName: REPO, hash: "abc" });
  add("diff", `${GIT}:file-diff`, { repoName: REPO, hash: "abc", path: "a.ts" });
  add("main-diff", `${GIT}:file-diff`, { repoName: REPO, branch: "main", path: "a.ts" });
  add("other-diff", `${GIT}:file-diff`, { repoName: "github.com/acme/web", path: "a.ts" });
  add("main-file", "file-viewer", { filePath: `${CLONE}/main/src/a.ts` });
  add("dev-file", "file-viewer", { filePath: `${CLONE}/dev/b.ts` });
  add("sibling", "file-viewer", { filePath: `${CLONE}-tests/main/c.ts` });
  add("elsewhere", "file-viewer", { filePath: "/tmp/d.ts" });
  return { ws, winId };
}

describe("tabsShowing", () => {
  it("finds every tab of a deleted repository and the files inside its clone", () => {
    const { ws, winId } = workspace();
    const found = tabsShowing(ws, { repoName: REPO, folder: CLONE });
    expect(found.map((t) => t.tabId).sort()).toEqual(
      ["commit", "dev-file", "diff", "main-diff", "main-file", "main-wt", "repo"].sort(),
    );
    expect(found.every((t) => t.windowId === winId)).toBe(true);
  });

  it("finds a deleted worktree's tabs and the files inside its folder", () => {
    const { ws } = workspace();
    const found = tabsShowing(ws, { repoName: REPO, branch: "main", folder: `${CLONE}/main` });
    expect(found.map((t) => t.tabId).sort()).toEqual(["main-diff", "main-file", "main-wt"]);
  });

  it("finds only the files inside a deleted folder", () => {
    const { ws } = workspace();
    const found = tabsShowing(ws, { folder: `${CLONE}/main` });
    expect(found.map((t) => t.tabId)).toEqual(["main-file"]);
  });
});
