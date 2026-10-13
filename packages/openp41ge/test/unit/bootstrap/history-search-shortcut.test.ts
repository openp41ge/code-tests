// @vitest-environment jsdom
/**
 * Cmd+Shift+H opens Git History Search (the git extension's
 * `history-search` sidebar) in the right sidebar of a workspace window.
 */
import { describe, it, expect, vi } from "vitest";

const emitEvent = vi.fn();
vi.mock("@openp41ge/renderer/app", () => ({ emitEvent: (...a: unknown[]) => emitEvent(...a) }));

const { RegisterShortcutsStep } = await import(
  "@openp41ge/renderer/bootstrap/steps/register-shortcuts.step"
);

describe("Cmd+Shift+H", () => {
  it("opens Git History Search in the right sidebar", async () => {
    const registered: Array<{ key: string; modifiers: number; description: string; handler: () => void }> = [];
    (window as unknown as { openp41ge: unknown }).openp41ge = {
      workspace: { getWindowId: () => "win-1" },
    };
    await new RegisterShortcutsStep().run({
      windowType: "workspace",
      keyboardManager: { register: (s: (typeof registered)[number]) => registered.push(s) },
    } as never);
    const shortcut = registered.find((s) => s.key === "h" && s.modifiers === 12)!;
    expect(shortcut.description).toBe("Open Git History Search");
    shortcut.handler();
    expect(emitEvent).toHaveBeenCalledWith("tab-open-system", {
      windowId: "win-1",
      side: "right",
      appType: "ext:openp41ge-extension-git:history-search",
      title: "Git History Search",
    });
  });
});
