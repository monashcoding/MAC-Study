import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearCachedStudySession,
  getStudySession,
  MacSignInRequiredError,
} from "./mac-auth-browser";

const session = {
  expiresAt: Math.floor(Date.now() / 1000) + 900,
  token: "study-token",
  user: {
    id: "45482c2a-4580-4e26-b210-72423b5fc951",
    email: "member@monashcoding.com",
    name: "MAC Member",
    roles: ["member"],
    team: null,
  },
};

afterEach(() => {
  clearCachedStudySession();
  vi.unstubAllGlobals();
});

describe("browser MAC sessions", () => {
  it("uses an existing MAC Study session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(session), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getStudySession()).resolves.toEqual(session);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/mac/session", {
      cache: "no-store",
    });
  });

  it("silently refreshes through central MAC Auth", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: "central-token" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(session), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getStudySession()).resolves.toEqual(session);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/auth/mac/session",
      expect.objectContaining({
        headers: { Authorization: "Bearer central-token" },
        method: "POST",
      }),
    );
  });

  it("requires interactive sign-in when no central session exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getStudySession()).rejects.toBeInstanceOf(
      MacSignInRequiredError,
    );
  });
});
