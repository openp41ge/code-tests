/**
 * The Git History Search sidebar's model: what it searches (which repos, which
 * options), how it streams each repo's history window by window and merges
 * the matches, what it fetches on demand, and the match helpers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  HistorySearchModel,
  SEARCH_WINDOW,
  entryParts,
  hits,
  resultsSummary,
  type HistorySearchApi,
} from "@openp41ge-extension-git/history-search-model";
import type { SearchResultCommit } from "@openp41ge-extension-git/git-types";

const result = (repoName: string, n: number, date: string): SearchResultCommit => ({
  repoName,
  hash: `${repoName}-h${n}`,
  shortHash: `h${n}`,
  message: `fix thing ${n}`,
  author: "a",
  date,
  relativeDate: "now",
  files: [{ path: `src/f${n}.ts`, additions: 1, deletions: 0 }],
});

const REPOS = ["github.com/acme/app", "github.com/acme/web"];

/** A fake history: each repo has `length` commits; one match per window,
 *  dated so app's are older than web's within a window. */
function fakeWindows(length: Record<string, number>) {
  return vi.fn(async (repo: string, _o: unknown, start: number, size: number) => {
    const walked = Math.max(0, Math.min(size, (length[repo] ?? 0) - start));
    const n = start / SEARCH_WINDOW;
    const day = String(28 - n * 2 - (repo === REPOS[0] ? 1 : 0)).padStart(2, "0");
    return {
      commits: walked ? [result(repo, n, `2026-09-${day}T00:00:00Z`)] : [],
      walked,
    };
  });
}

function setup(over: Partial<HistorySearchApi> = {}, length = { [REPOS[0]]: 300, [REPOS[1]]: 300 }) {
  const api: HistorySearchApi = {
    searchWindow: fakeWindows(length),
    matchContext: vi.fn(async () => ({ text: "the body says fix", in: "body" as const })),
    ...over,
  };
  const m = new HistorySearchModel(api, () => {});
  m.setRepos(REPOS);
  return { api, m };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("HistorySearchModel — searching", () => {
  it("searches every workspace repo after typing stops, newest results first", async () => {
    const { api, m } = setup();
    m.setQuery("fix");
    expect(api.searchWindow).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(api.searchWindow).toHaveBeenCalledWith(
      REPOS[0],
      { query: "fix", in: "message", caseSensitive: false, regex: false, content: false },
      0,
      SEARCH_WINDOW,
    );
    expect(m.state.results?.map((c) => c.repoName)).toEqual([REPOS[1], REPOS[0]]);
    expect(m.state.searching).toBe(false);
  });

  it("streams each repo's history window by window, up to the depth limit", async () => {
    const { api, m } = setup({}, { [REPOS[0]]: 5000, [REPOS[1]]: 700 });
    m.setMaxCount(2000);
    m.setQuery("fix");
    m.searchNow();
    await vi.advanceTimersByTimeAsync(0);
    const calls = (api.searchWindow as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => `${c[0] === REPOS[0] ? "app" : "web"}@${c[2]}`,
    );
    // web ends at 700; app stops at the depth limit (2000).
    expect(calls).toEqual(["app@0", "web@0", "app@500", "web@500", "app@1000", "app@1500"]);
    expect(m.state.walked).toBe(2700);
    expect(m.state.results).toHaveLength(6);
    // Merged newest first across repos.
    const dates = m.state.results!.map((c) => c.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("shows results while it is still searching", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const windows = fakeWindows({ [REPOS[0]]: 1000, [REPOS[1]]: 0 });
    const { m } = setup({
      searchWindow: vi.fn(async (repo, o, start, size) => {
        if (start > 0) await gate;
        return windows(repo, o, start, size);
      }),
    });
    m.setQuery("fix");
    m.searchNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.state.searching).toBe(true);
    expect(m.state.results).toHaveLength(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.state.searching).toBe(false);
    expect(m.state.results).toHaveLength(2);
  });

  it("runs at once on Enter, with the toggles' options", async () => {
    const { api, m } = setup();
    m.toggle("files");
    m.toggle("content");
    m.toggle("regex");
    m.toggle("caseSensitive");
    m.setQuery("f.x");
    m.searchNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.searchWindow).toHaveBeenCalledWith(
      REPOS[0],
      expect.objectContaining({ in: "all", content: true, regex: true, caseSensitive: true }),
      0,
      SEARCH_WINDOW,
    );
  });

  it("ignores the repo filter in a simple search (it is hidden)", async () => {
    const { api, m } = setup();
    m.setRepoFilter("web");
    m.setQuery("fix");
    m.searchNow();
    await vi.advanceTimersByTimeAsync(0);
    const repos = new Set(
      (api.searchWindow as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]),
    );
    expect([...repos]).toEqual(REPOS);
  });

  it("limits an advanced search to the repos the filter matches", async () => {
    const { api, m } = setup();
    m.setAdvanced(true);
    m.setRepoFilter("web");
    m.setQuery("fix");
    m.searchNow();
    await vi.advanceTimersByTimeAsync(0);
    const repos = new Set(
      (api.searchWindow as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]),
    );
    expect([...repos]).toEqual([REPOS[1]]);
  });

  it("asks each repo which of its worktrees a result is on", async () => {
    const { api, m } = setup();
    m.setWorktrees({ [REPOS[0]]: ["main", "feat/x"] });
    m.setQuery("fix");
    m.searchNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.searchWindow).toHaveBeenCalledWith(
      REPOS[0],
      expect.objectContaining({ worktrees: ["main", "feat/x"] }),
      0,
      SEARCH_WINDOW,
    );
    expect(api.searchWindow).toHaveBeenCalledWith(
      REPOS[1],
      expect.not.objectContaining({ worktrees: expect.anything() }),
      0,
      SEARCH_WINDOW,
    );
  });

  it("drops a search a newer one superseded", async () => {
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    const windows = fakeWindows({ [REPOS[0]]: 100, [REPOS[1]]: 100 });
    const { m } = setup({
      searchWindow: vi.fn(async (repo, o: { query: string }, start, size) => {
        if (o.query === "old") await slow;
        return windows(repo, o, start, size);
      }),
    });
    m.setQuery("old");
    m.searchNow();
    m.setQuery("new");
    m.searchNow();
    await vi.advanceTimersByTimeAsync(0);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.state.resultsQuery).toBe("new");
    expect(m.state.results).toHaveLength(2);
  });

  it("clears the results with the query", async () => {
    const { m } = setup();
    m.setQuery("fix");
    m.searchNow();
    await vi.advanceTimersByTimeAsync(0);
    m.setQuery("");
    expect(m.state.results).toBeNull();
  });

  it("shows a failure as the search's error when every repo fails", async () => {
    const { m } = setup({
      searchWindow: vi.fn(async () => {
        throw new Error("fatal: bad revision");
      }),
    });
    m.setQuery("fix");
    m.searchNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.state.error).toBe("fatal: bad revision");
  });

  it("keeps the other repos' results when one fails", async () => {
    const windows = fakeWindows({ [REPOS[1]]: 100 });
    const { m } = setup({
      searchWindow: vi.fn(async (repo, o, start, size) => {
        if (repo === REPOS[0]) throw new Error("not cloned");
        return windows(repo, o, start, size);
      }),
    });
    m.setQuery("fix");
    m.searchNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.state.error).toBeUndefined();
    expect(m.state.results?.map((c) => c.repoName)).toEqual([REPOS[1]]);
  });

  it("expands and collapses a commit", () => {
    const { m } = setup();
    m.toggleExpanded("k");
    expect(m.state.expanded).toEqual(["k"]);
    m.toggleExpanded("k");
    expect(m.state.expanded).toEqual([]);
  });
});

describe("HistorySearchModel — match lines on demand", () => {
  it("fetches where a result matched, once, when its subject and paths do not show it", async () => {
    const c = { ...result(REPOS[0], 0, "2026-09-01T00:00:00Z"), message: "chore" };
    const { api, m } = setup({
      searchWindow: vi.fn(async (repo: string, _o: unknown, start: number) =>
        repo === REPOS[0] && start === 0 ? { commits: [c], walked: 1 } : { commits: [], walked: 0 },
      ),
    });
    m.toggle("content");
    m.setQuery("fix");
    m.searchNow();
    await vi.advanceTimersByTimeAsync(0);
    m.loadMatch(c.hash);
    m.loadMatch(c.hash);
    await vi.advanceTimersByTimeAsync(0);
    expect(api.matchContext).toHaveBeenCalledTimes(1);
    expect(api.matchContext).toHaveBeenCalledWith(REPOS[0], c.hash, "fix", {
      regex: false,
      caseSensitive: false,
      content: true,
    });
    expect(m.state.results?.[0].matched).toEqual({ text: "the body says fix", in: "body" });
  });

  it("does not fetch for a result whose subject shows the match", async () => {
    const { api, m } = setup();
    m.setQuery("fix");
    m.searchNow();
    await vi.advanceTimersByTimeAsync(0);
    m.loadMatch(m.state.results![0].hash);
    expect(api.matchContext).not.toHaveBeenCalled();
  });
});

describe("hits", () => {
  it("finds every literal hit, ignoring case unless asked", () => {
    expect(hits("Fix the fix", "fix", { regex: false, caseSensitive: false })).toEqual([
      [0, 3],
      [8, 11],
    ]);
    expect(hits("Fix the fix", "fix", { regex: false, caseSensitive: true })).toEqual([[8, 11]]);
  });

  it("finds regex hits, and none for an invalid regex", () => {
    expect(hits("a1 b22", "\\d+", { regex: true, caseSensitive: false })).toEqual([
      [1, 2],
      [4, 6],
    ]);
    expect(hits("abc", "(", { regex: true, caseSensitive: false })).toEqual([]);
  });
});

describe("entryParts", () => {
  const opts = { regex: false, caseSensitive: false };
  const commit = (over: Partial<SearchResultCommit>): SearchResultCommit => ({
    ...result("github.com/acme/app", 1, "2026-10-01T00:00:00Z"),
    ...over,
  });

  it("splits the message around its first match", () => {
    expect(entryParts(commit({ message: "a fix and fix" }), "fix", opts)).toEqual({
      before: "a ",
      match: "fix",
      after: " and fix",
    });
  });

  it("uses the first matching path when the message does not match", () => {
    const c = commit({
      message: "chore",
      files: [
        { path: "a.ts", additions: 1, deletions: 0 },
        { path: "src/fix.ts", additions: 1, deletions: 0 },
      ],
    });
    expect(entryParts(c, "fix", opts)).toEqual({ before: "src/", match: "fix", after: ".ts" });
  });

  it("uses the body or changed line the search found", () => {
    const c = commit({ message: "chore", matched: { text: "Fixes the zorple", in: "body" } });
    expect(entryParts(c, "zorple", opts)).toEqual({
      before: "Fixes the ",
      match: "zorple",
      after: "",
    });
  });

  it("is the message whole when nothing shows the match", () => {
    expect(entryParts(commit({ message: "chore", files: [] }), "zzz", opts)).toEqual({
      before: "",
      match: "",
      after: "chore",
    });
  });
});

describe("resultsSummary", () => {
  it("says when there is nothing to search", () => {
    expect(
      resultsSummary(
        {
          resultsQuery: "",
          results: null,
          searching: false,
          walked: 0,
          total: 0,
          repoCount: 0,
        },
        0,
        1000,
      ),
    ).toBe("No repositories to search");
  });

  const base = {
    resultsQuery: "fix",
    searching: false,
    walked: 3000,
    total: 3000,
    repoCount: 3,
    elapsedMs: 1400,
  };
  const two = [
    result(REPOS[0], 1, "2026-10-01T00:00:00Z"),
    result(REPOS[1], 2, "2026-10-02T00:00:00Z"),
    result(REPOS[1], 3, "2026-10-03T00:00:00Z"),
  ];

  it("says how many results, across how many repositories, how much it searched and how long", () => {
    expect(resultsSummary({ ...base, results: two })).toBe(
      "3 results across 2 of 3 repositories · 3,000 commits searched · 1.4s",
    );
  });

  it("shows progress while searching", () => {
    expect(
      resultsSummary({ ...base, searching: true, walked: 1000, results: two.slice(0, 1) }),
    ).toBe("Searching… 1 result across 1 of 3 repositories · 1,000 / 3,000 commits");
  });

  it("is plain for one repository; before a search, says what one would cover", () => {
    expect(resultsSummary({ ...base, repoCount: 1, results: two.slice(0, 1) })).toBe(
      "1 result in 1 repository · 3,000 commits searched · 1.4s",
    );
    expect(resultsSummary({ ...base, resultsQuery: "", results: null }, 3, 1000)).toBe(
      "Searches 3 repositories · newest 1,000 commits each",
    );
  });
});
