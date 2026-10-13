/**
 * <openp41ge-migrations-pane>, the manager window's Migrations tab: the data
 * version next to the app's, whether the data is up to date (or the last
 * update couldn't be finished, with where to get the app again), and how many
 * updates ran and when the last did. Never what they were. Read-only.
 */
import { describe, test, expect, afterEach, vi } from "vitest";
import {
  Openp41geMigrationsPane,
  type MigrationsPaneDeps,
} from "../../../src/renderer/components/openp41ge-migrations-pane";

const STATUS = {
  appVersion: "0.1.0-alpha.12",
  dataVersion: "0.1.0-alpha.12",
  updates: 3,
  lastUpdateAt: "2026-10-10T09:00:01.000Z",
  failed: false,
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

describe("openp41ge-migrations-pane", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("shows the data version and the app's", async () => {
    const el = await mount(STATUS);
    expect($(el, ".mp-versions")?.textContent).toContain("Data version 0.1.0-alpha.12");
    expect($(el, ".mp-versions")?.textContent).toContain("App 0.1.0-alpha.12");
  });

  test("says the data is up to date, and how many updates ran", async () => {
    const el = await mount(STATUS);
    expect($(el, ".mp-state")?.textContent).toContain("Your data is up to date");
    expect($(el, ".mp-state")?.textContent).toContain("3 data updates");
    expect(el.shadowRoot!.querySelector(".mp-item")).toBeNull();
  });

  test("a failed update: says so and where to get the app again", async () => {
    const el = await mount({ ...STATUS, failed: true });
    expect($(el, ".mp-state")?.textContent).toContain("couldn't be finished");
    expect($(el, ".mp-state")?.textContent).toContain("GitHub");
  });

  test("says when nothing has run", async () => {
    const el = await mount({ appVersion: "0.1.0", updates: 0, failed: false });
    expect($(el, ".mp-state")?.textContent).toContain("No data updates have run");
    expect($(el, ".mp-versions")?.textContent).toContain("Data version not recorded");
  });
});
