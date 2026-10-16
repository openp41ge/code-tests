// @vitest-environment node
/**
 * Unit tests for the open palette's new file / new folder: created inside one
 * of the workspace's worktrees only, with missing parent folders, never
 * overwriting what is there.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInRoots } from "@openp41ge/main/services/palette-file-create";

let dir: string;
let root: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "palette-create-"));
  root = join(dir, "wt");
  await import("node:fs/promises").then((fs) => fs.mkdir(root));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("createInRoots", () => {
  it("creates an empty file, with its missing folders", async () => {
    const target = join(root, "a", "b", "new.ts");
    expect(await createInRoots([root], target, "file")).toEqual({ ok: true, path: target });
    expect(await readFile(target, "utf-8")).toBe("");
  });

  it("creates a folder", async () => {
    const target = join(root, "x", "y");
    expect(await createInRoots([root], target, "folder")).toEqual({ ok: true, path: target });
    expect((await stat(target)).isDirectory()).toBe(true);
  });

  it("refuses a path outside the worktrees", async () => {
    const result = await createInRoots([root], join(dir, "outside.ts"), "file");
    expect(result.ok).toBe(false);
    const sneaky = await createInRoots([root], join(root, "..", "outside.ts"), "file");
    expect(sneaky.ok).toBe(false);
  });

  it("refuses the worktree itself", async () => {
    expect((await createInRoots([root], root, "folder")).ok).toBe(false);
  });

  it("never overwrites a file", async () => {
    const target = join(root, "there.ts");
    await writeFile(target, "keep");
    const result = await createInRoots([root], target, "file");
    expect(result).toEqual({ ok: false, error: `${target} already exists` });
    expect(await readFile(target, "utf-8")).toBe("keep");
  });

  it("refuses a folder that already exists", async () => {
    expect((await createInRoots([root], join(root), "folder")).ok).toBe(false);
    await import("node:fs/promises").then((fs) => fs.mkdir(join(root, "d")));
    expect(await createInRoots([root], join(root, "d"), "folder")).toEqual({
      ok: false,
      error: `${join(root, "d")} already exists`,
    });
  });
});
