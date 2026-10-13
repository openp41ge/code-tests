// @vitest-environment jsdom
/**
 * The Settings editor saves the platform settings through its window's
 * config service, so that window's own listeners (its JSON editors, which
 * follow editor/json and editor/*) see the change too. Writing straight to
 * the config IPC reached only the other windows: the main process skips the
 * sender, expecting its config service to have applied the change.
 */
import { describe, it, expect, vi } from "vitest";

const serviceSet = vi.fn(async () => undefined);
vi.mock("@openp41ge/renderer/app", () => ({
  appServices: { configService: { set: (...a: unknown[]) => serviceSet(...a) } },
  emitEvent: vi.fn(),
}));

const ipcSet = vi.fn(async () => undefined);
(window as unknown as { openp41ge: unknown }).openp41ge = {
  config: {
    getDefaults: async () => ({ "editor/*": { lineHeight: 20, fontSize: 14 } }),
    getOverrides: async () => ({}),
    set: ipcSet,
    onChanged: () => () => undefined,
  },
  extension: {
    config: {
      registerSchema: async () => undefined,
      get: async () => ({}),
      describe: async () => null,
      set: async () => undefined,
      onChanged: () => () => undefined,
    },
  },
};

await import("@openp41ge/renderer/components/openp41ge-config-editor");

describe("Settings editor: saving the platform settings", () => {
  it("writes through the window's config service, not the raw IPC", async () => {
    const el = document.createElement("openp41ge-config-editor") as HTMLElement & {
      _bridge(): { set(id: string, doc: Record<string, unknown>): Promise<void> };
    };
    await el._bridge().set("openp41ge", { "editor/json": { fontSize: 12 } });
    expect(serviceSet).toHaveBeenCalledWith("editor/json", { fontSize: 12 });
    expect(ipcSet).not.toHaveBeenCalled();
  });
});
