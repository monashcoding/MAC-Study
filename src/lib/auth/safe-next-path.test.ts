import { describe, expect, it } from "vitest";
import { getSafeNextPath } from "./safe-next-path";

describe("getSafeNextPath", () => {
  it.each([undefined, null, "", "https://evil.example", "//evil.example"])(
    "falls back for an external or missing path: %s",
    (value) => {
      expect(getSafeNextPath(value)).toBe("/app");
    },
  );

  it.each(["/\\evil.example", "/app\\..\\evil"])(
    "falls back for a backslash path: %s",
    (value) => {
      expect(getSafeNextPath(value)).toBe("/app");
    },
  );

  it("keeps an internal path, query, and fragment", () => {
    expect(getSafeNextPath("/app/session?mode=focus#timer")).toBe(
      "/app/session?mode=focus#timer",
    );
  });

  it("supports a caller-specific fallback", () => {
    expect(getSafeNextPath("https://evil.example", "/")).toBe("/");
  });
});
