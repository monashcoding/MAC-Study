import { describe, expect, it } from "vitest";
import { getMessageRateLimitError } from "./message-rate-limit";

describe("getMessageRateLimitError", () => {
  it("reads the retry delay from a rate limit error", () => {
    expect(getMessageRateLimitError("MESSAGE_RATE_LIMIT:7")).toEqual({
      message: "You're sending messages too fast. Try again in 7s.",
      retryAfterSeconds: 7,
    });
  });

  it("flags repeated text", () => {
    expect(getMessageRateLimitError("MESSAGE_DUPLICATE")).toEqual({
      message: "You just sent that. Try saying something new.",
      retryAfterSeconds: null,
    });
  });

  it("ignores unrelated errors", () => {
    expect(getMessageRateLimitError("new row violates row-level security")).toBeNull();
    expect(getMessageRateLimitError(undefined)).toBeNull();
  });
});
