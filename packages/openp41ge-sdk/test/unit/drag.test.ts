/**
 * Unit tests for the drag & drop contract: namespaced payload kinds (the
 * platform's closed set under `openp41ge/`, and kinds an extension declares
 * under its own id), payload validation, declaration validation,
 * `registerDragDecls` scope capture, and the consumer/drop-target checks.
 */
import { describe, it, expect, afterEach } from "vitest";
import { beginExtensionScope, endExtensionScope, getScopedDragDecls } from "./scope-helper";
import {
  DRAG_CONTEXTS,
  PLATFORM_DRAG_KINDS,
  PLATFORM_DRAG_KIND_LABELS,
  validateDragPayload,
  parseDragRegistrations,
  dragConsumerSchema,
  dropTargetSchema,
  registerDragDecls,
  findConsumerDropTargetConflicts,
  validateDragDeclSurfaces,
  type DragKindDecl,
  type DragKindDef,
  type DragSourceDecl,
  type DragConsumerDecl,
  type DropTargetDecl,
} from "@openp41ge-sdk";

afterEach(() => {
  endExtensionScope();
});

const fileSource: DragSourceDecl = {
  id: "explorer-file",
  label: "File",
  kind: "openp41ge/file-path",
  attrs: { filePath: "data-path", fileName: "data-name" },
  contexts: ["workspace"],
  crossWindow: true,
};

const chatConsumer: DragConsumerDecl = {
  id: "agents-chat",
  accepts: ["chat-ext/chat-thread"],
  placement: ["grid"],
  open: { kind: "renderer-surface", surface: "grid:chat" },
};

const chatFileTarget: DropTargetDecl = {
  id: "chat-attach",
  surface: "grid:chat",
  accepts: ["openp41ge/file-path"],
};

/** A kind an extension ("ext-a") declares: a ticket with an id and a title. */
const ticketKind: DragKindDecl = {
  id: "ticket",
  label: "Ticket",
  schema: {
    type: "object",
    properties: { ticketId: { type: "string" }, title: { type: "string" } },
    required: ["ticketId"],
  },
};
const ticketDef: DragKindDef = {
  name: "ext-a/ticket",
  label: "Ticket",
  schema: ticketKind.schema,
};

describe("vocabulary", () => {
  it("contexts are the window types", () => {
    expect([...DRAG_CONTEXTS]).toEqual(["workspace", "manager", "logs"]);
  });

  it("the platform's kinds are a closed set under the openp41ge namespace", () => {
    expect([...PLATFORM_DRAG_KINDS].sort()).toEqual(
      [
        "openp41ge/command-run",
        "openp41ge/config-overrides",
        "openp41ge/file-path",
        "openp41ge/log-stream",
        "openp41ge/workspace-config",
      ].sort(),
    );
  });
});

describe("labels", () => {
  it("every platform kind has a label", () => {
    for (const kind of PLATFORM_DRAG_KINDS) expect(PLATFORM_DRAG_KIND_LABELS[kind]).toMatch(/\S/);
    expect(PLATFORM_DRAG_KIND_LABELS["openp41ge/file-path"]).toBe("File");
  });

  it("a consumer may have a label (not an empty one)", () => {
    expect(dragConsumerSchema.safeParse({ ...chatConsumer, label: "Chat" }).success).toBe(true);
    expect(dragConsumerSchema.safeParse({ ...chatConsumer, label: "" }).success).toBe(false);
  });
});

describe("validateDragPayload", () => {
  it("accepts a valid platform payload", () => {
    expect(validateDragPayload({ kind: "openp41ge/file-path", filePath: "/a/b.ts" })).toEqual({
      kind: "openp41ge/file-path",
      filePath: "/a/b.ts",
    });
  });

  it("rejects an unknown kind, and a kind without a namespace", () => {
    expect(() => validateDragPayload({ kind: "openp41ge/nope", filePath: "/a" })).toThrow(
      /unknown/,
    );
    expect(() => validateDragPayload({ kind: "file-path", filePath: "/a" })).toThrow();
  });

  it("rejects a missing or empty required field, and extra fields", () => {
    expect(() => validateDragPayload({ kind: "openp41ge/log-stream", label: "r" })).toThrow();
    expect(() => validateDragPayload({ kind: "openp41ge/file-path", filePath: "" })).toThrow();
    expect(() =>
      validateDragPayload({ kind: "openp41ge/file-path", filePath: "/a", extra: "x" }),
    ).toThrow();
  });

  it("validates an extension kind against its declared schema", () => {
    expect(validateDragPayload({ kind: "ext-a/ticket", ticketId: "T-1" }, [ticketDef])).toEqual({
      kind: "ext-a/ticket",
      ticketId: "T-1",
    });
    expect(() => validateDragPayload({ kind: "ext-a/ticket", title: "x" }, [ticketDef])).toThrow(
      /ticketId/,
    );
    expect(() =>
      validateDragPayload({ kind: "ext-a/ticket", ticketId: "T-1", other: "x" }, [ticketDef]),
    ).toThrow(/other/);
    expect(() => validateDragPayload({ kind: "ext-a/ticket", ticketId: 7 }, [ticketDef])).toThrow(
      /ticketId/,
    );
  });

  it("rejects an extension kind nobody declared", () => {
    expect(() => validateDragPayload({ kind: "ext-a/ticket", ticketId: "T-1" })).toThrow(/unknown/);
  });
});

describe("parseDragRegistrations: kinds", () => {
  it("names an extension's kinds under its id", () => {
    expect(parseDragRegistrations({ kinds: [ticketKind] }, "ext-a").kinds).toEqual([ticketDef]);
  });

  it("rejects a kind id with a namespace, a non-string field, or an unknown required field", () => {
    expect(() =>
      parseDragRegistrations({ kinds: [{ ...ticketKind, id: "other/ticket" }] }, "ext-a"),
    ).toThrow(/ticket/);
    expect(() =>
      parseDragRegistrations(
        {
          kinds: [
            {
              ...ticketKind,
              schema: { type: "object", properties: { n: { type: "number" } } },
            } as unknown as DragKindDecl,
          ],
        },
        "ext-a",
      ),
    ).toThrow();
    expect(() =>
      parseDragRegistrations(
        { kinds: [{ ...ticketKind, schema: { ...ticketKind.schema, required: ["nope"] } }] },
        "ext-a",
      ),
    ).toThrow(/nope/);
  });

  it("does not let an extension declare kinds in the platform's namespace", () => {
    expect(() => parseDragRegistrations({ kinds: [ticketKind] }, "openp41ge")).toThrow(/openp41ge/);
  });
});

describe("parseDragRegistrations: sources", () => {
  it("accepts a source of a platform kind, and of the extension's own kind", () => {
    expect(() => parseDragRegistrations({ sources: [fileSource] }, "ext-a")).not.toThrow();
    const own: DragSourceDecl = {
      id: "ticket-row",
      label: "Ticket",
      kind: "ext-a/ticket",
      attrs: { ticketId: "data-id" },
      contexts: ["workspace"],
    };
    // Declared in the same registration, or earlier (passed as known kinds).
    expect(() =>
      parseDragRegistrations({ kinds: [ticketKind], sources: [own] }, "ext-a"),
    ).not.toThrow();
    expect(() => parseDragRegistrations({ sources: [own] }, "ext-a", [ticketDef])).not.toThrow();
  });

  it("rejects a source of another extension's kind, or of an undeclared kind", () => {
    const foreign = { ...fileSource, kind: "ext-b/ticket", attrs: { ticketId: "data-id" } };
    expect(() => parseDragRegistrations({ sources: [foreign] }, "ext-a")).toThrow(/ext-b\/ticket/);
  });

  it("checks attrs against the kind's fields", () => {
    expect(() =>
      parseDragRegistrations(
        { sources: [{ ...fileSource, attrs: { filePath: "data-path", bogus: "data-x" } }] },
        "ext-a",
      ),
    ).toThrow(/bogus/);
    expect(() =>
      parseDragRegistrations(
        { sources: [{ ...fileSource, attrs: { filePath: "data-path", kind: "data-k" } }] },
        "ext-a",
      ),
    ).toThrow(/kind/);
    expect(() =>
      parseDragRegistrations(
        { sources: [{ ...fileSource, attrs: { fileName: "data-name" } }] },
        "ext-a",
      ),
    ).toThrow(/filePath/);
  });

  it("rejects an unknown or empty contexts list", () => {
    expect(() =>
      parseDragRegistrations(
        { sources: [{ ...fileSource, contexts: ["window-manager"] } as unknown as DragSourceDecl] },
        "ext-a",
      ),
    ).toThrow();
    expect(() =>
      parseDragRegistrations({ sources: [{ ...fileSource, contexts: [] }] }, "ext-a"),
    ).toThrow();
  });
});

describe("dragConsumerSchema / dropTargetSchema", () => {
  it("accepts valid declarations, including another extension's kind", () => {
    expect(() => dragConsumerSchema.parse(chatConsumer)).not.toThrow();
    expect(() =>
      dragConsumerSchema.parse({ ...chatConsumer, accepts: ["ext-b/ticket"] }),
    ).not.toThrow();
    expect(() =>
      dragConsumerSchema.parse({
        id: "file-viewer",
        accepts: ["openp41ge/file-path"],
        placement: ["grid"],
        open: { kind: "app", appType: "file-viewer" },
      }),
    ).not.toThrow();
    expect(() => dropTargetSchema.parse(chatFileTarget)).not.toThrow();
  });

  it("rejects a kind without a namespace in accepts", () => {
    expect(() => dragConsumerSchema.parse({ ...chatConsumer, accepts: ["chat-thread"] })).toThrow();
    expect(() => dropTargetSchema.parse({ ...chatFileTarget, accepts: ["file-path"] })).toThrow();
  });

  it("rejects empty accepts / placement", () => {
    expect(() => dragConsumerSchema.parse({ ...chatConsumer, accepts: [] })).toThrow();
    expect(() => dragConsumerSchema.parse({ ...chatConsumer, placement: [] })).toThrow();
    expect(() => dropTargetSchema.parse({ ...chatFileTarget, accepts: [] })).toThrow();
  });

  it("requires a qualified kind:id surface for renderer-surface consumers", () => {
    expect(() =>
      dragConsumerSchema.parse({
        ...chatConsumer,
        open: { kind: "renderer-surface", surface: "chat" },
      }),
    ).toThrow();
  });

  it("accepts a platform app type as a drop target surface", () => {
    expect(() => dropTargetSchema.parse({ ...chatFileTarget, surface: "agents" })).not.toThrow();
  });

  it("requires extension drop targets to name a qualified kind:id surface", () => {
    beginExtensionScope("ext-a", "1.0.0");
    expect(() =>
      registerDragDecls({ dropTargets: [{ ...chatFileTarget, surface: "chat" }] }),
    ).toThrow(/chat-attach/);
  });
});

describe("registerDragDecls", () => {
  it("throws when called outside an extension scope", () => {
    expect(() => registerDragDecls({ sources: [fileSource] })).toThrow(
      /outside an extension scope/,
    );
  });

  it("returns null from getScopedDragDecls when no scope is open", () => {
    expect(getScopedDragDecls()).toBeNull();
  });

  it("captures declarations against the open scope, across calls", () => {
    beginExtensionScope("ext-a", "1.0.0");
    registerDragDecls({ kinds: [ticketKind] });
    registerDragDecls({ sources: [fileSource] });
    registerDragDecls({ consumers: [chatConsumer], dropTargets: [chatFileTarget] });
    expect(getScopedDragDecls()).toEqual({
      kinds: [ticketDef],
      sources: [fileSource],
      consumers: [chatConsumer],
      dropTargets: [chatFileTarget],
    });
  });

  it("lets a later call's source use a kind declared earlier in the scope", () => {
    beginExtensionScope("ext-a", "1.0.0");
    registerDragDecls({ kinds: [ticketKind] });
    expect(() =>
      registerDragDecls({
        sources: [
          {
            id: "ticket-row",
            label: "Ticket",
            kind: "ext-a/ticket",
            attrs: { ticketId: "data-id" },
            contexts: ["workspace"],
          },
        ],
      }),
    ).not.toThrow();
  });

  it("throws on a non-conforming declaration", () => {
    beginExtensionScope("ext-a", "1.0.0");
    expect(() =>
      registerDragDecls({
        sources: [{ ...fileSource, kind: "nope" } as unknown as DragSourceDecl],
      }),
    ).toThrow(/explorer-file|kind/);
  });

  it("throws on a duplicate id within the same registration type", () => {
    beginExtensionScope("ext-a", "1.0.0");
    registerDragDecls({ sources: [fileSource], kinds: [ticketKind] });
    expect(() => registerDragDecls({ sources: [fileSource] })).toThrow(/duplicate.*explorer-file/i);
    expect(() => registerDragDecls({ kinds: [ticketKind] })).toThrow(/duplicate.*ticket/i);
  });

  it("throws when a surface consumes and receives the same kind", () => {
    beginExtensionScope("ext-a", "1.0.0");
    registerDragDecls({ consumers: [chatConsumer] });
    expect(() =>
      registerDragDecls({
        dropTargets: [{ ...chatFileTarget, accepts: ["chat-ext/chat-thread"] }],
      }),
    ).toThrow(/grid:chat.*chat-ext\/chat-thread/);
  });

  it("clears drag declarations when the scope closes", () => {
    beginExtensionScope("ext-a", "1.0.0");
    registerDragDecls({ sources: [fileSource] });
    endExtensionScope();
    beginExtensionScope("ext-b", "1.0.0");
    expect(getScopedDragDecls()).toEqual({
      kinds: [],
      sources: [],
      consumers: [],
      dropTargets: [],
    });
  });
});

describe("findConsumerDropTargetConflicts", () => {
  it("allows a surface to consume one kind and receive another", () => {
    expect(findConsumerDropTargetConflicts([chatConsumer], [chatFileTarget])).toEqual([]);
  });

  it("reports a surface that consumes and receives the same kind", () => {
    const conflicts = findConsumerDropTargetConflicts(
      [chatConsumer],
      [{ ...chatFileTarget, accepts: ["openp41ge/file-path", "chat-ext/chat-thread"] }],
    );
    expect(conflicts).toEqual([
      {
        surface: "grid:chat",
        kind: "chat-ext/chat-thread",
        consumerId: "agents-chat",
        dropTargetId: "chat-attach",
      },
    ]);
  });

  it("matches platform app consumers by appType", () => {
    const conflicts = findConsumerDropTargetConflicts(
      [
        {
          id: "fv",
          accepts: ["openp41ge/file-path"],
          placement: ["grid"],
          open: { kind: "app", appType: "file-viewer" },
        },
      ],
      [{ id: "fv-drop", surface: "file-viewer", accepts: ["openp41ge/file-path"] }],
    );
    expect(conflicts).toHaveLength(1);
  });

  it("does not match different surfaces", () => {
    expect(
      findConsumerDropTargetConflicts(
        [chatConsumer],
        [{ ...chatFileTarget, surface: "sidebar:chat", accepts: ["chat-ext/chat-thread"] }],
      ),
    ).toEqual([]);
  });
});

describe("validateDragDeclSurfaces", () => {
  const decls = {
    kinds: [],
    sources: [],
    consumers: [chatConsumer],
    dropTargets: [chatFileTarget],
  };

  it("accepts declarations that reference the extension's own surfaces", () => {
    expect(() => validateDragDeclSurfaces(decls, ["grid:chat", "sidebar:history"])).not.toThrow();
  });

  it("throws when a drop target names a surface the extension does not own", () => {
    expect(() => validateDragDeclSurfaces(decls, ["grid:other"])).toThrow(/chat-attach.*grid:chat/);
  });

  it("throws when a renderer-surface consumer names a surface the extension does not own", () => {
    expect(() => validateDragDeclSurfaces({ ...decls, dropTargets: [] }, ["sidebar:chat"])).toThrow(
      /agents-chat.*grid:chat/,
    );
  });

  it("does not require ownership for app consumers", () => {
    expect(() =>
      validateDragDeclSurfaces(
        {
          kinds: [],
          sources: [],
          consumers: [
            {
              id: "fv",
              accepts: ["openp41ge/file-path"],
              placement: ["grid"],
              open: { kind: "app", appType: "file-viewer" },
            },
          ],
          dropTargets: [],
        },
        [],
      ),
    ).not.toThrow();
  });
});
