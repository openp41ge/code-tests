/**
 * RepositoryStates: the renderer's copy of each workspace repository's state
 * (context.repositoryStates), queried once per repo and again when the
 * platform reports a change in it.
 */
import { describe, it, expect, vi } from "vitest";
import type { RepositoryState } from "openp41ge-sdk";
import { RepositoryStates } from "@openp41ge/renderer/services/repository-states";

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function setup() {
  let version = 0;
  const query = vi.fn(async (repoName: string): Promise<RepositoryState> => ({
    repoName,
    branches: [
      { branch: "main", worktree: true, staged: 0, unstaged: version, untracked: 0, unpushed: 0 },
    ],
  }));
  const changed = vi.fn();
  const states = new RepositoryStates(query, changed);
  return { states, query, changed, bump: () => version++ };
}

describe("RepositoryStates", () => {
  it("queries each tracked repo once and reports when its state arrives", async () => {
    const { states, query, changed } = setup();
    states.track(["a", "b"]);
    states.track(["a", "b"]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(states.snapshot()).toEqual({});
    await flush();
    expect(Object.keys(states.snapshot()).sort()).toEqual(["a", "b"]);
    expect(changed).toHaveBeenCalled();
  });

  it("re-queries a tracked repo on refresh, and ignores untracked ones", async () => {
    const { states, query, bump } = setup();
    states.track(["a"]);
    await flush();
    bump();
    states.refresh("a");
    states.refresh("other");
    await flush();
    expect(query).toHaveBeenCalledTimes(2);
    expect(states.snapshot().a.branches[0].unstaged).toBe(1);
  });

  it("forgets repos no longer tracked", async () => {
    const { states } = setup();
    states.track(["a", "b"]);
    await flush();
    states.track(["b"]);
    expect(Object.keys(states.snapshot())).toEqual(["b"]);
  });

  it("runs one query at a time per repo, then once more if it changed meanwhile", async () => {
    const { states, query } = setup();
    states.track(["a"]);
    states.refresh("a");
    states.refresh("a");
    await flush();
    await flush();
    expect(query).toHaveBeenCalledTimes(2);
  });
});
