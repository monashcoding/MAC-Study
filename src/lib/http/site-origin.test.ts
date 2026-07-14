import { afterEach, describe, expect, it } from "vitest";
import { getSiteOrigin } from "./site-origin";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (originalSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
});

describe("getSiteOrigin", () => {
  it("uses the configured public site origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://study.monashcoding.com/path";

    expect(getSiteOrigin("https://localhost:3000")).toBe(
      "https://study.monashcoding.com",
    );
  });

  it("falls back when the site URL is missing", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;

    expect(getSiteOrigin("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
  });

  it("falls back when the site URL is invalid", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "not a URL";

    expect(getSiteOrigin("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
  });
});
