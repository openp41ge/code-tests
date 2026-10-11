/**
 * Unit tests for `ctx.workspace`: a handler sees the calling window's
 * workspace (its id, its worktrees, and a data folder scoped to the handler's
 * own extension), or null when the call has no workspace.
 */
import { describe, it, expect, vi } from "vitest";
import { ExtensionHost } from "@openp41ge-core-extension-host/host";
import { registerProcesses, type CallerWorkspace } from "openp41ge-sdk";
import { createNoopLogger } from "openp41ge-core-logger";
import type { DiscoveredExtension } from "@openp41ge-core-extension-host/discovery";

const discovered: DiscoveredExtension = {
  manifest: {
    name: "n-demo",
    version: "2.0.0",
    openp41ge: {
      extension: true,
      id: "demo",
      publisher: "openp41ge",
      entry: "./index.js",
      api: "0.2",
    },
  },
  root: "/ext/demo",
  entryPath: "/ext/demo",
};

async function host() {
  const h = new ExtensionHost({
    discoveryDirs: [],
    createLogger: createNoopLogger,
    loadEntry: async () => {
      registerProcesses({
        where: async (_payload, ctx) => {
          const ws = ctx?.workspace;
          if (!ws) return { workspace: null };
          return { id: ws.id, roots: await ws.roots(), dataDir: await ws.dataDir() };
        },
      });
      return {};
    },
    discover: async () => [discovered],
  });
  await h.load(discovered);
  return h;
}

describe("ExtensionHost ctx.workspace", () => {
  it("gives the caller's workspace, with a data folder for the handler's extension", async () => {
    const dataDirFor = vi.fn(async (id: string) => `/data/ws1/extensions/${id}`);
    const workspace: CallerWorkspace = {
      id: "ws1",
      roots: async () => [{ repoName: "github.com/a/b", branch: "main", path: "/r/main" }],
      dataDirFor,
    };
    const h = await host();
    expect(await h.dispatch("demo/where", {}, { workspace })).toEqual({
      id: "ws1",
      roots: [{ repoName: "github.com/a/b", branch: "main", path: "/r/main" }],
      dataDir: "/data/ws1/extensions/demo",
    });
    expect(dataDirFor).toHaveBeenCalledWith("demo");
  });

  it("is null for a call without a workspace", async () => {
    const h = await host();
    expect(await h.dispatch("demo/where", {}, {})).toEqual({ workspace: null });
    expect(await h.dispatch("demo/where", {})).toEqual({ workspace: null });
  });
});
