import { describe, expect, it } from "vitest";
import {
  formatDuration,
  getElapsedSeconds,
  groupSessionsBySubject,
  isLongSession,
  sumCompletedSeconds,
} from "./timer";

describe("timer helpers", () => {
  it("formats seconds as a stable timer string", () => {
    expect(formatDuration(0)).toBe("00:00:00");
    expect(formatDuration(65)).toBe("00:01:05");
    expect(formatDuration(3661)).toBe("01:01:01");
  });

  it("calculates elapsed time from timestamps", () => {
    expect(
      getElapsedSeconds(
        "2026-06-04T01:00:00.000Z",
        new Date("2026-06-04T01:42:10.000Z"),
      ),
    ).toBe(2530);
  });

  it("sums and groups completed sessions", () => {
    const sessions = [
      {
        subjectId: "fit3159",
        startedAt: "2026-06-04T01:00:00.000Z",
        endedAt: "2026-06-04T01:30:00.000Z",
      },
      {
        subjectId: "fit3159",
        startedAt: "2026-06-04T02:00:00.000Z",
        endedAt: "2026-06-04T02:15:00.000Z",
      },
      {
        subjectId: "fit3077",
        startedAt: "2026-06-04T03:00:00.000Z",
        endedAt: "2026-06-04T03:20:00.000Z",
      },
    ];

    expect(sumCompletedSeconds(sessions)).toBe(3900);
    expect(groupSessionsBySubject(sessions)).toEqual({
      fit3159: 2700,
      fit3077: 1200,
    });
  });

  it("flags sessions that need confirmation after six hours", () => {
    expect(
      isLongSession(
        "2026-06-04T01:00:00.000Z",
        new Date("2026-06-04T07:00:00.000Z"),
      ),
    ).toBe(true);
  });
});
