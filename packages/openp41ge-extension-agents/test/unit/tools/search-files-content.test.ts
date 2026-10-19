/**
 * search_files tool — what it finds. `query` matches file paths within a
 * worktree (a substring); `content` finds text inside files (plain or
 * `regex`; smart case: exact when it has a capital letter, else any case,
 * `caseSensitive` overriding), reported as `path:line: text`; both together
 * search the content of the files whose path matches. Results are grouped
 * under a heading per worktree (`# <repo> @ <branch> — <folder>`, the folder
 * alone when the repo is not known) and their paths are relative to it.
 * Matches are capped per file and in total, and the cap says how to narrow
 * the search; a search with no match says what it searched (the text, the
 * case it matched, how many files, the path filter). Files git ignores
 * (`.gitignore`, at any level), binary files and very large files are not
 * searched; the large files skipped are named.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import searchFilesTool from "@openp41ge-extension-agents/tools/search-files";

let root: string;

/** Write a file under the root; returns its path relative to the root. */
function write(rel: string, text: string | Buffer): string {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  return rel;
}

const search = (args: Record<string, unknown>) =>
  searchFilesTool.execute(args, { cwd: root, roots: [root] });

/** The result's lines under the root's heading. */
async function found(args: Record<string, unknown>): Promise<string[]> {
  const r = await search(args);
  expect(r.error).toBeUndefined();
  const lines = r.content.split("\n");
  expect(lines[0]).toBe(`# ${root}`);
  return lines.slice(1);
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "search-files-content-")));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("search_files", () => {
  it("is described as matching paths with query and file text with content", () => {
    expect(searchFilesTool.description).toMatch(/path/i);
    expect(searchFilesTool.description).toMatch(/content/i);
    const props = searchFilesTool.parameters.properties as Record<string, unknown>;
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining(["query", "content", "regex", "caseSensitive", "roots", "maxResults"]),
    );
    expect(searchFilesTool.parameters.required ?? []).toEqual([]);
    expect(searchFilesTool.description).toMatch(/query is optional/i);
    expect(searchFilesTool.description).toMatch(/several .* at once.*\|/i);
  });

  it("matches paths with query only, as before", async () => {
    const a = write("src/chat/agents-chat.ts", "x");
    write("src/other.ts", "x");
    expect(await found({ query: "chat/agents" })).toEqual([a]);
  });

  it("matches query against the path within the worktree, not the folder above it", async () => {
    write("a.ts", "x");
    expect((await search({ query: path.basename(root) })).content).toBe("(no matching files)");
  });

  it("finds text inside files with content, as path:line: text", async () => {
    const a = write(
      "src/a.ts",
      "const x = 1;\n  private _renderMessage(msg) {\n}\nthis._renderMessage(m);\n",
    );
    write("src/b.ts", "nothing here\n");
    expect(await found({ content: "_renderMessage" })).toEqual([
      `${a}:2:   private _renderMessage(msg) {`,
      `${a}:4: this._renderMessage(m);`,
    ]);
  });

  it("ignores case when content is all lower case, and matches it exactly with a capital", async () => {
    const a = write("a.ts", "TODO: x\nautoDownload\ntodo\n");
    expect(await found({ content: "todo" })).toEqual([
      `${a}:1: TODO: x`,
      `${a}:2: autoDownload`,
      `${a}:3: todo`,
    ]);
    expect(await found({ content: "TODO" })).toEqual([`${a}:1: TODO: x`]);
  });

  it("lets caseSensitive override smart case either way", async () => {
    const a = write("a.ts", "Hello\nhello\n");
    expect(await found({ content: "hello", caseSensitive: true })).toEqual([`${a}:2: hello`]);
    expect(await found({ content: "HELLO", caseSensitive: false })).toEqual([
      `${a}:1: Hello`,
      `${a}:2: hello`,
    ]);
  });

  it("treats content as a regular expression with regex", async () => {
    const a = write("a.ts", "role === 'user'\nrole === \"system\"\nrole\n");
    expect(await found({ content: "role === .(user|system)", regex: true })).toEqual([
      `${a}:1: role === 'user'`,
      `${a}:2: role === "system"`,
    ]);
    // Without regex, the same text is searched literally.
    expect((await search({ content: "role === .(user|system)" })).content).toBe(
      '(no matches for "role === .(user|system)" (any case) in 1 file)',
    );
  });

  it("reports a bad regular expression", async () => {
    write("a.ts", "x");
    const r = await search({ content: "(unclosed", regex: true });
    expect(r.error).toMatch(/regular expression/);
  });

  it("searches only the files whose path matches query when both are given", async () => {
    write("src/chat/a.ts", "needle\n");
    const b = write("src/views/b.ts", "needle\n");
    expect(await found({ query: "views", content: "needle" })).toEqual([`${b}:1: needle`]);
  });

  it("needs query or content", async () => {
    expect((await search({})).error).toMatch(/query.*content/);
  });

  it("says what it searched when nothing matched", async () => {
    write("src/a.ts", "x\n");
    write("src/b.ts", "x\n");
    write("docs/c.md", "x\n");
    expect((await search({ content: "missing" })).content).toBe(
      '(no matches for "missing" (any case) in 3 files)',
    );
    expect((await search({ content: "TODO" })).content).toBe(
      '(no matches for "TODO" (exact case) in 3 files)',
    );
    expect((await search({ query: "src", content: "TODO" })).content).toBe(
      '(no matches for "TODO" (exact case) in 2 files whose path contains "src")',
    );
    expect((await search({ content: "to+do", regex: true })).content).toBe(
      "(no matches for /to+do/ (any case) in 3 files)",
    );
    expect((await search({ query: "missing" })).content).toBe("(no matching files)");
  });

  it("says when no file's path matched the content search's query", async () => {
    write("a.ts", "x\n");
    expect((await search({ query: "nowhere", content: "x" })).content).toBe(
      '(no files whose path contains "nowhere"; nothing searched)',
    );
  });

  it("caps matches per file and says how many more there are", async () => {
    const a = write("a.ts", Array.from({ length: 30 }, (_, i) => `hit ${i + 1}`).join("\n"));
    const lines = await found({ content: "hit" });
    expect(lines).toHaveLength(21);
    expect(lines[19]).toBe(`${a}:20: hit 20`);
    expect(lines[20]).toBe(`${a}: 10 more matches in this file`);
  });

  it("stops at maxResults matches and says how to narrow it", async () => {
    for (let i = 0; i < 5; i++) write(`f${i}.ts`, "hit\nhit\n");
    const r = await search({ content: "hit", maxResults: 3 });
    const lines = r.content!.split("\n");
    expect(lines.filter((l) => /:\d+: hit$/.test(l))).toHaveLength(3);
    expect(lines.at(-1)).toMatch(/stopped at 3 matches.*narrow/);
  });

  it("cuts a very long matching line", async () => {
    const a = write("min.js", `${"x".repeat(1000)}needle${"y".repeat(1000)}`);
    const [line] = await found({ content: "needle" });
    expect(line.startsWith(`${a}:1: `)).toBe(true);
    expect(line.length).toBeLessThan(500);
    expect(line).toContain("needle");
  });

  it("does not search files git ignores, at any level", async () => {
    write(".gitignore", "*.log\nbuild/\n");
    write("pkg/.gitignore", "generated.ts\n");
    write("debug.log", "needle\n");
    write("build/out.js", "needle\n");
    write("pkg/generated.ts", "needle\n");
    const kept = write("pkg/kept.ts", "needle\n");
    expect(await found({ content: "needle" })).toEqual([`${kept}:1: needle`]);
    expect((await search({ query: "generated" })).content).toBe("(no matching files)");
  });

  it("skips binary files and files over 1 MB, and says it did", async () => {
    write("img.png", Buffer.from([0x89, 0x50, 0x00, 0x6e, 0x65, 0x65, 0x64, 0x6c, 0x65]));
    write("big.txt", `needle\n${"x".repeat(1024 * 1024)}`);
    const a = write("a.ts", "needle\n");
    expect(await found({ content: "needle" })).toEqual([
      `${a}:1: needle`,
      "(skipped 1 file over 1 MB: big.txt)",
    ]);
  });

  it("names up to five large files it skipped", async () => {
    const big = "x".repeat(1024 * 1024 + 1);
    for (let i = 1; i <= 7; i++) write(`big${i}.txt`, big);
    expect((await search({ content: "needle" })).content.split("\n")).toEqual([
      '(no matches for "needle" (any case) in 0 files)',
      "(skipped 7 files over 1 MB: big1.txt, big2.txt, big3.txt, big4.txt, big5.txt, …)",
    ]);
  });

  it("heads each worktree's results with its repo, branch and folder", async () => {
    const main = path.join(root, "repo", "main");
    const feature = path.join(root, "repo", "feature");
    for (const dir of [main, feature]) {
      fs.mkdirSync(path.join(dir, "src"), { recursive: true });
      fs.writeFileSync(path.join(dir, "src", "a.ts"), "needle\n");
    }
    fs.writeFileSync(path.join(feature, "src", "b.ts"), "needle\n");
    const r = await searchFilesTool.execute(
      { content: "needle" },
      {
        cwd: root,
        roots: [main, feature],
        worktrees: [
          { repo: "github.com/a/app", branch: "main", path: main },
          { repo: "github.com/a/app", branch: "feature", path: feature },
        ],
      },
    );
    expect(r.content.split("\n")).toEqual([
      `# github.com/a/app @ main — ${main}`,
      "src/a.ts:1: needle",
      `# github.com/a/app @ feature — ${feature}`,
      "src/a.ts:1: needle",
      "src/b.ts:1: needle",
    ]);
  });

  it("keeps paths relative to the worktree when searching a folder inside it", async () => {
    const a = write("pkg/src/a.ts", "needle\n");
    write("other/b.ts", "needle\n");
    const r = await searchFilesTool.execute(
      { content: "needle", roots: [path.join(root, "pkg")] },
      { cwd: root, roots: [root] },
    );
    expect(r.content.split("\n")).toEqual([`# ${root}`, `${a}:1: needle`]);
  });
});
