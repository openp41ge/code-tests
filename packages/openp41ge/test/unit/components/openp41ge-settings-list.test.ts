// @vitest-environment jsdom
/**
 * The manager's Settings list: the platform's own settings first, then every
 * active extension that registered a settings schema. A click opens one (a
 * preview), a double-click pins it.
 */
import { describe, it, expect, vi } from "vitest";
import { Openp41geSettingsList } from "@openp41ge/renderer/components/openp41ge-settings-list";

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount() {
  const el = new Openp41geSettingsList();
  const onOpen = vi.fn();
  el.onOpen = onOpen;
  el.deps = {
    activeExtensions: () => [
      { id: "openp41ge-extension-explorer", version: "1" },
      { id: "openp41ge-extension-git", version: "1" },
      { id: "openp41ge-extension-agents", version: "1" },
    ],
    // Each settings schema's description; Git registered none.
    describe: async (id: string) =>
      ({
        openp41ge: { description: "Theme and editor" },
        "openp41ge-extension-explorer": { description: "Tree indentation" },
        "openp41ge-extension-agents": { description: "Chat providers" },
      })[id] ?? null,
    onExtensionsChanged: () => () => undefined,
  };
  document.body.appendChild(el);
  await flush();
  await el.updateComplete;
  return { el, onOpen };
}

const rows = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>("[data-settings-id]")];

describe("openp41ge-settings-list", () => {
  it("lists Platform first, then each extension with a settings schema, described by its schema", async () => {
    const { el } = await mount();
    expect(
      rows(el).map((r) => [
        r.dataset.settingsId,
        r.querySelector(".sl-name")?.textContent,
        r.querySelector(".sl-detail")?.textContent,
      ]),
    ).toEqual([
      ["openp41ge", "Platform", "Theme and editor"],
      ["openp41ge-extension-agents", "Agents", "Chat providers"],
      ["openp41ge-extension-explorer", "Explorer", "Tree indentation"],
    ]);
  });

  it("opens an entry on click, and pinned on double-click", async () => {
    const { el, onOpen } = await mount();
    const explorer = rows(el)[2];
    explorer.click();
    expect(onOpen).toHaveBeenLastCalledWith("openp41ge-extension-explorer", false);
    explorer.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(onOpen).toHaveBeenLastCalledWith("openp41ge-extension-explorer", true);
  });

  it("separates its rows with a line, as the Workspaces rows are", async () => {
    const { el } = await mount();
    const css = el.querySelector("style")?.textContent ?? "";
    expect(css).toMatch(/\.sl-row\s*\{[^}]*border-bottom:\s*1px solid var\(--divider/);
  });
});
