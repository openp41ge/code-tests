/**
 * Unit tests for AgentRuntime — the agent loop.
 *
 * Uses a fake ChatProvider (registered in a real ChatProviderRegistry), a
 * fake ToolRegistry, and a real ChatThreads (temp dir). Verifies message
 * persistence order, tool execution + tool-result loop, abort,
 * and the delta/tool/status event fan-out.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import { AgentRuntime } from "@openp41ge-extension-agents/backend/agent-runtime";
import { ChatThreads } from "@openp41ge-extension-agents/backend/chat-threads";
import { ChatProviderRegistry } from "@openp41ge-extension-agents/backend/chat-provider-registry";
import { ToolRegistry } from "@openp41ge-extension-agents/backend/tool-registry";
import type {
  ChatProvider,
  ProviderDelta,
  ChatStreamRequest,
} from "@openp41ge-extension-agents/backend/chat-provider";
import type { AgentTool } from "@openp41ge-extension-agents/backend/tool";
import { useLog } from "@openp41ge-extension-agents/backend/log";

function makeFakeProvider(script: Array<Array<ProviderDelta>>): ChatProvider {
  let call = 0;
  return {
    id: "fake",
    label: "Fake",
    ping: async () => true,
    async *streamChat(_req: ChatStreamRequest): AsyncIterable<ProviderDelta> {
      const deltas = script[Math.min(call, script.length - 1)];
      call += 1;
      for (const d of deltas) yield d;
    },
  };
}

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-runtime-test-"));
  const store = new ChatThreads();
  store.useWorkspace({ id: "ws", dataDir: dir });
  const providers = new ChatProviderRegistry();
  const tools = new ToolRegistry();
  const hooks = { sendToWindow: vi.fn(), broadcast: vi.fn() };
  const runtime = new AgentRuntime(store, providers, tools, hooks, {
    getProviderConfig: () => ({ baseUrl: "http://x", defaultModel: "m", temperature: 0.2 }),
  });
  return { dir, store, providers, tools, hooks, runtime };
}

describe("AgentRuntime", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });
  afterEach(() => {
    fs.rmSync(ctx.dir, { recursive: true, force: true });
  });

  it("persists a user message and streams text deltas to the owner window", async () => {
    const provider = makeFakeProvider([
      [
        { type: "text", text: "Hello" },
        { type: "text", text: " world" },
      ],
    ]);
    ctx.providers.register({ id: "fake", label: "Fake", create: () => provider });

    const chat = ctx.store.create("ws", { providerId: "fake" });
    await ctx.runtime.send(chat.id, "win-a", "hi there");

    const stored = ctx.store.get(chat.id)!;
    expect(stored.messages[0]).toMatchObject({ role: "user", content: "hi there" });
    expect(stored.messages[1]).toMatchObject({ role: "assistant", content: "Hello world" });

    // Deltas forwarded to the owner window.
    const deltas = ctx.hooks.sendToWindow.mock.calls.filter(([, e]) => e === "chat:delta");
    expect(deltas.length).toBe(2);
    expect(deltas[0][2]).toEqual({ chatId: chat.id, delta: "Hello" });
    expect(deltas[1][2]).toEqual({ chatId: chat.id, delta: " world" });

    // Chat changed broadcast includes the final state.
    expect(ctx.hooks.broadcast).toHaveBeenCalledWith("chat:changed", {});
  });

  it("records a provider error as an error segment (not text) and pushes chat:error", async () => {
    const provider = makeFakeProvider([
      [
        { type: "text", text: "Partial" },
        { type: "error", errorId: "e-1" },
      ],
    ]);
    ctx.providers.register({ id: "fake", label: "Fake", create: () => provider });

    const chat = ctx.store.create("ws", { providerId: "fake" });
    await ctx.runtime.send(chat.id, "win-a", "hi");

    const reply = ctx.store.get(chat.id)!.messages[1];
    expect(reply.content).toBe("Partial");
    expect(reply.segments).toEqual([
      { type: "text", text: "Partial" },
      { type: "error", errorId: "e-1" },
    ]);
    expect(ctx.hooks.sendToWindow).toHaveBeenCalledWith("win-a", "chat:error", {
      chatId: chat.id,
      errorId: "e-1",
    });
  });

  it("records an unexpected failure as an error segment with its log id, live", async () => {
    const SILENT = { debug() {}, info() {}, warn() {}, error: () => undefined };
    useLog({ ...SILENT, error: () => "e-9" });
    try {
      const provider: ChatProvider = {
        id: "fake",
        label: "Fake",
        ping: async () => true,
        async *streamChat(): AsyncIterable<ProviderDelta> {
          throw new Error("kaput");
        },
      };
      ctx.providers.register({ id: "fake", label: "Fake", create: () => provider });

      const chat = ctx.store.create("ws", { providerId: "fake" });
      await ctx.runtime.send(chat.id, "win-a", "hi");

      const reply = ctx.store.get(chat.id)!.messages[1];
      expect(reply.role).toBe("assistant");
      expect(reply.content ?? "").toBe("");
      expect(reply.segments).toEqual([{ type: "error", errorId: "e-9" }]);
      expect(ctx.hooks.sendToWindow).toHaveBeenCalledWith("win-a", "chat:error", {
        chatId: chat.id,
        errorId: "e-9",
      });
    } finally {
      useLog(SILENT);
    }
  });

  it("persists token usage on the assistant message and forwards a chat:usage event", async () => {
    const provider = makeFakeProvider([
      [
        { type: "text", text: "Done" },
        { type: "usage", usage: { promptTokens: 120, completionTokens: 34, totalTokens: 154 } },
      ],
    ]);
    ctx.providers.register({ id: "fake", label: "Fake", create: () => provider });

    const chat = ctx.store.create("ws", { providerId: "fake" });
    await ctx.runtime.send(chat.id, "win-a", "go");

    const stored = ctx.store.get(chat.id)!;
    const assistant = stored.messages.find((m) => m.role === "assistant");
    expect(assistant?.usage).toEqual({ promptTokens: 120, completionTokens: 34, totalTokens: 154 });

    const usageCalls = ctx.hooks.sendToWindow.mock.calls.filter(([, e]) => e === "chat:usage");
    expect(usageCalls).toHaveLength(1);
    expect(usageCalls[0][2]).toEqual({
      chatId: chat.id,
      usage: { promptTokens: 120, completionTokens: 34, totalTokens: 154 },
    });
  });

  it("derives and forwards an approximate tokens-per-second rate when usage is timed", async () => {
    // 523 completion tokens over 331ms => 1580.1 tokens/sec.
    const provider = makeFakeProvider([
      [
        { type: "text", text: "Done" },
        {
          type: "usage",
          usage: { promptTokens: 420, completionTokens: 523, totalTokens: 943 },
          elapsedMs: 331,
        },
      ],
    ]);
    ctx.providers.register({ id: "fake", label: "Fake", create: () => provider });

    const chat = ctx.store.create("ws", { providerId: "fake" });
    await ctx.runtime.send(chat.id, "win-a", "go");

    const usage = ctx.store.get(chat.id)!.messages.find((m) => m.role === "assistant")?.usage;
    expect(usage?.tokensPerSecond).toBeCloseTo(1580.1, 1);

    const usageCalls = ctx.hooks.sendToWindow.mock.calls.filter(([, e]) => e === "chat:usage");
    expect(usageCalls[0][2].usage.tokensPerSecond).toBeCloseTo(1580.1, 1);
  });

  it("streams reasoning text onto the assistant message and forwards it", async () => {
    const provider = makeFakeProvider([
      [
        { type: "reasoning", text: "Let me think" },
        { type: "reasoning", text: " about this" },
        { type: "text", text: "Answer" },
        {
          type: "usage",
          usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
          elapsedMs: 100,
        },
      ],
    ]);
    ctx.providers.register({ id: "fake", label: "Fake", create: () => provider });

    const chat = ctx.store.create("ws", { providerId: "fake" });
    await ctx.runtime.send(chat.id, "win-a", "go");

    const msg = ctx.store.get(chat.id)!.messages.find((m) => m.role === "assistant")!;
    expect(msg.content).toBe("Answer");
    expect(msg.reasoning).toBe("Let me think about this");

    const reasoningCalls = ctx.hooks.sendToWindow.mock.calls.filter(
      ([, e]) => e === "chat:reasoning",
    );
    expect(reasoningCalls.map((c) => c[2].delta)).toEqual(["Let me think", " about this"]);
  });

  it("forwards a live generation rate but never persists it as the final usage", async () => {
    const provider = makeFakeProvider([
      [
        { type: "text", text: "A" },
        {
          type: "usage",
          // A throttled live progress delta with the real elapsed time.
          usage: { promptTokens: 0, completionTokens: 150, totalTokens: 150 },
          elapsedMs: 246,
          live: true,
        },
        { type: "text", text: "B" },
        {
          type: "usage",
          // The authoritative final usage chunk (not live).
          usage: { promptTokens: 99, completionTokens: 201, totalTokens: 300 },
          elapsedMs: 200,
        },
      ],
    ]);
    ctx.providers.register({ id: "fake", label: "Fake", create: () => provider });

    const chat = ctx.store.create("ws", { providerId: "fake" });
    await ctx.runtime.send(chat.id, "win-a", "go");

    // Live rate forwarded: 150 tokens / 246ms  =>  609.8 tok/s.
    const liveCalls = ctx.hooks.sendToWindow.mock.calls.filter(([, e]) => e === "chat:live-rate");
    expect(liveCalls).toHaveLength(1);
    expect(liveCalls[0][2].chatId).toBe(chat.id);
    expect(liveCalls[0][2].tps).toBeCloseTo(609.8, 1);

    // Only the final, authoritative usage is persisted and forwarded.
    const usageCalls = ctx.hooks.sendToWindow.mock.calls.filter(([, e]) => e === "chat:usage");
    expect(usageCalls).toHaveLength(1);
    expect(usageCalls[0][2].usage.completionTokens).toBe(201);
    const stored = ctx.store.get(chat.id)!.messages.find((m) => m.role === "assistant")?.usage;
    expect(stored?.completionTokens).toBe(201);
  });

  it("executes tool calls and loops back to the provider until text-only", async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    const fakeTool: AgentTool = {
      name: "read_file",
      description: "read",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      execute: async (args) => {
        capturedArgs = args;
        return { content: "file contents" };
      },
    };
    ctx.tools.register(fakeTool);

    // Turn 1: tool_call; Turn 2: final text.
    const provider = makeFakeProvider([
      [{ type: "tool_call", id: "call_1", name: "read_file", arguments: '{"path":"/a/b.ts"}' }],
      [{ type: "text", text: "Done reading." }],
    ]);
    ctx.providers.register({ id: "fake", label: "Fake", create: () => provider });

    const chat = ctx.store.create("ws", { providerId: "fake" });
    await ctx.runtime.send(chat.id, "win-a", "read it");

    const stored = ctx.store.get(chat.id)!;
    // user, assistant (with the tool call), tool result, assistant (final).
    expect(stored.messages.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(stored.messages[1].toolCalls?.[0]).toMatchObject({
      id: "call_1",
      name: "read_file",
      status: "done",
    });
    expect(stored.messages[2]).toMatchObject({
      role: "tool",
      toolCallId: "call_1",
      content: "file contents",
    });
    expect(stored.messages[3].content).toBe("Done reading.");
    // The tool received the parsed arguments.
    expect(capturedArgs).toEqual({ path: "/a/b.ts" });
  });

  it("records ordered segments interleaving text and tool calls within a turn", async () => {
    const fakeTool: AgentTool = {
      name: "read_file",
      description: "read",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      execute: async () => ({ content: "file contents" }),
    };
    ctx.tools.register(fakeTool);

    const provider = makeFakeProvider([
      [
        { type: "text", text: "Let me read. " },
        { type: "tool_call", id: "call_1", name: "read_file", arguments: '{"path":"/a"}' },
        { type: "text", text: " Found it." },
      ],
      [{ type: "text", text: "done" }],
    ]);
    ctx.providers.register({ id: "fake", label: "Fake", create: () => provider });

    const chat = ctx.store.create("ws", { providerId: "fake" });
    await ctx.runtime.send(chat.id, "win-a", "go");

    const stored = ctx.store.get(chat.id)!;
    const assistant = stored.messages.find(
      (m) => m.role === "assistant" && m.segments && m.segments.length > 0,
    );
    expect(assistant).toBeDefined();
    expect(assistant!.content).toBe("Let me read.  Found it.");
    expect(assistant!.segments!.map((s) => s.type)).toEqual(["text", "tool", "text"]);
    const toolSeg = assistant!.segments![1];
    expect(toolSeg.type).toBe("tool");
    expect(toolSeg.toolCall!.id).toBe("call_1");
    // Status propagates into the inline segment after execution.
    expect(toolSeg.toolCall!.status).toBe("done");
  });

  it("withholds every tool when an empty enabledTools set is passed", async () => {
    const fakeTool: AgentTool = {
      name: "read_file",
      description: "read",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      execute: async () => ({ content: "x" }),
    };
    ctx.tools.register(fakeTool);

    let capturedTools: unknown;
    const provider: ChatProvider = {
      id: "fake",
      label: "Fake",
      ping: async () => true,
      async *streamChat(req: ChatStreamRequest): AsyncIterable<ProviderDelta> {
        capturedTools = req.tools;
        yield { type: "text", text: "done" };
      },
    };
    ctx.providers.register({ id: "fake", label: "Fake", create: () => provider });

    const chat = ctx.store.create("ws", { providerId: "fake" });
    await ctx.runtime.send(chat.id, "win-a", "hello", undefined, []);

    // The provider received no tools, so no tool-call loop can occur.
    expect(capturedTools).toEqual([]);
    const stored = ctx.store.get(chat.id)!;
    expect(stored.messages.filter((m) => m.role === "tool")).toHaveLength(0);
  });

  it("forwards the connected-worktree roots to the tool execution context", async () => {
    let capturedCtx: unknown;
    const scopedTool: AgentTool = {
      name: "read_file",
      description: "read",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      execute: async (_args, toolCtx) => {
        capturedCtx = toolCtx;
        return { content: "x" };
      },
    };
    ctx.tools.register(scopedTool);

    const scopedFor: string[] = [];
    const scopedRuntime = new AgentRuntime(ctx.store, ctx.providers, ctx.tools, ctx.hooks, {
      getProviderConfig: () => ({ baseUrl: "http://x", defaultModel: "m", temperature: 0.2 }),
      getConnectedRepositories: async (chatId) => (
        scopedFor.push(chatId),
        [
          {
            repo: "github.com/org/repo",
            cloned: true,
            worktrees: [
              { branch: "main", path: "/worktrees/main" },
              { branch: "feature-x", path: "/worktrees/feature-x" },
            ],
          },
        ]
      ),
    });

    const provider = makeFakeProvider([
      [
        {
          type: "tool_call",
          id: "call_1",
          name: "read_file",
          arguments: '{"path":"/worktrees/main/a.ts"}',
        },
      ],
      [{ type: "text", text: "done" }],
    ]);
    ctx.providers.register({ id: "fake", label: "Fake", create: () => provider });

    const chat = ctx.store.create("ws", { providerId: "fake" });
    await scopedRuntime.send(chat.id, "win-a", "go");

    // The scope is the chat's own (its workspace's worktrees), read again
    // for each request to the provider (a tool may check one out).
    expect(scopedFor).toEqual([chat.id, chat.id]);
    // The tool receives every connected-worktree path as its scope roots.
    expect(capturedCtx).toEqual({
      cwd: undefined,
      roots: ["/worktrees/main", "/worktrees/feature-x"],
    });
  });

  it("tells the provider about the connected worktrees in the system prompt", async () => {
    let systemContent: string | undefined;
    const provider: ChatProvider = {
      id: "fake",
      label: "Fake",
      ping: async () => true,
      async *streamChat(req: ChatStreamRequest): AsyncIterable<ProviderDelta> {
        systemContent = req.messages[0]?.content;
        yield { type: "text", text: "done" };
      },
    };
    ctx.providers.register({ id: "fake", label: "Fake", create: () => provider });

    const scopedRuntime = new AgentRuntime(ctx.store, ctx.providers, ctx.tools, ctx.hooks, {
      getProviderConfig: () => ({ baseUrl: "http://x", defaultModel: "m", temperature: 0.2 }),
      getConnectedRepositories: async () => [
        {
          repo: "github.com/org/repo",
          cloned: true,
          worktrees: [{ branch: "main", path: "/worktrees/main" }],
        },
      ],
    });

    const chat = ctx.store.create("ws", { providerId: "fake" });
    await scopedRuntime.send(chat.id, "win-a", "hi");

    expect(systemContent).toContain("- github.com/org/repo");
    expect(systemContent).toContain("    - branch main: /worktrees/main");
    expect(systemContent).toContain("Connected repositories");
    expect(systemContent).toContain("do not repeat the same file across sibling worktrees");
    expect(systemContent).toContain("scoped");
  });

  it("groups multiple worktrees of a repo under a single repo heading", async () => {
    let systemContent: string | undefined;
    const provider: ChatProvider = {
      id: "fake",
      label: "Fake",
      ping: async () => true,
      async *streamChat(req: ChatStreamRequest): AsyncIterable<ProviderDelta> {
        systemContent = req.messages[0]?.content;
        yield { type: "text", text: "done" };
      },
    };
    ctx.providers.register({ id: "fake", label: "Fake", create: () => provider });

    const scopedRuntime = new AgentRuntime(ctx.store, ctx.providers, ctx.tools, ctx.hooks, {
      getProviderConfig: () => ({ baseUrl: "http://x", defaultModel: "m", temperature: 0.2 }),
      getConnectedRepositories: async () => [
        {
          repo: "github.com/org/repo",
          cloned: true,
          worktrees: [
            { branch: "main", path: "/worktrees/main" },
            { branch: "feature", path: "/worktrees/feature" },
          ],
        },
        {
          repo: "github.com/org/other",
          cloned: true,
          worktrees: [{ branch: "main", path: "/worktrees/other-main" }],
        },
      ],
    });

    const chat = ctx.store.create("ws", { providerId: "fake" });
    await scopedRuntime.send(chat.id, "win-a", "hi");

    // One repo heading per unique repo, with its worktrees listed under it.
    expect(systemContent!.match(/- github\.com\/org\/repo\n/g)?.length).toBe(1);
    expect(systemContent).toContain("    - branch feature: /worktrees/feature");
    expect(systemContent).toContain(
      "- github.com/org/other\n    - branch main: /worktrees/other-main",
    );
  });
  it("lists a repository with no worktree, or not cloned yet, in the system prompt", async () => {
    let systemContent: string | undefined;
    const provider: ChatProvider = {
      id: "fake",
      label: "Fake",
      ping: async () => true,
      async *streamChat(req: ChatStreamRequest): AsyncIterable<ProviderDelta> {
        systemContent = req.messages[0]?.content;
        yield { type: "text", text: "done" };
      },
    };
    ctx.providers.register({ id: "fake", label: "Fake", create: () => provider });

    const scopedRuntime = new AgentRuntime(ctx.store, ctx.providers, ctx.tools, ctx.hooks, {
      getProviderConfig: () => ({ baseUrl: "http://x", defaultModel: "m", temperature: 0.2 }),
      getConnectedRepositories: async () => [
        { repo: "github.com/org/bare", cloned: true, worktrees: [] },
        { repo: "github.com/org/new", cloned: false, worktrees: [] },
      ],
    });

    const chat = ctx.store.create("ws", { providerId: "fake" });
    await scopedRuntime.send(chat.id, "win-a", "hi");

    expect(systemContent).toContain("- github.com/org/bare\n    - no worktree checked out");
    expect(systemContent).toContain("- github.com/org/new\n    - not cloned yet");
    expect(systemContent).not.toContain("No connected");
  });

  it("lets a tool check out a worktree, which is then in scope for the next request", async () => {
    const repos = [
      {
        repo: "github.com/org/bare",
        cloned: true,
        worktrees: [] as Array<{ branch: string; path: string }>,
      },
    ];
    const addWorktree = vi.fn(async (_chatId: string, repo: string, branch: string) => {
      const path = `/worktrees/${branch}`;
      repos.find((r) => r.repo === repo)!.worktrees.push({ branch, path });
      return { ok: true, path };
    });
    const seen: Array<{ roots?: string[] }> = [];
    ctx.tools.register({
      name: "create_worktree",
      description: "check out",
      parameters: { type: "object", properties: {} },
      execute: async (args, toolCtx) => {
        const r = await toolCtx.addWorktree!(String(args.repo), String(args.branch));
        return { content: r.path ?? "" };
      },
    });
    ctx.tools.register({
      name: "read_file",
      description: "read",
      parameters: { type: "object", properties: {} },
      execute: async (_args, toolCtx) => {
        seen.push({ roots: toolCtx.roots });
        return { content: "x" };
      },
    });
    const systems: string[] = [];
    let call = 0;
    const script: ProviderDelta[][] = [
      [
        {
          type: "tool_call",
          id: "c1",
          name: "create_worktree",
          arguments: '{"repo":"github.com/org/bare","branch":"dev"}',
        },
      ],
      [
        {
          type: "tool_call",
          id: "c2",
          name: "read_file",
          arguments: '{"path":"/worktrees/dev/a"}',
        },
      ],
      [{ type: "text", text: "done" }],
    ];
    const provider: ChatProvider = {
      id: "fake",
      label: "Fake",
      ping: async () => true,
      async *streamChat(req: ChatStreamRequest): AsyncIterable<ProviderDelta> {
        systems.push(req.messages[0]?.content ?? "");
        for (const d of script[Math.min(call++, script.length - 1)]) yield d;
      },
    };
    ctx.providers.register({ id: "fake", label: "Fake", create: () => provider });

    const scopedRuntime = new AgentRuntime(ctx.store, ctx.providers, ctx.tools, ctx.hooks, {
      getProviderConfig: () => ({ baseUrl: "http://x", defaultModel: "m", temperature: 0.2 }),
      getConnectedRepositories: async () => structuredClone(repos),
      addWorktree,
    });
    const chat = ctx.store.create("ws", { providerId: "fake" });
    await scopedRuntime.send(chat.id, "win-a", "work on dev");

    expect(addWorktree).toHaveBeenCalledWith(chat.id, "github.com/org/bare", "dev");
    expect(seen).toEqual([{ roots: ["/worktrees/dev"] }]);
    expect(systems[0]).toContain("no worktree checked out");
    expect(systems[0]).toContain("create_worktree");
    expect(systems[1]).toContain("    - branch dev: /worktrees/dev");
  });

  it("gives run_command the chat's commands, names the binaries in the prompt, and keeps the run on the tool call", async () => {
    const run = vi.fn(async () => ({
      ok: true,
      exitCode: 0,
      output: "out",
      truncated: false,
      runId: "r7",
    }));
    const binaries = vi.fn(async () => [
      {
        binary: "git",
        label: "Git",
        extensionId: "openp41ge-extension-git",
        allow: ["log **"],
        deny: ["** --output*"],
      },
    ]);
    ctx.tools.register({
      name: "run_command",
      description: "run",
      parameters: { type: "object", properties: {} },
      execute: async (_args, toolCtx) => {
        const r = await toolCtx.commands!.run({
          binary: "git",
          args: ["log"],
          repo: "github.com/org/repo",
          worktree: "main",
        });
        return {
          content: r.output,
          run: {
            binary: "git",
            args: ["log"],
            repo: "github.com/org/repo",
            worktree: "main",
            runId: r.runId,
          },
        };
      },
    });
    const systems: string[] = [];
    let call = 0;
    const script: ProviderDelta[][] = [
      [{ type: "tool_call", id: "c1", name: "run_command", arguments: "{}" }],
      [{ type: "text", text: "done" }],
    ];
    ctx.providers.register({
      id: "fake",
      label: "Fake",
      create: () => ({
        id: "fake",
        label: "Fake",
        ping: async () => true,
        async *streamChat(req: ChatStreamRequest): AsyncIterable<ProviderDelta> {
          systems.push(req.messages[0]?.content ?? "");
          for (const d of script[Math.min(call++, script.length - 1)]) yield d;
        },
      }),
    });
    const scopedRuntime = new AgentRuntime(ctx.store, ctx.providers, ctx.tools, ctx.hooks, {
      getProviderConfig: () => ({ baseUrl: "http://x", defaultModel: "m", temperature: 0.2 }),
      getConnectedRepositories: async () => [
        {
          repo: "github.com/org/repo",
          cloned: true,
          worktrees: [{ branch: "main", path: "/w/main" }],
        },
      ],
      commands: { binaries, run },
    });
    const chat = ctx.store.create("ws", { providerId: "fake" });
    await scopedRuntime.send(chat.id, "win-a", "show the log");

    expect(run).toHaveBeenCalledWith(chat.id, {
      binary: "git",
      args: ["log"],
      repo: "github.com/org/repo",
      worktree: "main",
    });
    expect(binaries).toHaveBeenCalledWith(chat.id);
    expect(systems[0]).toContain("run_command");
    expect(systems[0]).toContain("- git: allow `log **`; deny `** --output*`");
    const tool = ctx.store
      .get(chat.id)!
      .messages.flatMap((m) => m.toolCalls ?? [])
      .find((t) => t.id === "c1")!;
    expect(tool.run).toEqual({
      binary: "git",
      args: ["log"],
      repo: "github.com/org/repo",
      worktree: "main",
      runId: "r7",
    });
    const sent = ctx.hooks.sendToWindow.mock.calls.find(([, e]) => e === "chat:tool");
    expect((sent![2] as { toolCall: { run?: unknown } }).toolCall.run).toEqual(tool.run);
  });

  it("does not name the binaries when run_command is not enabled", async () => {
    let systemContent = "";
    ctx.providers.register({
      id: "fake",
      label: "Fake",
      create: () => ({
        id: "fake",
        label: "Fake",
        ping: async () => true,
        async *streamChat(req: ChatStreamRequest): AsyncIterable<ProviderDelta> {
          systemContent = req.messages[0]?.content ?? "";
          yield { type: "text", text: "hi" };
        },
      }),
    });
    const binaries = vi.fn(async () => []);
    const scopedRuntime = new AgentRuntime(ctx.store, ctx.providers, ctx.tools, ctx.hooks, {
      getProviderConfig: () => ({ baseUrl: "http://x", defaultModel: "m", temperature: 0.2 }),
      getConnectedRepositories: async () => [
        {
          repo: "github.com/org/repo",
          cloned: true,
          worktrees: [{ branch: "main", path: "/w/main" }],
        },
      ],
      commands: {
        binaries,
        run: async () => ({ ok: true, exitCode: 0, output: "", truncated: false, runId: "" }),
      },
    });
    const chat = ctx.store.create("ws", { providerId: "fake" });
    await scopedRuntime.send(chat.id, "win-a", "hi", undefined, []);
    expect(systemContent).not.toContain("run_command");
    expect(binaries).not.toHaveBeenCalled();
  });
});
