import { describe, expect, it } from "vitest";
import {
  memberContributionStatus,
  shouldAutoSubmitMemory,
} from "./memberStatus";

describe("shouldAutoSubmitMemory", () => {
  it("is true only when not yet submitted and both photo + song exist", () => {
    expect(
      shouldAutoSubmitMemory({
        mySubmitted: false,
        photoCount: 1,
        songCount: 1,
      }),
    ).toBe(true);
    expect(
      shouldAutoSubmitMemory({
        mySubmitted: true,
        photoCount: 1,
        songCount: 1,
      }),
    ).toBe(false);
  });
});

describe("memberContributionStatus", () => {
  const member = {
    userId: "u1",
    displayName: "Ada",
    avatarUrl: null as string | null,
    submitted: false,
    isViewer: true,
  };

  it("marks done when member submitted", () => {
    expect(
      memberContributionStatus({ ...member, submitted: true }, [], []),
    ).toEqual({ ready: true, label: "marked done" });
  });

  it("is ready when both photo and song are present", () => {
    expect(
      memberContributionStatus(
        member,
        [{ userId: "u1" }],
        [{ userId: "u1" }],
      ),
    ).toEqual({ ready: true, label: "1 photo · 1 song" });
  });
});
