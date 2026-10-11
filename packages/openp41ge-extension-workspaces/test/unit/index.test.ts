import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  beginExtensionScope,
  endExtensionScope,
  getScopedProcesses,
} from "openp41ge-core-extension-host/scope";

type ProcFn = (payload: Record<string, unknown>) => Promise<unknown>;

let dir: string;
let procs: ReadonlyMap<string, ProcFn> | null = null;
let mod: {
  listWorkspaces: (dir: string) => Promise<unknown[]>;
  confineToDir: (dir: string, p: string) => string | null;
  listWorkspacesProcess: ProcFn;
  readWorkspaceProcess: ProcFn;
  writeWorkspaceProcess: ProcFn;
  createWorkspaceProcess: ProcFn;
  deleteWorkspaceProcess: ProcFn;
};

/** Create a throwaway git repo with one commit and return its path. */
async function makeSourceRepo(root: string): Promise<string> {
  const repo = path.join(root, "source");
  execFileSync("git", ["init", "-q", repo]);
  execFileSync("git", ["-C", repo, "config", "user.email", "t@t.io"]);
  execFileSync("git", ["-C", repo, "config", "user.name", "t"]);
  await fs.writeFile(path.join(repo, "README.md"), "# repo\n");
  execFileSync("git", ["-C", repo, "add", "README.md"]);
  execFileSync("git", ["-C", repo, "commit", "-q", "-m", "init"]);
  return repo;
}

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "openp41ge-ws-"));
  beginExtensionScope("openp41ge-extension-workspaces", "0.1.0");
  try {
    mod = await import(
      "@openp41ge-extension-workspaces/index"
    ) as unknown as typeof mod;
    procs = getScopedProcesses() as ReadonlyMap<string, ProcFn> | null;
  } finally {
    endExtensionScope();
  }
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("backend registration", () => {
  it("registers the workspace-file processes when the module loads", () => {
    expect(procs).not.toBeNull();
    for (const cmd of ["list", "read", "write", "create", "delete"]) {
      expect(procs!.has(cmd)).toBe(true);
    }
  });

  it("does not clone or delete repositories itself (the platform owns clones)", () => {
    expect(procs!.has("clone")).toBe(false);
    expect(procs!.has("removeRepoData")).toBe(false);
  });
});

describe("listWorkspaces / processes", () => {
  it("lists empty dir as []; create/list/read/write/delete round-trips", async () => {
    expect(await mod.listWorkspaces(dir)).toEqual([]);

    // create
    const created = await mod.createWorkspaceProcess({ dir, name: "Demo" });
    expect(created.ok).toBe(true);
    const entry = created.entry!;
    expect(entry.filePath.endsWith(".openp41ge-workspace")).toBe(true);
    expect(entry.data.name).toBe("Demo");

    // list
    const listed = await mod.listWorkspaces(dir);
    expect(listed).toHaveLength(1);
    expect(listed[0].data.name).toBe("Demo");

    // read
    const read = await mod.readWorkspaceProcess({ dir, path: entry.filePath });
    expect(read.ok).toBe(true);
    expect(read.entry!.data.id).toBe(entry.data.id);

    // write (rename)
    const write = await mod.writeWorkspaceProcess({
      dir,
      path: entry.filePath,
      data: { ...entry.data, name: "Renamed" },
    });
    expect(write.ok).toBe(true);
    const reread = await mod.readWorkspaceProcess({ dir, path: entry.filePath });
    expect(reread.entry!.data.name).toBe("Renamed");

    // delete
    const del = await mod.deleteWorkspaceProcess({ dir, path: entry.filePath });
    expect(del.ok).toBe(true);
    expect(await mod.listWorkspaces(dir)).toEqual([]);
  });

  it("write keeps the layout session already on disk (a workspace window saves it)", async () => {
    const file = path.join(dir, "session.openp41ge-workspace");
    const onDisk = {
      id: "s",
      name: "S",
      version: 2,
      createdAt: "",
      dataDir: "",
      repos: [],
      windows: [{ id: "saved-by-window" }],
    };
    await fs.writeFile(file, JSON.stringify(onDisk));
    const write = await mod.writeWorkspaceProcess({
      dir,
      path: file,
      data: { ...onDisk, name: "Edited", windows: [{ id: "stale-in-editor" }] },
    });
    expect(write.ok).toBe(true);
    const written = JSON.parse(await fs.readFile(file, "utf-8"));
    expect(written.name).toBe("Edited");
    expect(written.windows).toEqual([{ id: "saved-by-window" }]);
    await fs.rm(file);
  });

  it("rejects paths that escape the workspaces directory", async () => {
    const outside = path.join(path.dirname(dir), "..", "escape.openp41ge-workspace");
    const read = await mod.readWorkspaceProcess({ dir, path: outside });
    expect(read.ok).toBe(false);
    const write = await mod.writeWorkspaceProcess({
      dir,
      path: outside,
      data: { id: "x", version: 2, createdAt: "", dataDir: "", repos: [] },
    });
    expect(write.ok).toBe(false);
    const del = await mod.deleteWorkspaceProcess({ dir, path: outside });
    expect(del.ok).toBe(false);
  });
});

describe("confineToDir", () => {
  it("allows a path inside the dir and rejects escapes", () => {
    expect(mod.confineToDir("/a/b", "/a/b/c.openp41ge-workspace")).toBeTruthy();
    expect(mod.confineToDir("/a/b", "/a/bc/x")).toBeNull();
    expect(mod.confineToDir("/a/b", "/a/b/../x")).toBeNull();
  });
});

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
