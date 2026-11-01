import { describe, expect, it } from "vitest";
import { WEDDING, countdown, googleCalendarUrl } from "./saveTheDate";

describe("countdown", () => {
  it("splits the remaining time into d/h/m/s", () => {
    const now = new Date(WEDDING.startsAt.getTime() - ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000);
    expect(countdown(now)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 });
  });

  it("clamps to zero once the day has arrived", () => {
    const after = new Date(WEDDING.startsAt.getTime() + 60_000);
    expect(countdown(after)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});

describe("googleCalendarUrl", () => {
  it("is an all-day event on 8 Dec 2027", () => {
    const url = new URL(googleCalendarUrl());
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20271208/20271209");
  });
});
