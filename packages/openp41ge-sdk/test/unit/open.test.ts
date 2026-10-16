/**
 * Unit tests for the open contract: the kinds of things the palette can open
 * (the platform's closed set and an extension's own), their params, the
 * search providers a backend registers, and the items a provider returns.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  beginExtensionScope,
  endExtensionScope,
  getScopedOpenKinds,
  getScopedSearchProviders,
} from "./scope-helper";
import {
  PLATFORM_OPEN_KINDS,
  openItemKey,
  parseSearchItems,
  registerOpenKinds,
  registerSearchProvider,
  validateOpenParams,
  type OpenKindDef,
} from "@openp41ge-sdk";

afterEach(() => endExtensionScope());

const chat: OpenKindDef = {
  name: "ext-a/chat",
  label: "Chat",
  params: {
    type: "object",
    properties: { chatId: { type: "string" }, unread: { type: "number" } },
    required: ["chatId"],
  },
};

describe("platform open kinds", () => {
  it("are a closed set under openp41ge/", () => {
    expect(PLATFORM_OPEN_KINDS.map((k) => k.name).sort()).toEqual([
      "openp41ge/file",
      "openp41ge/log-stream",
      "openp41ge/release",
      "openp41ge/settings",
      "openp41ge/workspace",
    ]);
  });

  it("validates a file's params", () => {
    expect(() => validateOpenParams("openp41ge/file", { filePath: "/a/b.ts" })).not.toThrow();
    expect(() => validateOpenParams("openp41ge/file", {})).toThrow(/'filePath' is required/);
    expect(() => validateOpenParams("openp41ge/file", { filePath: 3 })).toThrow(/must be a string/);
    expect(() => validateOpenParams("openp41ge/file", { filePath: "/a", x: "y" })).toThrow(
      /'x' is not a param/,
    );
  });

  it("refuses an unknown kind", () => {
    expect(() => validateOpenParams("openp41ge/nope", {})).toThrow(/unknown kind/);
    expect(() => validateOpenParams("ext-a/chat", { chatId: "1" })).toThrow(/unknown kind/);
  });

  it("validates an extension kind's params by its schema", () => {
    expect(() =>
      validateOpenParams("ext-a/chat", { chatId: "1", unread: 2 }, [chat]),
    ).not.toThrow();
    expect(() => validateOpenParams("ext-a/chat", { chatId: "1", unread: "2" }, [chat])).toThrow(
      /must be a number/,
    );
  });
});

describe("registerOpenKinds", () => {
  it("throws outside an extension scope", () => {
    expect(() => registerOpenKinds({ kinds: [] })).toThrow(/outside an extension scope/);
  });

  it("names a kind under the extension's id", () => {
    beginExtensionScope("ext-a", "1.0.0");
    registerOpenKinds({
      kinds: [{ id: "chat", label: "Chat", params: chat.params }],
    });
    expect(getScopedOpenKinds()).toEqual([chat]);
  });

  it("throws on a duplicate id, a namespaced id or a required param that is not one", () => {
    beginExtensionScope("ext-a", "1.0.0");
    registerOpenKinds({ kinds: [{ id: "chat", label: "Chat", params: chat.params }] });
    expect(() =>
      registerOpenKinds({ kinds: [{ id: "chat", label: "Chat", params: chat.params }] }),
    ).toThrow(/duplicate open kind/);
    expect(() =>
      registerOpenKinds({ kinds: [{ id: "a/b", label: "X", params: chat.params }] }),
    ).toThrow();
    expect(() =>
      registerOpenKinds({
        kinds: [
          {
            id: "x",
            label: "X",
            params: { type: "object", properties: {}, required: ["missing"] },
          },
        ],
      }),
    ).toThrow(/'missing' is not a param/);
  });
});

describe("registerSearchProvider", () => {
  it("throws outside an extension scope", () => {
    expect(() => registerSearchProvider({ id: "p", search: () => [] })).toThrow(
      /outside an extension scope/,
    );
  });

  it("captures providers, refusing a duplicate id", () => {
    beginExtensionScope("ext-a", "1.0.0");
    const search = () => [];
    registerSearchProvider({ id: "chats", search });
    expect(getScopedSearchProviders()?.map((p) => p.id)).toEqual(["chats"]);
    expect(() => registerSearchProvider({ id: "chats", search })).toThrow(
      /duplicate search provider/,
    );
  });

  it("throws without a search function", () => {
    beginExtensionScope("ext-a", "1.0.0");
    expect(() =>
      registerSearchProvider({ id: "x" } as unknown as Parameters<
        typeof registerSearchProvider
      >[0]),
    ).toThrow(/search/);
  });
});

describe("parseSearchItems", () => {
  it("keeps valid open and create items, and reports the rest", () => {
    const { items, problems } = parseSearchItems(
      [
        { kind: "ext-a/chat", params: { chatId: "1" }, title: "Hello", key: "1" },
        { create: "new-chat", title: "New chat" },
        { kind: "ext-a/chat", params: {}, title: "No id" },
        { kind: "ext-b/thing", params: {}, title: "Unknown kind" },
        { kind: "ext-a/chat", params: { chatId: "2" } },
        "junk",
      ],
      [chat],
    );
    expect(items).toEqual([
      { kind: "ext-a/chat", params: { chatId: "1" }, title: "Hello", key: "1" },
      { create: "new-chat", title: "New chat" },
    ]);
    expect(problems).toHaveLength(4);
  });

  it("reports a result that is not a list", () => {
    expect(parseSearchItems({}, []).problems).toEqual(["search returned no list"]);
  });
});

describe("openItemKey", () => {
  it("is the kind and the key when there is one", () => {
    expect(openItemKey({ kind: "ext-a/chat", params: { chatId: "1" }, key: "c1" })).toBe(
      "ext-a/chat:c1",
    );
  });

  it("is the kind and the params, in a stable order, without a key", () => {
    expect(openItemKey({ kind: "k/x", params: { b: 1, a: "2" } })).toBe(
      openItemKey({ kind: "k/x", params: { a: "2", b: 1 } }),
    );
  });
});
