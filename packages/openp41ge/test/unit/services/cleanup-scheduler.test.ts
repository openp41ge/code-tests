/**
 * CleanupScheduler: cleanup runs shortly after startup, and again once
 * workspace files have stopped changing for a while.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CleanupScheduler } from "@openp41ge/main/services/cleanup-scheduler";

describe("CleanupScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs once after the startup delay", () => {
    const run = vi.fn();
    const s = new CleanupScheduler(run, { startupDelayMs: 1000, settleMs: 500 });
    s.start();
    vi.advanceTimersByTime(999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs once after a burst of workspace changes settles", () => {
    const run = vi.fn();
    const s = new CleanupScheduler(run, { startupDelayMs: 1000, settleMs: 500 });
    s.workspacesChanged();
    vi.advanceTimersByTime(400);
    s.workspacesChanged();
    vi.advanceTimersByTime(400);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs nothing after stop", () => {
    const run = vi.fn();
    const s = new CleanupScheduler(run, { startupDelayMs: 1000, settleMs: 500 });
    s.start();
    s.workspacesChanged();
    s.stop();
    vi.advanceTimersByTime(5000);
    expect(run).not.toHaveBeenCalled();
  });
});
