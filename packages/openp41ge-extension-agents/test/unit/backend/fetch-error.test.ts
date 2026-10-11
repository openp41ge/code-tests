/**
 * Unit tests for describeFetchError — a failed `fetch` (Node's undici) throws
 * a generic "fetch failed" TypeError whose `cause` holds the real reason.
 */

import { describe, it, expect } from "vitest";
import { describeFetchError } from "@openp41ge-extension-agents/backend/fetch-error";

/** A socket error the way Node reports it (code, address, port). */
function sysError(code: string, address?: string, port?: number): Error {
  return Object.assign(new Error(`connect ${code}`), { code, address, port });
}

describe("describeFetchError", () => {
  it("adds the cause's code and address to the message", () => {
    const err = new TypeError("fetch failed", {
      cause: sysError("EHOSTUNREACH", "192.168.1.238", 8000),
    });
    expect(describeFetchError(err)).toBe("fetch failed (EHOSTUNREACH 192.168.1.238:8000)");
  });

  it("uses the code alone when there is no address", () => {
    const err = new TypeError("fetch failed", { cause: sysError("ENOTFOUND") });
    expect(describeFetchError(err)).toBe("fetch failed (ENOTFOUND)");
  });

  it("uses the first inner error of an AggregateError cause", () => {
    const cause = new AggregateError([
      sysError("ECONNREFUSED", "::1", 8000),
      sysError("ECONNREFUSED", "127.0.0.1", 8000),
    ]);
    const err = new TypeError("fetch failed", { cause });
    expect(describeFetchError(err)).toBe("fetch failed (ECONNREFUSED ::1:8000)");
  });

  it("uses the cause's message when it has no code", () => {
    const err = new TypeError("fetch failed", { cause: new Error("other side closed") });
    expect(describeFetchError(err)).toBe("fetch failed (other side closed)");
  });

  it("returns the message unchanged without a cause", () => {
    expect(describeFetchError(new Error("The operation was aborted due to timeout"))).toBe(
      "The operation was aborted due to timeout",
    );
    expect(describeFetchError("boom")).toBe("boom");
  });
});
