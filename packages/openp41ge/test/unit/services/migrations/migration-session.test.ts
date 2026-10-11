/**
 * MigrationSession: what the migration window shows while pending sets run —
 * one row per set (pending → running → done / failed), stopping at a failure
 * until Retry.
 */
import { describe, it, expect, vi } from "vitest";
import { MigrationSession } from "@openp41ge/main/services/migrations/migration-session";

const set = (id: string) => ({ id, raw: { id, description: `about ${id}` } });

describe("MigrationSession", () => {
  it("runs each set in turn, reporting every change, and ends done", async () => {
    const apply = vi.fn(() => ({ ok: true }));
    const states: string[] = [];
    const session = new MigrationSession([set("a"), set("b")], apply, (s) =>
      states.push(`${s.phase}:${s.rows.map((r) => r.state).join(",")}`),
    );
    expect(session.state().rows.map((r) => [r.id, r.description, r.state])).toEqual([
      ["a", "about a", "pending"],
      ["b", "about b", "pending"],
    ]);
    await expect(session.run()).resolves.toBe(true);
    expect(apply.mock.calls.map(([s]) => s.id)).toEqual(["a", "b"]);
    expect(states).toEqual([
      "running:running,pending",
      "running:done,pending",
      "running:done,running",
      "done:done,done",
    ]);
  });

  it("stops at a failure with its error; Retry runs the rest", async () => {
    const apply = vi
      .fn()
      .mockReturnValueOnce({ ok: true })
      .mockReturnValueOnce({ ok: false, error: "b.json: exists" })
      .mockReturnValue({ ok: true });
    const session = new MigrationSession([set("a"), set("b"), set("c")], apply, () => {});
    await expect(session.run()).resolves.toBe(false);
    expect(session.state()).toMatchObject({
      phase: "failed",
      rows: [
        { id: "a", state: "done" },
        { id: "b", state: "failed", error: "b.json: exists" },
        { id: "c", state: "pending" },
      ],
    });
    await expect(session.run()).resolves.toBe(true);
    expect(apply.mock.calls.map(([s]) => s.id)).toEqual(["a", "b", "b", "c"]);
    expect(session.state().phase).toBe("done");
  });
});
