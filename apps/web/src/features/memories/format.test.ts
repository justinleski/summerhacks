import { describe, expect, it } from "vitest";
import { formatCountdown, initialsOf, joinNames } from "./format";

describe("formatCountdown", () => {
  it("formats whole hours/minutes/seconds", () => {
    expect(formatCountdown(3_661_000)).toBe("01:01:01");
  });

  it("clamps negatives at zero", () => {
    expect(formatCountdown(-500)).toBe("00:00:00");
  });
});

describe("initialsOf", () => {
  it("takes up to three initials", () => {
    expect(initialsOf(["ada", "lovelace", "byron", "extra"])).toBe("ALB");
  });
});

describe("joinNames", () => {
  it("joins with the default separator", () => {
    expect(joinNames(["A", "B"])).toBe("A, B");
  });
});
