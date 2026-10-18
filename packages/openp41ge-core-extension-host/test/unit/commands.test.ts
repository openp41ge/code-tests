/**
 * Unit tests for the host's command binaries: a backend's
 * `registerCommandBinaries` calls are captured per extension, each binary's
 * rules must be in the extension's config schema (a load error otherwise),
 * the platform reads the current rules from the extension's config, and
 * `ctx.commands` is the calling window's (refusing without one).
 */
import { describe, it, expect } from "vitest";
import { ExtensionHost } from "@openp41ge-core-extension-host/host";
import {
  configDefaults,
  registerCommandBinaries,
  registerConfigSchema,
  registerProcesses,
  type ConfigSchema,
  type HandlerContext,
} from "openp41ge-sdk";
import { createNoopLogger } from "openp41ge-core-logger";
import type { DiscoveredExtension } from "@openp41ge-core-extension-host/discovery";
import type { ExtensionConfigStore } from "@openp41ge-core-extension-host/config-store";

const discoveredFor = (id: string): DiscoveredExtension => ({
  manifest: {
    name: `n-${id}`,
    version: "1.0.0",
    openp41ge: { extension: true, id, publisher: "openp41ge", entry: "./index.js", api: "0.2" },
  },
  root: `/ext/${id}`,
  entryPath: `/ext/${id}`,
});

/** A config store whose user values can be changed after load. */
class TestConfigStore implements ExtensionConfigStore {
  readonly schemas = new Map<string, ConfigSchema>();
  readonly user = new Map<string, Record<string, unknown>>();
  registerSchema(id: string, schema: ConfigSchema): void {
    this.schemas.set(id, schema);
  }
  get(id: string): Readonly<Record<string, unknown>> {
    const schema = this.schemas.get(id);
    return { ...(schema ? configDefaults(schema) : {}), ...this.user.get(id) };
  }
}

function hostLoading(entries: Record<string, () => void>, config = new TestConfigStore()) {
  let current = "";
  const host = new ExtensionHost({
    discoveryDirs: [],
    createLogger: createNoopLogger,
    config,
    loadEntry: async (p) => {
      current = p.replace("/ext/", "");
      entries[current]?.();
      return {};
    },
    discover: async () => Object.keys(entries).map(discoveredFor),
  });
  return { host, config };
}

const gitSchema: ConfigSchema = {
  type: "object",
  properties: {
    commands: {
      type: "object",
      properties: {
        git: {
          type: "object",
          properties: {
            allow: { type: "array", items: { type: "string" } },
            deny: { type: "array", items: { type: "string" } },
          },
        },
      },
      default: { git: { allow: ["log **"], deny: ["** --output*"] } },
    },
  },
};

describe("ExtensionHost command binaries", () => {
  it("lists each defined binary with its current rules", async () => {
    const { host } = hostLoading({
      g: () => {
        registerConfigSchema(gitSchema);
        registerCommandBinaries({ git: { label: "Git", config: "commands.git" } });
      },
    });
    await host.loadAll();
    expect(host.commandBinaries()).toEqual([
      {
        extensionId: "g",
        binary: "git",
        label: "Git",
        rules: { allow: ["log **"], deny: ["** --output*"] },
      },
    ]);
  });

  it("reads the rules on each call, so the user's edits apply at once", async () => {
    const { host, config } = hostLoading({
      g: () => {
        registerConfigSchema(gitSchema);
        registerCommandBinaries({ git: { label: "Git", config: "commands.git" } });
      },
    });
    await host.loadAll();
    config.user.set("g", { commands: { git: { allow: ["status"] } } });
    expect(host.commandBinaries()[0].rules).toEqual({ allow: ["status"], deny: [] });
    config.user.set("g", { commands: { git: { allow: "oops" } } });
    expect(host.commandBinaries()[0].rules).toBeNull();
  });

  it("refuses to load an extension whose binary's rules are not in its config schema", async () => {
    const { host } = hostLoading({
      a: () => registerCommandBinaries({ sed: { label: "sed", config: "commands.sed" } }),
      b: () => {
        registerConfigSchema(gitSchema);
        registerCommandBinaries({ sed: { label: "sed", config: "commands.sed" } });
      },
    });
    const [a, b] = await host.loadAll();
    expect(a.active).toBe(false);
    expect(a.error).toMatch(/sed.*commands\.sed/);
    expect(b.active).toBe(false);
    expect(host.commandBinaries()).toEqual([]);
  });

  it("lists binaries from every extension, in activation order, duplicates included", async () => {
    const { host } = hostLoading({
      g: () => {
        registerConfigSchema(gitSchema);
        registerCommandBinaries({ git: { label: "Git", config: "commands.git" } });
      },
      h: () => {
        registerConfigSchema(gitSchema);
        registerCommandBinaries({ git: { label: "Other git", config: "commands.git" } });
      },
    });
    await host.loadAll();
    expect(host.commandBinaries().map((b) => `${b.extensionId}:${b.binary}`)).toEqual([
      "g:git",
      "h:git",
    ]);
  });

  it("drops a deactivated extension's binaries", async () => {
    const { host } = hostLoading({
      g: () => {
        registerConfigSchema(gitSchema);
        registerCommandBinaries({ git: { label: "Git", config: "commands.git" } });
      },
    });
    await host.loadAll();
    await host.deactivate("g");
    expect(host.commandBinaries()).toEqual([]);
  });
});

describe("ctx.commands", () => {
  const capture = () => {
    let ctx: HandlerContext | undefined;
    const { host } = hostLoading({
      a: () => registerProcesses({ grab: (_p, c) => void (ctx = c) }),
    });
    return { host, ctx: () => ctx! };
  };

  it("is the calling window's, run in the extension's name", async () => {
    const { host, ctx } = capture();
    await host.loadAll();
    const result = { ok: true, exitCode: 0, output: "x", truncated: false, runId: "r1" };
    let by = "";
    await host.dispatch(
      "a/grab",
      {},
      {
        commands: {
          binaries: async () => [],
          run: async (_request, extensionId) => {
            by = extensionId;
            return result;
          },
        },
      },
    );
    expect(await ctx().commands.run({ binary: "git", args: [], repo: "r", worktree: "w" })).toBe(
      result,
    );
    expect(by).toBe("a");
  });

  it("refuses without a calling window", async () => {
    const { host, ctx } = capture();
    await host.loadAll();
    await host.dispatch("a/grab", {});
    const r = await ctx().commands.run({ binary: "git", args: [], repo: "r", worktree: "w" });
    expect(r).toMatchObject({ ok: false, exitCode: null, runId: "" });
    expect(r.error).toMatch(/workspace/);
    expect(await ctx().commands.binaries()).toEqual([]);
  });
});
