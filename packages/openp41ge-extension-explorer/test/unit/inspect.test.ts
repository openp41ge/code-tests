/**
 * Unit tests for the Explorer extension's file-open gate.
 */
import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  inspectFile,
  isWithinRoot,
  looksBinary,
} from "@openp41ge-extension-explorer/inspect";
import { MAX_OPEN_FILE_BYTES } from "@openp41ge-extension-explorer/inspect";

describe("isWithinRoot", () => {
  it("accepts the root itself and children, rejects siblings", () => {
    expect(isWithinRoot("/w", "/w")).toBe(true);
    expect(isWithinRoot("/w/a/b.txt", "/w")).toBe(true);
    expect(isWithinRoot("/other/a.txt", "/w")).toBe(false);
  });
});

describe("looksBinary", () => {
  it("detects NUL bytes", () => {
    expect(looksBinary(new Uint8Array([65, 0, 66]))).toBe(true);
    expect(looksBinary(new Uint8Array([65, 66, 67]))).toBe(false);
  });
});

describe("inspectFile", () => {
  it("opens a text file inside the workspace root", async () => {
    const root = await mkdtemp(join(tmpdir(), "ext-inspect-ok-"));
    try {
      const file = join(root, "hello.txt");
      await writeFile(file, "hello world");
      const result = await inspectFile(file, root);
      expect(result.ok).toBe(true);
      expect(result.path).toBe(file);
      expect(result.name).toBe("hello.txt");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects paths outside the workspace root", async () => {
    const root = await mkdtemp(join(tmpdir(), "ext-inspect-root-"));
    const outside = await mkdtemp(join(tmpdir(), "ext-inspect-out-"));
    try {
      await writeFile(join(outside, "secret.txt"), "secret");
      const result = await inspectFile(join(outside, "secret.txt"), root);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("outside");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects missing files, directories, and binary files", async () => {
    const root = await mkdtemp(join(tmpdir(), "ext-inspect-misc-"));
    try {
      const missing = await inspectFile(join(root, "nope.txt"), root);
      expect(missing.ok).toBe(false);

      await mkdir(join(root, "dir"));
      const isDir = await inspectFile(join(root, "dir"), root);
      expect(isDir.ok).toBe(false);
      expect(isDir.error).toContain("Not a regular file");

      const binary = join(root, "bin.dat");
      await writeFile(binary, Buffer.from([0, 1, 2, 255]));
      const bin = await inspectFile(binary, root);
      expect(bin.ok).toBe(false);
      expect(bin.error).toContain("binary");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects files larger than the open limit", async () => {
    const root = await mkdtemp(join(tmpdir(), "ext-inspect-big-"));
    try {
      const big = join(root, "big.bin");
      const buf = Buffer.alloc(MAX_OPEN_FILE_BYTES + 1, 65);
      await writeFile(big, buf);
      const result = await inspectFile(big, root);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("too large");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
