// @vitest-environment node
/**
 * Unit tests for the real command process (`NodeCommandProcess`): a binary
 * runs with its argument list and no shell, in the given folder and env,
 * with stdin closed; stdout and stderr stream in order; output past the cap
 * is dropped; a timeout stops it; a missing binary is reported, not thrown.
 * And the runs file (`FileCommandRunStore`): a workspace's runs read back
 * after a restart, empty when missing or corrupt.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeCommandProcess } from "@openp41ge/main/services/command-process";
import { FileCommandRunStore } from "@openp41ge/main/services/command-run-store";
import type { CommandRun } from "@openp41ge/main/services/command-service";

let dir: string;
beforeEach(async () => {
  dir = realpathSync(await mkdtemp(join(tmpdir(), "command-process-")));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const node = process.execPath;
const opts = (over: Record<string, unknown> = {}) => {
  const chunks: string[] = [];
  return {
    chunks,
    opts: {
      cwd: dir,
      env: { ...process.env, MARK: "m1" },
      timeoutMs: 10_000,
      maxOutputBytes: 1024 * 1024,
      onOutput: (c: string) => chunks.push(c),
      ...over,
    },
  };
};

describe("NodeCommandProcess", () => {
  const proc = new NodeCommandProcess();

  it("runs with the argument list, in the folder and env, and streams its output", async () => {
    const { chunks, opts: o } = opts();
    const r = await proc.run(
      node,
      [
        "-e",
        "process.stdout.write(process.cwd() + ' ' + process.env.MARK + ' ' + process.argv[1])",
        "a b; echo x",
      ],
      o,
    );
    expect(r).toEqual({
      exitCode: 0,
      timedOut: false,
      notFound: false,
      output: `${dir} m1 a b; echo x`,
      truncated: false,
    });
    expect(chunks.join("")).toBe(r.output);
  });

  it("closes stdin, so a read ends at once", async () => {
    const { opts: o } = opts();
    const r = await proc.run(
      node,
      ["-e", "let n=0;process.stdin.on('data',d=>n+=d.length).on('end',()=>console.log('end',n))"],
      o,
    );
    expect(r.output.trim()).toBe("end 0");
  });

  it("keeps stderr with stdout and passes the exit code on", async () => {
    const { opts: o } = opts();
    const r = await proc.run(node, ["-e", "console.error('bad'); process.exit(3)"], o);
    expect(r.exitCode).toBe(3);
    expect(r.output).toContain("bad");
  });

  it("drops output past the cap", async () => {
    const { chunks, opts: o } = opts({ maxOutputBytes: 10 });
    const r = await proc.run(node, ["-e", "process.stdout.write('x'.repeat(5000))"], o);
    expect(r.output).toBe("x".repeat(10));
    expect(r.truncated).toBe(true);
    expect(chunks.join("")).toBe("x".repeat(10));
  });

  it("stops a run that takes longer than the timeout", async () => {
    const { opts: o } = opts({ timeoutMs: 200 });
    const r = await proc.run(node, ["-e", "setTimeout(() => {}, 10000)"], o);
    expect(r).toMatchObject({ exitCode: null, timedOut: true });
  });

  it("reports a binary that does not exist", async () => {
    const { opts: o } = opts();
    const r = await proc.run("openp41ge-no-such-binary", [], o);
    expect(r).toMatchObject({ exitCode: null, notFound: true, timedOut: false });
  });
});

const run = (runId: string): CommandRun => ({
  runId,
  binary: "git",
  args: ["log"],
  repo: "github.com/a/app",
  worktree: "main",
  by: "you",
  startedAt: 1,
  endedAt: 2,
  state: "done",
  exitCode: 0,
  output: "x",
  truncated: false,
});

describe("FileCommandRunStore", () => {
  it("is empty without a file", () => {
    expect(new FileCommandRunStore(() => join(dir, "runs.json")).list("ws1")).toEqual([]);
  });

  it("saves a workspace's runs to its file and reads them back", () => {
    const fileFor = (id: string) => join(dir, id, "command-runs.json");
    new FileCommandRunStore(fileFor).save("ws1", [run("a"), run("b")]);
    const again = new FileCommandRunStore(fileFor);
    expect(again.list("ws1").map((r) => r.runId)).toEqual(["a", "b"]);
    expect(again.list("ws2")).toEqual([]);
  });

  it("is empty when the file is corrupt", async () => {
    await writeFile(join(dir, "runs.json"), "{nope");
    expect(new FileCommandRunStore(() => join(dir, "runs.json")).list("ws1")).toEqual([]);
  });

  it("marks a run that was still running when saved as ended", () => {
    const store = new FileCommandRunStore(() => join(dir, "runs.json"));
    store.save("ws1", [{ ...run("a"), state: "running", endedAt: null, exitCode: null }]);
    expect(store.list("ws1")[0]).toMatchObject({
      state: "done",
      error: "the app closed while it ran",
    });
  });
});
