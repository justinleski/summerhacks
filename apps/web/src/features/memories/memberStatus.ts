import type { MemoryMember, MemoryPhoto, MemorySong } from "@summerhacks/shared";

export type MemberContributionStatus = {
  /** Ready signal for the green/pending dot. */
  ready: boolean;
  label: string;
};

/**
 * Peer status from actual contributions, not only soft "Mark done".
 * Mark done still wins as the explicit ready signal.
 */
export function memberContributionStatus(
  member: MemoryMember,
  photos: Pick<MemoryPhoto, "userId">[],
  songs: Pick<MemorySong, "userId">[],
): MemberContributionStatus {
  const photoCount = photos.filter((p) => p.userId === member.userId).length;
  const songCount = songs.filter((s) => s.userId === member.userId).length;

  if (member.submitted) {
    return { ready: true, label: "marked done" };
  }
  if (photoCount > 0 && songCount > 0) {
    return {
      ready: true,
      label: `${photoCount} photo${photoCount === 1 ? "" : "s"} · ${songCount} song${songCount === 1 ? "" : "s"}`,
    };
  }
  if (photoCount > 0 || songCount > 0) {
    const parts: string[] = [];
    if (photoCount > 0) {
      parts.push(`${photoCount} photo${photoCount === 1 ? "" : "s"}`);
    }
    if (songCount > 0) {
      parts.push(`${songCount} song${songCount === 1 ? "" : "s"}`);
    }
    return { ready: false, label: parts.join(" · ") };
  }
  return {
    ready: false,
    label: member.isViewer ? "still editing" : "still writing",
  };
}

/** Soft auto-submit once someone has both a photo and a song. */
export function shouldAutoSubmitMemory(opts: {
  mySubmitted: boolean;
  photoCount: number;
  songCount: number;
}): boolean {
  return (
    !opts.mySubmitted && opts.photoCount > 0 && opts.songCount > 0
  );
}
