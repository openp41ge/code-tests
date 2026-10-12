/**
 * Tests for the renderer releases helpers: channel-based filtering (the
 * Releases and Channels views) and tag/date helpers used by the Releases tab.
 */
import { describe, test, expect } from "vitest";
import {
  selectInRange,
  selectLatestPerChannel,
  channelsForUpdateChannel,
  compareTags,
  channelFromTag,
  formatReleaseDate,
  type GithubRelease,
} from "../../../src/renderer/services/releases-service";

const STABLE: GithubRelease = {
  tag_name: "v0.1.0",
  name: "v0.1.0",
  prerelease: false,
  published_at: "2026-09-30T00:00:00Z",
  body: "First stable release.",
  html_url: "https://github.com/openp41ge/app/releases/tag/v0.1.0",
};

const ALPHA: GithubRelease = {
  tag_name: "v0.1.0-alpha.4",
  name: "v0.1.0-alpha.4",
  prerelease: true,
  published_at: "2026-09-29T03:27:53Z",
  body: "Alpha 4.",
  html_url: "https://github.com/openp41ge/app/releases/tag/v0.1.0-alpha.4",
};

describe("releases-service — channelsForUpdateChannel", () => {
  test("latest resolves to the stable-only window", () => {
    expect(channelsForUpdateChannel("latest")).toEqual(["stable"]);
  });

  test("prerelease channels include themselves plus every more-stable channel", () => {
    expect(channelsForUpdateChannel("alpha")).toEqual(["alpha", "beta", "rc", "stable"]);
    expect(channelsForUpdateChannel("beta")).toEqual(["beta", "rc", "stable"]);
    expect(channelsForUpdateChannel("rc")).toEqual(["rc", "stable"]);
  });

  test("an unknown channel falls back to stable", () => {
    expect(channelsForUpdateChannel("nightly")).toEqual(["stable"]);
  });
});

describe("releases-service — selectLatestPerChannel", () => {
  const BETA = {
    ...ALPHA,
    tag_name: "v0.1.0-beta.2",
    name: "v0.1.0-beta.2",
    published_at: "2026-09-28T00:00:00Z",
  };
  const RC = {
    ...ALPHA,
    tag_name: "v0.1.0-rc.1",
    name: "v0.1.0-rc.1",
    published_at: "2026-09-29T12:00:00Z",
  };
  const ALPHA_OLD = { ...ALPHA, tag_name: "v0.1.0-alpha.1", name: "v0.1.0-alpha.1" };

  test("latest channel keeps only the newest stable release", () => {
    expect(selectLatestPerChannel("latest", [STABLE, ALPHA])).toEqual([STABLE]);
  });

  test("alpha shows the latest of every included channel, newest published first", () => {
    const result = selectLatestPerChannel("alpha", [STABLE, ALPHA, BETA, RC, ALPHA_OLD]);
    expect(result.map((r) => r.tag_name)).toEqual([
      "v0.1.0",
      "v0.1.0-rc.1",
      "v0.1.0-alpha.4",
      "v0.1.0-beta.2",
    ]);
  });

  test("drops historical releases older than the per-channel latest", () => {
    const result = selectLatestPerChannel("alpha", [STABLE, ALPHA, ALPHA_OLD]);
    expect(result.map((r) => r.tag_name)).toEqual(["v0.1.0", "v0.1.0-alpha.4"]);
    expect(result).not.toContain(ALPHA_OLD);
  });

  test("beta window excludes alpha releases", () => {
    const result = selectLatestPerChannel("beta", [STABLE, ALPHA, BETA]);
    expect(result.map((r) => r.tag_name)).toEqual(["v0.1.0", "v0.1.0-beta.2"]);
  });

  test("rc window shows rc and stable only", () => {
    const result = selectLatestPerChannel("rc", [STABLE, ALPHA, BETA, RC]);
    expect(result.map((r) => r.tag_name)).toEqual(["v0.1.0", "v0.1.0-rc.1"]);
  });
});

describe("releases-service — compareTags", () => {
  test("orders by core version then prerelease number", () => {
    expect(compareTags("v0.1.0-alpha.2", "v0.1.0-alpha.1")).toBeGreaterThan(0);
    expect(compareTags("v0.2.0", "v0.1.0")).toBeGreaterThan(0);
    expect(compareTags("v0.1.0", "v0.1.0")).toBe(0);
  });

  test("a stable release ranks above its same-core prerelease", () => {
    expect(compareTags("v0.1.0", "v0.1.0-rc.1")).toBeGreaterThan(0);
  });
});

describe("releases-service — helpers", () => {
  test("channelFromTag derives alpha/beta/rc/stable from the tag", () => {
    expect(channelFromTag("v0.1.0-alpha.4")).toBe("alpha");
    expect(channelFromTag("v0.2.0-beta.1")).toBe("beta");
    expect(channelFromTag("v0.3.0-rc.2")).toBe("rc");
    expect(channelFromTag("v1.0.0")).toBe("stable");
  });

  test("formatReleaseDate renders a localized date and handles bad input", () => {
    const out = formatReleaseDate("2026-09-29T03:27:53Z");
    expect(out).toMatch(/2026/);
    expect(formatReleaseDate(null)).toBe("");
    expect(formatReleaseDate("not-a-date")).toBe("");
  });
});

describe("selectInRange", () => {
  const r = (tag: string, published_at: string) => ({
    tag_name: tag,
    name: tag,
    prerelease: tag.includes("-"),
    published_at,
    body: null,
    html_url: null,
  });
  const all = [
    r("v0.1.0-alpha.7", "2026-10-11T00:00:00Z"),
    r("v0.1.0", "2026-10-01T00:00:00Z"),
    r("v0.1.0-alpha.8", "2026-10-12T00:00:00Z"),
    r("v0.1.0-beta.1", "2026-10-05T00:00:00Z"),
  ];

  test("lists every release in the setting's range, newest first", () => {
    expect(selectInRange("alpha", all).map((x) => x.tag_name)).toEqual([
      "v0.1.0-alpha.8",
      "v0.1.0-alpha.7",
      "v0.1.0-beta.1",
      "v0.1.0",
    ]);
  });

  test("leaves out less stable channels", () => {
    expect(selectInRange("beta", all).map((x) => x.tag_name)).toEqual(["v0.1.0-beta.1", "v0.1.0"]);
    expect(selectInRange("latest", all).map((x) => x.tag_name)).toEqual(["v0.1.0"]);
  });
});
