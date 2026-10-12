/**
 * Fakes for the Releases tab's tests: the release list (as the main process's
 * feed pushes it), the update channel setting and the updater, behind the
 * `setReleasesDeps` seam.
 */
import { vi } from "vitest";
import type { ReleasesDeps } from "../../../src/renderer/services/releases-deps";
import type { GithubRelease } from "../../../src/renderer/services/releases-service";

export const release = (tag: string, published_at: string, body = `Notes for ${tag}.`): GithubRelease => ({
  tag_name: tag,
  name: tag,
  prerelease: tag.includes("-"),
  published_at,
  body,
  html_url: `https://github.com/openp41ge/code/releases/tag/${tag}`,
});

export const STABLE = release("v0.1.0", "2026-10-01T00:00:00Z");
export const BETA = release("v0.1.0-beta.1", "2026-10-05T00:00:00Z");
export const ALPHA_7 = release("v0.1.0-alpha.7", "2026-10-11T00:00:00Z");
export const ALPHA_8 = release("v0.1.0-alpha.8", "2026-10-12T00:00:00Z");

export function fakeReleases(
  opts: {
    channel?: string;
    snapshot?: Partial<ReleasesSnapshot>;
    installed?: string;
    status?: UpdaterStatus;
    download?: () => Promise<UpdaterStatus>;
    confirm?: boolean;
  } = {},
) {
  let snapshot: ReleasesSnapshot = {
    releases: [ALPHA_8, ALPHA_7, BETA, STABLE],
    fetchedAt: 1,
    checking: false,
    error: null,
    ...opts.snapshot,
  };
  let channel = opts.channel ?? "alpha";
  let status: UpdaterStatus = opts.status ?? { state: "idle", channel };
  const releaseListeners = new Set<(s: ReleasesSnapshot) => void>();
  const channelListeners = new Set<(c: string) => void>();
  const statusListeners = new Set<(s: UpdaterStatus) => void>();
  const deps: ReleasesDeps & {
    refreshReleases: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
    quitAndInstall: ReturnType<typeof vi.fn>;
  } = {
    getReleases: async () => snapshot,
    refreshReleases: vi.fn(async () => snapshot),
    onReleasesChange: (cb) => {
      releaseListeners.add(cb);
      return () => releaseListeners.delete(cb);
    },
    getChannel: () => channel,
    onChannelChange: (cb) => {
      channelListeners.add(cb);
      return () => channelListeners.delete(cb);
    },
    getInstalledVersion: async () => opts.installed ?? "",
    download: vi.fn(opts.download ?? (async () => status)),
    getStatus: async () => status,
    onUpdaterStatus: (cb) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    quitAndInstall: vi.fn(),
    confirmRestart: async () => opts.confirm ?? true,
  };
  return {
    deps,
    push(change: Partial<ReleasesSnapshot>) {
      snapshot = { ...snapshot, ...change };
      for (const l of releaseListeners) l(snapshot);
    },
    setChannel(c: string) {
      channel = c;
      for (const l of channelListeners) l(c);
    },
    emitStatus(s: UpdaterStatus) {
      status = s;
      for (const l of statusListeners) l(s);
    },
  };
}

export const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));
