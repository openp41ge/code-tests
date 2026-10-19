/**
 * read_file tool — reading by lines. A read is a range of lines
 * (`startLine`, 1-based, and `lineCount`), each numbered, under a header
 * naming the range and the file's length; a read that stops early (the line
 * count, or the size cap) says where to continue. Very long lines are cut;
 * a binary file is refused; a start past the end says how long the file is.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import readFileTool from "@openp41ge-extension-agents/tools/read-file";

let root: string;

function write(rel: string, text: string | Buffer): string {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  return p;
}

const read = (args: Record<string, unknown>) =>
  readFileTool.execute(args, { cwd: root, roots: [root] });

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "read-file-lines-")));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("read_file", () => {
  it("is described with line-based parameters", () => {
    const props = readFileTool.parameters.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(["lineCount", "path", "startLine"]);
    expect(readFileTool.description).toMatch(/line/i);
  });

  it("reads a whole small file, numbered, under a header", async () => {
    const p = write("a.ts", "alpha\nbeta\ngamma\n");
    const r = await read({ path: p });
    expect(r.error).toBeUndefined();
    expect(r.content).toBe(`${p}: lines 1-3 of 3\n1\talpha\n2\tbeta\n3\tgamma`);
  });

  it("reads a range of lines", async () => {
    const p = write("a.ts", lines(10));
    const r = await read({ path: p, startLine: 4, lineCount: 3 });
    expect(r.content).toBe(
      `${p}: lines 4-6 of 10\n4\tline 4\n5\tline 5\n6\tline 6\n(continue with startLine 7)`,
    );
  });

  it("reads up to 400 lines by default and says where to continue", async () => {
    const p = write("a.ts", lines(1000));
    const out = (await read({ path: p })).content!.split("\n");
    expect(out[0]).toBe(`${p}: lines 1-400 of 1000`);
    expect(out[400]).toBe("400\tline 400");
    expect(out.at(-1)).toBe("(continue with startLine 401)");
  });

  it("stops at the size cap before the line count, and says where to continue", async () => {
    const long = "x".repeat(900);
    const p = write("a.ts", Array.from({ length: 200 }, () => long).join("\n"));
    const out = (await read({ path: p, lineCount: 200 })).content!.split("\n");
    const shown = out.filter((l) => /^\d+\t/.test(l)).length;
    expect(shown).toBeGreaterThan(10);
    expect(shown).toBeLessThan(200);
    expect(out[0]).toBe(`${p}: lines 1-${shown} of 200`);
    expect(out.at(-1)).toBe(`(continue with startLine ${shown + 1})`);
  });

  it("cuts a very long line and says so", async () => {
    const p = write("min.js", "a".repeat(5000));
    const out = (await read({ path: p })).content!.split("\n");
    expect(out[1].length).toBeLessThan(1100);
    expect(out[1]).toMatch(/^1\ta+… \(line cut: 5000 characters\)$/);
  });

  it("says how long the file is when startLine is past the end", async () => {
    const p = write("a.ts", lines(5));
    expect((await read({ path: p, startLine: 9 })).error).toMatch(/past the end.*5 lines/);
  });

  it("reads an empty file", async () => {
    const p = write("e.ts", "");
    expect((await read({ path: p })).content).toBe(`${p}: empty file`);
  });

  it("refuses a binary file", async () => {
    const p = write("img.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]));
    expect((await read({ path: p })).error).toMatch(/binary/);
  });

  it("keeps line numbers right across Windows line endings", async () => {
    const p = write("w.ts", "one\r\ntwo\r\n");
    expect((await read({ path: p })).content).toBe(`${p}: lines 1-2 of 2\n1\tone\n2\ttwo`);
  });
});
