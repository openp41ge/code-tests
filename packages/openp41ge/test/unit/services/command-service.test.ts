// @vitest-environment node
/**
 * Unit tests for the platform's command service (the scoped terminal's
 * engine): which extension's definition of a binary applies (the user's
 * pick, else an official extension's, else the only one), the binary's rules
 * checked before anything runs, the run in the worktree with the env that
 * keeps it non-interactive, the output cap and timeout, and the record of
 * each run per workspace (live while it runs, read back by id).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  CommandService,
  COMMAND_ENV,
  PROMPT_RUNNER,
  type CommandProcess,
  type CommandProcessOptions,
  type CommandProcessResult,
  type CommandRun,
  type CommandRunStore,
  type CommandScope,
} from "@openp41ge/main/services/command-service";
import type { HostCommandBinary } from "openp41ge-core-extension-host";

class MemoryRunStore implements CommandRunStore {
  readonly runs = new Map<string, CommandRun[]>();
  list(workspaceId: string): CommandRun[] {
    return this.runs.get(workspaceId) ?? [];
  }
  save(workspaceId: string, runs: readonly CommandRun[]): void {
    this.runs.set(workspaceId, [...runs]);
  }
}

class FakeProcess implements CommandProcess {
  calls: { file: string; args: readonly string[]; opts: CommandProcessOptions }[] = [];
  next: Partial<CommandProcessResult> & { chunks?: string[] } = {};
  async run(
    file: string,
    args: readonly string[],
    opts: CommandProcessOptions,
  ): Promise<CommandProcessResult> {
    this.calls.push({ file, args, opts });
    const chunks = this.next.chunks ?? ["out\n"];
    for (const c of chunks) opts.onOutput(c);
    return {
      exitCode: 0,
      timedOut: false,
      notFound: false,
      output: chunks.join(""),
      truncated: false,
      ...this.next,
    };
  }
}

const GIT: HostCommandBinary = {
  extensionId: "openp41ge-extension-git",
  binary: "git",
  label: "Git",
  rules: { allow: ["log **", "status **"], deny: ["** --output*"] },
};

let binaries: HostCommandBinary[];
let chosen: Record<string, string>;
let official: Set<string>;
let proc: FakeProcess;
let store: MemoryRunStore;
let events: { workspaceId: string; run: CommandRun }[];
let service: CommandService;
let ids: number;

const scope: CommandScope = {
  workspaceId: "ws1",
  worktreePath: async (repo, worktree) =>
    repo === "github.com/a/app" && worktree === "main" ? "/repos/github.com/a/app/main" : null,
};
const req = (args: string[], over: Partial<{ binary: string; worktree: string }> = {}) => ({
  binary: "git",
  args,
  repo: "github.com/a/app",
  worktree: "main",
  ...over,
});

beforeEach(() => {
  binaries = [GIT];
  chosen = {};
  official = new Set(["openp41ge-extension-git"]);
  proc = new FakeProcess();
  store = new MemoryRunStore();
  events = [];
  ids = 0;
  service = new CommandService({
    binaries: () => binaries,
    chosen: () => chosen,
    isOfficial: (id) => official.has(id),
    limits: () => ({
      timeoutMs: 60_000,
      maxOutputBytes: 256 * 1024,
      agentMaxOutputBytes: 32 * 1024,
    }),
    process: proc,
    store,
    onRun: (workspaceId, run) => events.push({ workspaceId, run }),
    newId: () => `r${++ids}`,
    now: () => 1000 + ids,
  });
});

describe("CommandService.binaries", () => {
  it("lists each defined binary with its rules", () => {
    expect(service.binaries()).toEqual([
      {
        binary: "git",
        label: "Git",
        extensionId: "openp41ge-extension-git",
        allow: ["log **", "status **"],
        deny: ["** --output*"],
      },
    ]);
  });

  it("leaves out a binary whose rules are malformed", () => {
    binaries = [{ ...GIT, rules: null }];
    expect(service.binaries()).toEqual([]);
  });

  it("picks the official definition when two extensions define a binary", () => {
    binaries = [{ ...GIT, extensionId: "x", label: "X git" }, GIT];
    expect(service.binaries().map((b) => b.extensionId)).toEqual(["openp41ge-extension-git"]);
  });

  it("picks the user's choice over the official one", () => {
    binaries = [GIT, { ...GIT, extensionId: "x", label: "X git" }];
    chosen = { git: "x" };
    expect(service.binaries().map((b) => b.label)).toEqual(["X git"]);
  });

  it("leaves a binary off when two non-official extensions define it and none is chosen", () => {
    official = new Set();
    binaries = [GIT, { ...GIT, extensionId: "x" }];
    expect(service.binaries()).toEqual([]);
    expect(service.conflicts()).toEqual([
      { binary: "git", extensionIds: ["openp41ge-extension-git", "x"], chosen: null },
    ]);
  });

  it("ignores a choice of an extension that does not define the binary", () => {
    chosen = { git: "gone" };
    expect(service.binaries().map((b) => b.extensionId)).toEqual(["openp41ge-extension-git"]);
  });
});

describe("CommandService.run", () => {
  it("runs an allowed line in the worktree, non-interactively, and records it", async () => {
    const result = await service.run(scope, req(["log", "-3"]), "openp41ge-extension-agents");
    expect(result).toEqual({
      ok: true,
      exitCode: 0,
      output: "out\n",
      truncated: false,
      runId: "r1",
    });
    expect(proc.calls).toHaveLength(1);
    const { file, args, opts } = proc.calls[0];
    expect(file).toBe("git");
    expect(args).toEqual(["log", "-3"]);
    expect(opts.cwd).toBe("/repos/github.com/a/app/main");
    expect(opts.env).toMatchObject(COMMAND_ENV);
    expect(COMMAND_ENV).toMatchObject({
      GIT_PAGER: "cat",
      PAGER: "cat",
      GIT_EDITOR: "false",
      EDITOR: "false",
      GIT_TERMINAL_PROMPT: "0",
      LESSSECURE: "1",
    });
    expect(opts.timeoutMs).toBe(60_000);
    expect(opts.maxOutputBytes).toBe(32 * 1024);
    expect(store.list("ws1")).toEqual([
      expect.objectContaining({
        runId: "r1",
        binary: "git",
        args: ["log", "-3"],
        repo: "github.com/a/app",
        worktree: "main",
        by: "openp41ge-extension-agents",
        state: "done",
        exitCode: 0,
        output: "out\n",
      }),
    ]);
  });

  it("tells listeners when a run starts, prints and ends", async () => {
    proc.next = { chunks: ["a", "b"] };
    await service.run(scope, req(["status"]), "you");
    expect(events.map((e) => [e.workspaceId, e.run.state, e.run.output])).toEqual([
      ["ws1", "running", ""],
      ["ws1", "running", "a"],
      ["ws1", "running", "ab"],
      ["ws1", "done", "ab"],
    ]);
  });

  it("refuses a line the rules do not allow, without running or recording it", async () => {
    const r = await service.run(scope, req(["push"]), "you");
    expect(r).toMatchObject({ ok: false, exitCode: null, runId: "", output: "" });
    expect(r.error).toMatch(/git push.*not allowed.*no allow rule matches/);
    const denied = await service.run(scope, req(["log", "--output=/tmp/x"]), "you");
    expect(denied.error).toMatch(/denied by '\*\* --output\*'/);
    expect(proc.calls).toHaveLength(0);
    expect(store.list("ws1")).toEqual([]);
  });

  it("refuses a binary nothing defines, a missing worktree, and no workspace", async () => {
    expect((await service.run(scope, req(["-n"], { binary: "sed" }), "you")).error).toMatch(
      /sed.*not defined/,
    );
    expect((await service.run(scope, req(["log"], { worktree: "nope" }), "you")).error).toMatch(
      /nope.*not a checked-out worktree/,
    );
    expect((await service.run(null, req(["log"]), "you")).error).toMatch(/workspace/);
    expect(proc.calls).toHaveLength(0);
  });

  it("refuses arguments that are not strings", async () => {
    const r = await service.run(scope, { ...req([]), args: ["log", 3 as never] }, "you");
    expect(r.error).toMatch(/strings/);
  });

  it("reports a failing exit, a timeout and a missing binary", async () => {
    proc.next = { exitCode: 2, chunks: ["fatal: bad\n"] };
    const failed = await service.run(scope, req(["log"]), "you");
    expect(failed).toMatchObject({ ok: false, exitCode: 2, output: "fatal: bad\n" });
    expect(failed.error).toMatch(/exited with 2/);

    proc.next = { exitCode: null, timedOut: true };
    expect((await service.run(scope, req(["log"]), "you")).error).toMatch(/60 s/);

    proc.next = { exitCode: null, notFound: true, chunks: [] };
    expect((await service.run(scope, req(["log"]), "you")).error).toMatch(/git.*not found/);
  });

  it("caps what a run prints at the prompt's cap for you, and the smaller agent cap for others", async () => {
    await service.run(scope, req(["log"]), PROMPT_RUNNER);
    await service.run(scope, req(["log"]), "openp41ge-extension-agents");
    expect(proc.calls.map((c) => c.opts.maxOutputBytes)).toEqual([256 * 1024, 32 * 1024]);
  });

  it("passes on a cut output", async () => {
    proc.next = { truncated: true };
    expect((await service.run(scope, req(["log"]), "you")).truncated).toBe(true);
  });
});

describe("CommandService runs", () => {
  it("lists a workspace's runs, newest first, filtered by binary and worktree", async () => {
    await service.run(scope, req(["log"]), "you");
    await service.run(scope, req(["status"]), "you");
    expect(service.runs("ws1", { binary: "git" }).map((r) => r.runId)).toEqual(["r2", "r1"]);
    expect(service.runs("ws1", { binary: "sed" })).toEqual([]);
    expect(service.runs("ws1", { binary: "git", repo: "github.com/a/app", worktree: "x" })).toEqual(
      [],
    );
    expect(service.runs("other", {})).toEqual([]);
  });

  it("finds a run by id", async () => {
    await service.run(scope, req(["log"]), "you");
    expect(service.getRun("ws1", "r1")?.args).toEqual(["log"]);
    expect(service.getRun("ws1", "nope")).toBeNull();
  });

  it("keeps the latest 200 runs of a workspace", async () => {
    for (let i = 0; i < 205; i++) await service.run(scope, req(["log"]), "you");
    const runs = store.list("ws1");
    expect(runs).toHaveLength(200);
    expect(service.runs("ws1", {})[0].runId).toBe("r205");
  });
});
