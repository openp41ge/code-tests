/**
 * Unit tests for the Explorer backend entry (`registerProcesses`).
 *
 * The backend self-registers at module load (`api: "0.2"`), so the module is
 * imported inside an extension scope (as the host does) and the registered
 * handlers are captured via `getScopedProcesses()`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  beginExtensionScope,
  endExtensionScope,
  getScopedProcesses,
} from "openp41ge-core-extension-host/scope";
import type { HandlerFn } from "openp41ge-sdk";

type Handlers = ReadonlyMap<string, HandlerFn>;

let handlers: Handlers | null = null;

beforeAll(async () => {
  beginExtensionScope("openp41ge-extension-explorer", "0.2.0");
  try {
    await import("@openp41ge-extension-explorer/index");
    // Capture inside the scope, before endExtensionScope clears it.
    handlers = getScopedProcesses();
  } finally {
    endExtensionScope();
  }
});

function getHandler(id: string): HandlerFn {
  const fn = handlers?.get(id);
  if (!fn) throw new Error(`handler "${id}" not registered (got: ${[...(handlers?.keys() ?? [])]})`);
  return fn;
}

describe("backend registration", () => {
  it("registers the read-dir, open-file, create-dir and write-file processes (unqualified short ids)", () => {
    expect(handlers?.has("read-dir")).toBe(true);
    expect(handlers?.has("open-file")).toBe(true);
    expect(handlers?.has("create-dir")).toBe(true);
    expect(handlers?.has("write-file")).toBe(true);
    // Commands are registered short; the host namespaces them.
    expect(handlers?.has("explorer/read-dir")).toBe(false);
  });

  it("read-dir lists a directory and returns an error envelope for missing paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "ext-explorer-readdir-"));
    try {
      await mkdir(join(root, "src"));
      await writeFile(join(root, "a.txt"), "a");

      const ok = (await getHandler("read-dir")({ path: root })) as {
        ok: boolean;
        entries?: Array<{ name: string; kind: string }>;
      };
      expect(ok.ok).toBe(true);
      expect(ok.entries?.map((e) => e.name)).toEqual(["src", "a.txt"]);

      const bad = (await getHandler("read-dir")({ path: join(root, "missing") })) as {
        ok: boolean;
        error?: string;
      };
      expect(bad.ok).toBe(false);
      expect(bad.error).toBeTruthy();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("read-dir errors when `path` is missing from the payload", async () => {
    const result = (await getHandler("read-dir")({})) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("create-dir creates a directory and never clobbers an existing path", async () => {
    const root = await mkdtemp(join(tmpdir(), "ext-createdir-"));
    try {
      const fn = getHandler("create-dir");
      const target = join(root, "newdir");
      const ok = (await fn({ path: target, root })) as { ok: boolean; error?: string };
      expect(ok.ok).toBe(true);
      expect(await stat(target).then((s) => s.isDirectory())).toBe(true);

      const dup = (await fn({ path: target, root })) as { ok: boolean; error?: string };
      expect(dup.ok).toBe(false);
      expect(dup.error).toBeTruthy();

      const out = (await fn({ path: join(root, "..", "evil"), root })) as {
        ok: boolean;
        error?: string;
      };
      expect(out.ok).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("write-file creates an empty file and rejects an existing one", async () => {
    const root = await mkdtemp(join(tmpdir(), "ext-writefile-"));
    try {
      const fn = getHandler("write-file");
      const target = join(root, "note.md");
      const ok = (await fn({ path: target, root })) as { ok: boolean; error?: string };
      expect(ok.ok).toBe(true);
      expect(await stat(target).then((s) => s.isFile())).toBe(true);

      const dup = (await fn({ path: target, root })) as { ok: boolean; error?: string };
      expect(dup.ok).toBe(false);

      const out = (await fn({ path: join(root, "..", "evil"), root })) as {
        ok: boolean;
        error?: string;
      };
      expect(out.ok).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("create-dir and write-file require `root` (path confinement)", async () => {
    const create = (await getHandler("create-dir")({ path: "/tmp/x" })) as {
      ok: boolean;
      error?: string;
    };
    expect(create.ok).toBe(false);
    const write = (await getHandler("write-file")({ path: "/tmp/x" })) as {
      ok: boolean;
      error?: string;
    };
    expect(write.ok).toBe(false);
  });

  it("open-file opens a text file inside the root and rejects files outside it", async () => {
    const root = await mkdtemp(join(tmpdir(), "ext-openfile-"));
    const outside = await mkdtemp(join(tmpdir(), "ext-openfile-out-"));
    try {
      await writeFile(join(root, "a.txt"), "a");
      const fn = getHandler("open-file");

      const ok = (await fn({ path: join(root, "a.txt"), root })) as {
        ok: boolean;
        path?: string;
        name?: string;
      };
      expect(ok.ok).toBe(true);
      expect(ok.name).toBe("a.txt");

      const missingRoot = (await fn({ path: join(root, "a.txt") })) as {
        ok: boolean;
        error?: string;
      };
      expect(missingRoot.ok).toBe(false);
      expect(missingRoot.error).toBeTruthy();

      const outsideFile = join(outside, "b.txt");
      await writeFile(outsideFile, "b");
      const bad = (await fn({ path: outsideFile, root })) as { ok: boolean; error?: string };
      expect(bad.ok).toBe(false);
      expect(bad.error).toContain("outside");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
