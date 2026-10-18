/**
 * The agent's `run_command` tool: runs a binary an extension defines, with
 * an argument list (no shell), in a worktree of the chat's workspace, through
 * the platform (`ctx.commands`, the scoped terminal). It answers with what
 * the command printed and how it ended; a refusal, a failure and a cut
 * output are said in-band; a run is named (`run`) so its tool call can open
 * it in a terminal.
 */
import { describe, it, expect } from "vitest";
import type { CommandRequest, CommandResult } from "openp41ge-sdk";
import { RUN_COMMAND_TOOL } from "@openp41ge-extension-agents/tools/run-command";
import type { ToolExecutionContext } from "@openp41ge-extension-agents/tools/types";

function ctxWith(result: Partial<CommandResult>) {
  const requests: CommandRequest[] = [];
  const ctx: ToolExecutionContext = {
    commands: {
      binaries: async () => [],
      run: async (request) => {
        requests.push(request);
        return { ok: true, exitCode: 0, output: "", truncated: false, runId: "r1", ...result };
      },
    },
  };
  return { ctx, requests };
}

const args = { binary: "git", args: ["log", "-1"], repo: "github.com/a/app", branch: "main" };

describe("run_command", () => {
  it("is described with its parameters", () => {
    expect(RUN_COMMAND_TOOL.name).toBe("run_command");
    expect(RUN_COMMAND_TOOL.parameters.required).toEqual(["binary", "args", "repo", "branch"]);
  });

  it("runs the binary with its arguments in the branch's worktree", async () => {
    const { ctx, requests } = ctxWith({ output: "abc First\n" });
    const r = await RUN_COMMAND_TOOL.execute(args, ctx);
    expect(requests).toEqual([
      { binary: "git", args: ["log", "-1"], repo: "github.com/a/app", worktree: "main" },
    ]);
    expect(r.error).toBeUndefined();
    expect(r.content).toBe("abc First\n\n[exit 0]");
    expect(r.run).toEqual({
      binary: "git",
      args: ["log", "-1"],
      repo: "github.com/a/app",
      worktree: "main",
      runId: "r1",
    });
  });

  it("says when there was no output", async () => {
    const { ctx } = ctxWith({ output: "" });
    expect((await RUN_COMMAND_TOOL.execute(args, ctx)).content).toBe("(no output)\n[exit 0]");
  });

  it("reports a refusal in-band, naming no run", async () => {
    const { ctx } = ctxWith({
      ok: false,
      exitCode: null,
      runId: "",
      error: "git push is not allowed: no allow rule matches",
    });
    const r = await RUN_COMMAND_TOOL.execute({ ...args, args: ["push"] }, ctx);
    expect(r.error).toBe("git push is not allowed: no allow rule matches");
    expect(r.run).toBeUndefined();
  });

  it("reports a failing run with its output, still naming the run", async () => {
    const { ctx } = ctxWith({
      ok: false,
      exitCode: 128,
      output: "fatal: bad\n",
      error: "exited with 128",
    });
    const r = await RUN_COMMAND_TOOL.execute(args, ctx);
    expect(r.error).toBe("exited with 128\nfatal: bad\n");
    expect(r.run?.runId).toBe("r1");
  });

  it("says when the output was cut", async () => {
    const { ctx } = ctxWith({ output: "x\n", truncated: true });
    expect((await RUN_COMMAND_TOOL.execute(args, ctx)).content).toMatch(/output was cut/);
  });

  it("refuses bad arguments before running anything", async () => {
    const { ctx, requests } = ctxWith({});
    expect((await RUN_COMMAND_TOOL.execute({ ...args, binary: "" }, ctx)).error).toMatch(/binary/);
    expect((await RUN_COMMAND_TOOL.execute({ ...args, args: "log -1" }, ctx)).error).toMatch(
      /array of strings/,
    );
    expect((await RUN_COMMAND_TOOL.execute({ ...args, args: ["log", 1] }, ctx)).error).toMatch(
      /array of strings/,
    );
    expect((await RUN_COMMAND_TOOL.execute({ ...args, repo: "" }, ctx)).error).toMatch(/repo/);
    expect((await RUN_COMMAND_TOOL.execute({ ...args, branch: "" }, ctx)).error).toMatch(/branch/);
    expect(requests).toEqual([]);
  });

  it("needs the chat's workspace", async () => {
    expect((await RUN_COMMAND_TOOL.execute(args, {})).error).toMatch(/no workspace/);
  });
});
