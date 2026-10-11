/**
 * <openp41ge-migrations-pane>, the manager window's Migrations tab: the data
 * version, the last failure, and each data migration that ran (newest first)
 * with when and what it did. Read-only.
 */
import { describe, test, expect, afterEach, vi } from "vitest";
import {
  Openp41geMigrationsPane,
  type MigrationsPaneDeps,
} from "../../../src/renderer/components/openp41ge-migrations-pane";

const STATUS = {
  appVersion: "0.1.0-alpha.11",
  dataVersion: "0.1.0-alpha.11",
  applied: [
    {
      id: "2026-10-09-chats",
      description: "Move chats",
      at: "2026-10-10T09:00:00.000Z",
      done: ["move a → b"],
    },
    { id: "2026-10-10-repos", at: "2026-10-10T09:00:01.000Z", done: [] },
  ],
  failed: { id: "2026-11-x", at: "2026-10-11T09:00:00.000Z", error: "x exists" },
};

const tick = () => new Promise((r) => setTimeout(r, 0));

async function mount(status: unknown): Promise<Openp41geMigrationsPane> {
  Openp41geMigrationsPane.deps = { status: vi.fn(async () => status) } as MigrationsPaneDeps;
  const el = document.createElement("openp41ge-migrations-pane") as Openp41geMigrationsPane;
  document.body.appendChild(el);
  await tick();
  await el.updateComplete;
  return el;
}

const $ = (el: Openp41geMigrationsPane, sel: string) =>
  el.shadowRoot!.querySelector<HTMLElement>(sel);
const $$ = (el: Openp41geMigrationsPane, sel: string) => [
  ...el.shadowRoot!.querySelectorAll<HTMLElement>(sel),
];

describe("openp41ge-migrations-pane", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("shows the data version and the app's", async () => {
    const el = await mount(STATUS);
    expect($(el, ".mp-versions")?.textContent).toContain("Data version 0.1.0-alpha.11");
    expect($(el, ".mp-versions")?.textContent).toContain("App 0.1.0-alpha.11");
  });

  test("lists what ran, newest first, by description (else id), with what it did", async () => {
    const el = await mount(STATUS);
    const items = $$(el, ".mp-item:not(.mp-item--failed)");
    expect(items.map((i) => i.querySelector(".mp-title")?.textContent)).toEqual([
      "2026-10-10-repos",
      "Move chats",
    ]);
    expect(items[1].textContent).toContain("move a → b");
    expect(items[1].textContent).toContain("2026-10-09-chats");
  });

  test("shows the last failure", async () => {
    const el = await mount(STATUS);
    expect($(el, ".mp-item--failed")?.textContent).toContain("x exists");
  });

  test("says when nothing has run", async () => {
    const el = await mount({ appVersion: "0.1.0", applied: [] });
    expect($(el, ".mp-state")?.textContent).toContain("No data migrations have run");
    expect($(el, ".mp-versions")?.textContent).toContain("Data version not recorded");
  });
});
