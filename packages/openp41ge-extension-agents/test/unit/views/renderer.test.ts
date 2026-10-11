/**
 * The renderer entry: its surfaces and drag declarations, as the platform
 * captures them (and validates the declarations against the surfaces).
 */
import { describe, it, expect } from "vitest";
import {
  beginExtensionScope,
  endExtensionScope,
  getScopedDragDecls,
  getScopedRenderers,
} from "openp41ge-core-extension-host/scope";
import { validateDragDeclSurfaces } from "openp41ge-sdk";

describe("renderer entry", () => {
  it("registers the Agents and Search chats sidebars, the chat tab, and chat drags", async () => {
    beginExtensionScope("openp41ge-extension-agents", "0.1.0");
    try {
      await import("@openp41ge-extension-agents/renderer");
      const surfaces = getScopedRenderers() ?? [];
      expect(surfaces.map((s) => `${s.kind}:${s.id}`)).toEqual([
        "sidebar:chats",
        "sidebar:search",
        "grid:chat",
      ]);
      const drag = getScopedDragDecls()!;
      // Chats are this extension's own payload kind.
      expect(drag.kinds).toMatchObject([
        {
          name: "openp41ge-extension-agents/chat-thread",
          schema: { required: ["chatId"] },
        },
      ]);
      expect(drag.consumers).toMatchObject([
        { accepts: ["openp41ge-extension-agents/chat-thread"] },
      ]);
      expect(drag.sources).toMatchObject([{ kind: "openp41ge-extension-agents/chat-thread" }]);
      expect(() =>
        validateDragDeclSurfaces(
          drag,
          surfaces.map((s) => `${s.kind}:${s.id}`),
        ),
      ).not.toThrow();
    } finally {
      endExtensionScope();
    }
  });
});
