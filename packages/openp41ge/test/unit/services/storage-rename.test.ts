/**
 * Tests for moving the app's storage from the old "openp41ge" names to the
 * "openp41ge code" ones on first start: the folder moves once, and the paths
 * saved inside the data folder follow it.
 */

import { describe, expect, test } from "vitest";
import {
  StorageMove,
  legacyAppDataDirName,
  legacyChromiumProfileDirName,
  type StorageFs,
} from "../../../src/main/services/storage-rename";

/** An in-memory file system: files by path, plus directories. */
class MemoryFs implements StorageFs {
  readonly files = new Map<string, string>();
  readonly dirs = new Set<string>();
  failRename = false;

  file(p: string, data: string): this {
    this.files.set(p, data);
    for (let d = parent(p); d && d !== "/"; d = parent(d)) this.dirs.add(d);
    return this;
  }

  dir(p: string): this {
    for (let d = p; d && d !== "/"; d = parent(d)) this.dirs.add(d);
    return this;
  }

  exists(p: string): boolean {
    return this.files.has(p) || this.dirs.has(p);
  }

  isDirectory(p: string): boolean {
    return this.dirs.has(p);
  }

  readdir(p: string): string[] {
    const names = new Set<string>();
    for (const k of [...this.files.keys(), ...this.dirs]) {
      if (parent(k) === p) names.add(k.slice(p.length + 1));
    }
    return [...names];
  }

  readFile(p: string): string {
    const v = this.files.get(p);
    if (v === undefined) throw new Error(`ENOENT ${p}`);
    return v;
  }

  writeFile(p: string, data: string): void {
    this.files.set(p, data);
  }

  rename(from: string, to: string): void {
    if (this.failRename) throw new Error("EBUSY");
    const move = (k: string) => (k === from || k.startsWith(`${from}/`) ? to + k.slice(from.length) : k);
    for (const [k, v] of [...this.files]) {
      this.files.delete(k);
      this.files.set(move(k), v);
    }
    for (const d of [...this.dirs]) {
      this.dirs.delete(d);
      this.dirs.add(move(d));
    }
  }
}

function parent(p: string): string {
  return p.slice(0, p.lastIndexOf("/")) || "/";
}

const OLD = "/Users/u/.openp41ge";
const NEW = "/Users/u/.openp41ge-code";

describe("legacy names", () => {
  test("the old data folders were .openp41ge and .openp41ge-dev", () => {
    expect(legacyAppDataDirName(true)).toBe(".openp41ge");
    expect(legacyAppDataDirName(false)).toBe(".openp41ge-dev");
  });

  test("the old Chromium profile folders were openp41ge and openp41ge-dev", () => {
    expect(legacyChromiumProfileDirName(true)).toBe("openp41ge");
    expect(legacyChromiumProfileDirName(false)).toBe("openp41ge-dev");
  });
});

describe("StorageMove.moveFolder", () => {
  test("moves the old folder to the new name when only the old one exists", () => {
    const fs = new MemoryFs().file(`${OLD}/config.json`, "{}");
    expect(new StorageMove(fs).moveFolder(OLD, NEW)).toBe(NEW);
    expect(fs.files.get(`${NEW}/config.json`)).toBe("{}");
    expect(fs.exists(OLD)).toBe(false);
  });

  test("leaves both alone when the new folder already exists", () => {
    const fs = new MemoryFs().file(`${OLD}/a`, "old").file(`${NEW}/a`, "new");
    expect(new StorageMove(fs).moveFolder(OLD, NEW)).toBe(NEW);
    expect(fs.files.get(`${OLD}/a`)).toBe("old");
    expect(fs.files.get(`${NEW}/a`)).toBe("new");
  });

  test("does nothing when there is no old folder", () => {
    const fs = new MemoryFs();
    expect(new StorageMove(fs).moveFolder(OLD, NEW)).toBe(NEW);
    expect(fs.exists(NEW)).toBe(false);
  });

  test("keeps using the old folder when the move fails, so nothing is lost", () => {
    const fs = new MemoryFs().file(`${OLD}/a`, "old");
    fs.failRename = true;
    expect(new StorageMove(fs).moveFolder(OLD, NEW)).toBe(OLD);
    expect(fs.files.get(`${OLD}/a`)).toBe("old");
  });
});

describe("StorageMove.moveDataDir", () => {
  test("points the workspace files' dataDir at the moved folder", () => {
    const ws = `${OLD}/workspaces/w1.openp41ge-workspace`;
    const fs = new MemoryFs().file(
      ws,
      JSON.stringify({ id: "w1", name: "my .openp41ge notes", dataDir: `${OLD}/workspaces-data/w1` }),
    );
    expect(new StorageMove(fs).moveDataDir(OLD, NEW)).toBe(NEW);
    const data = JSON.parse(fs.readFile(`${NEW}/workspaces/w1.openp41ge-workspace`));
    expect(data.dataDir).toBe(`${NEW}/workspaces-data/w1`);
    expect(data.name).toBe("my .openp41ge notes");
  });

  test("points the manager grid's workspace paths at the moved folder", () => {
    const fs = new MemoryFs().file(
      `${OLD}/manager-grid.json`,
      JSON.stringify({ tabs: [{ params: { path: `${OLD}/workspaces/w1.openp41ge-workspace`, dir: `${OLD}/workspaces` } }] }),
    );
    new StorageMove(fs).moveDataDir(OLD, NEW);
    const grid = JSON.parse(fs.readFile(`${NEW}/manager-grid.json`));
    expect(grid.tabs[0].params).toEqual({
      path: `${NEW}/workspaces/w1.openp41ge-workspace`,
      dir: `${NEW}/workspaces`,
    });
  });

  test("leaves paths in a different folder that only starts with the same name", () => {
    const fs = new MemoryFs().file(
      `${OLD}/manager-grid.json`,
      JSON.stringify({ path: "/Users/u/.openp41ge-dev/workspaces/x.openp41ge-workspace" }),
    );
    new StorageMove(fs).moveDataDir(OLD, NEW);
    expect(JSON.parse(fs.readFile(`${NEW}/manager-grid.json`)).path).toBe(
      "/Users/u/.openp41ge-dev/workspaces/x.openp41ge-workspace",
    );
  });

  test("repairs git worktree links inside the moved folder", () => {
    const repo = `${OLD}/workspaces-data/w1/repositories/github.com/org/app`;
    const newRepo = `${NEW}/workspaces-data/w1/repositories/github.com/org/app`;
    const fs = new MemoryFs()
      .file(`${repo}/.git/HEAD`, "ref: refs/heads/main\n")
      .file(`${repo}/.git/worktrees/master/gitdir`, `${repo}/master/.git\n`)
      .file(`${repo}/.git/worktrees/master/commondir`, "../..\n")
      .file(`${repo}/master/.git`, `gitdir: ${repo}/.git/worktrees/master\n`)
      .file(`${repo}/master/src/index.ts`, `// ${OLD}/somewhere\n`);
    new StorageMove(fs).moveDataDir(OLD, NEW);
    expect(fs.readFile(`${newRepo}/.git/worktrees/master/gitdir`)).toBe(`${newRepo}/master/.git\n`);
    expect(fs.readFile(`${newRepo}/master/.git`)).toBe(`gitdir: ${newRepo}/.git/worktrees/master\n`);
    expect(fs.readFile(`${newRepo}/.git/worktrees/master/commondir`)).toBe("../..\n");
    // A repository's own files are its content, not saved paths.
    expect(fs.readFile(`${newRepo}/master/src/index.ts`)).toBe(`// ${OLD}/somewhere\n`);
  });

  test("leaves logs and chat histories as they were", () => {
    const fs = new MemoryFs()
      .file(`${OLD}/logs/openp41ge.log`, `{"message":"${OLD}/x"}\n`)
      .file(`${OLD}/workspaces-data/w1/extensions/agents/chat-threads/c1/messages-000001.jsonl`, `{"content":"${OLD}/y"}\n`);
    new StorageMove(fs).moveDataDir(OLD, NEW);
    expect(fs.readFile(`${NEW}/logs/openp41ge.log`)).toBe(`{"message":"${OLD}/x"}\n`);
    expect(
      fs.readFile(`${NEW}/workspaces-data/w1/extensions/agents/chat-threads/c1/messages-000001.jsonl`),
    ).toBe(`{"content":"${OLD}/y"}\n`);
  });

  test("rewrites nothing when the folder did not move", () => {
    const fs = new MemoryFs().file(`${NEW}/manager-grid.json`, JSON.stringify({ path: `${OLD}/w` }));
    new StorageMove(fs).moveDataDir(OLD, NEW);
    expect(JSON.parse(fs.readFile(`${NEW}/manager-grid.json`)).path).toBe(`${OLD}/w`);
  });

  test("a saved file it cannot parse is left alone and the rest still move", () => {
    const fs = new MemoryFs()
      .file(`${OLD}/manager-grid.json`, "{not json")
      .file(`${OLD}/workspaces/w1.openp41ge-workspace`, JSON.stringify({ dataDir: `${OLD}/workspaces-data/w1` }));
    expect(new StorageMove(fs).moveDataDir(OLD, NEW)).toBe(NEW);
    expect(fs.readFile(`${NEW}/manager-grid.json`)).toBe("{not json");
    expect(JSON.parse(fs.readFile(`${NEW}/workspaces/w1.openp41ge-workspace`)).dataDir).toBe(
      `${NEW}/workspaces-data/w1`,
    );
  });
});
