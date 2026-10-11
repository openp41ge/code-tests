/**
 * <agents-chats> — the Agents sidebar rendered: the new-chat row, the chats
 * as draggable rows (one open elsewhere says so), and the settings button.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "lit";
import {
  renderChats,
  type ChatsSidebarHost,
} from "@openp41ge-extension-agents/views/chats-sidebar";

const flush = () => new Promise((r) => setTimeout(r, 0));

function host(): ChatsSidebarHost & { config: { openEditor: ReturnType<typeof vi.fn> } } {
  return {
    dispatch: vi.fn(async (command: string) =>
      command === "list"
        ? [
            { id: "a", title: "Alpha", description: "First", updatedAt: 1, createdAt: 1 },
            { id: "b", title: "Beta", updatedAt: 2, createdAt: 2 },
          ]
        : command === "open-chats"
          ? { a: "elsewhere" }
          : undefined,
    ),
    subscribe: () => () => undefined,
    openTab: vi.fn(),
    config: { openEditor: vi.fn() },
  };
}

describe("<agents-chats>", () => {
  it("renders the chats as draggable rows and opens the config", async () => {
    const h = host();
    const box = document.createElement("div");
    document.body.appendChild(box);
    render(renderChats(h), box);
    await flush();
    await flush();
    const rows = [...box.querySelectorAll<HTMLElement>("[data-chat-id]")];
    expect(rows.map((r) => r.dataset.chatId)).toEqual(["b", "a"]);
    expect(rows[0].dataset.dragSourceId).toBe("chat");
    expect(rows[1].textContent).toContain("Open in another window");
    expect(box.textContent).toContain("New chat");

    rows[0].click();
    expect(h.openTab).toHaveBeenCalledWith(
      expect.objectContaining({ params: { chatId: "b" }, pinned: false }),
    );
    rows[1].click();
    expect(h.openTab).toHaveBeenCalledTimes(1);

    box.querySelector<HTMLButtonElement>('[aria-label="Agent settings"]')!.click();
    expect(h.config.openEditor).toHaveBeenCalled();
    box.remove();
  });
});
