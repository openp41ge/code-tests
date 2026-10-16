/**
 * Unit tests for the host's search providers: a backend's
 * `registerSearchProvider` calls are captured per extension, the palette asks
 * them by id with the calling window's context, a slow or failing provider
 * resolves as a failure (never throws), and create actions run the provider's
 * `create`.
 */
import { describe, it, expect } from "vitest";
import { ExtensionHost } from "@openp41ge-core-extension-host/host";
import { registerSearchProvider } from "openp41ge-sdk";
import { createNoopLogger } from "openp41ge-core-logger";
import type { DiscoveredExtension } from "@openp41ge-core-extension-host/discovery";

const discoveredFor = (id: string): DiscoveredExtension => ({
  manifest: {
    name: `n-${id}`,
    version: "1.0.0",
    openp41ge: {
      extension: true,
      id,
      publisher: "openp41ge",
      entry: "./index.js",
      api: "0.2",
    },
  },
  root: `/ext/${id}`,
  entryPath: `/ext/${id}`,
});

function hostLoading(entries: Record<string, () => void>): ExtensionHost {
  let current = "";
  return new ExtensionHost({
    discoveryDirs: [],
    createLogger: createNoopLogger,
    loadEntry: async (p) => {
      current = p.replace("/ext/", "");
      entries[current]?.();
      return {};
    },
    discover: async () => Object.keys(entries).map(discoveredFor),
  });
}

describe("ExtensionHost search providers", () => {
  it("lists every active extension's providers", async () => {
    const host = hostLoading({
      a: () => {
        registerSearchProvider({ id: "chats", search: () => [] });
        registerSearchProvider({ id: "more", search: () => [] });
      },
      b: () => registerSearchProvider({ id: "repos", search: () => [] }),
    });
    await host.loadAll();
    expect(host.searchProviders()).toEqual([
      { extensionId: "a", id: "chats" },
      { extensionId: "a", id: "more" },
      { extensionId: "b", id: "repos" },
    ]);
  });

  it("searches with the query and the caller's context", async () => {
    const host = hostLoading({
      a: () =>
        registerSearchProvider({
          id: "chats",
          search: (query, ctx) => [
            { create: "x", title: `${query}:${ctx.extensionId}:${ctx.windowId}` },
          ],
        }),
    });
    await host.loadAll();
    expect(await host.search("a", "chats", "hi", { windowId: "w1" })).toEqual({
      ok: true,
      items: [{ create: "x", title: "hi:a:w1" }],
    });
  });

  it("resolves a throwing provider as a failure", async () => {
    const host = hostLoading({
      a: () =>
        registerSearchProvider({
          id: "bad",
          search: () => {
            throw new Error("boom");
          },
        }),
    });
    await host.loadAll();
    expect(await host.search("a", "bad", "", undefined)).toEqual({ ok: false, error: "boom" });
  });

  it("gives up on a provider slower than the timeout", async () => {
    const host = hostLoading({
      a: () =>
        registerSearchProvider({
          id: "slow",
          search: () => new Promise((r) => setTimeout(() => r([]), 200)),
        }),
    });
    await host.loadAll();
    const result = await host.search("a", "slow", "", undefined, 20);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toMatch(/took longer than 20 ms/);
  });

  it("refuses an unknown provider", async () => {
    const host = hostLoading({ a: () => undefined });
    await host.loadAll();
    expect(await host.search("a", "nope", "", undefined)).toEqual({
      ok: false,
      error: "no search provider 'a/nope'",
    });
  });

  it("runs a create action and returns what it made", async () => {
    const host = hostLoading({
      a: () =>
        registerSearchProvider({
          id: "chats",
          search: () => [],
          create: (create, query) => ({
            kind: "a/chat",
            params: { chatId: "c1" },
            title: `${create}:${query}`,
          }),
        }),
    });
    await host.loadAll();
    expect(await host.createFromSearch("a", "chats", "new-chat", "hello", undefined)).toEqual({
      ok: true,
      item: { kind: "a/chat", params: { chatId: "c1" }, title: "new-chat:hello" },
    });
  });

  it("refuses a create on a provider without one", async () => {
    const host = hostLoading({
      a: () => registerSearchProvider({ id: "chats", search: () => [] }),
    });
    await host.loadAll();
    expect(await host.createFromSearch("a", "chats", "x", "", undefined)).toEqual({
      ok: false,
      error: "search provider 'a/chats' creates nothing",
    });
  });

  it("drops an extension's providers when it is deactivated", async () => {
    const host = hostLoading({
      a: () => registerSearchProvider({ id: "chats", search: () => [] }),
    });
    await host.loadAll();
    await host.deactivate("a");
    expect(host.searchProviders()).toEqual([]);
  });
});
