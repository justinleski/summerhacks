import {
  PHOTOBOOTH_SLOTS_PER_STRIP,
  type MemoryPhoto,
} from "@summerhacks/shared";

/**
 * Round-robin across members by upload order, so a strip alternates people
 * instead of showing one member's whole roll first. N-safe.
 */
export function interleavePhotos(
  photosByUser: Map<string, MemoryPhoto[]>,
): MemoryPhoto[] {
  const orderedUserIds = [...photosByUser.keys()].sort();
  if (orderedUserIds.length === 0) return [];

  const maxPerUser = Math.max(
    ...[...photosByUser.values()].map((a) => a.length),
  );
  const out: MemoryPhoto[] = [];
  for (let i = 0; i < maxPerUser; i++) {
    for (const uid of orderedUserIds) {
      const p = photosByUser.get(uid)?.[i];
      if (p) out.push(p);
    }
  }
  return out;
}

export function groupPhotosByUser(
  photos: MemoryPhoto[],
): Map<string, MemoryPhoto[]> {
  const byUser = new Map<string, MemoryPhoto[]>();
  for (const photo of photos) {
    const list = byUser.get(photo.userId);
    if (list) list.push(photo);
    else byUser.set(photo.userId, [photo]);
  }
  for (const list of byUser.values()) {
    list.sort((a, b) => a.uploadOrder - b.uploadOrder);
  }
  return byUser;
}

/**
 * Paginated strips of 4. The final strip keeps its empty slots as `null` so it
 * renders as blank photobooth frames rather than collapsing.
 */
export function buildStrips(photos: MemoryPhoto[]): (MemoryPhoto | null)[][] {
  const interleaved = interleavePhotos(groupPhotosByUser(photos));
  const stripCount = Math.ceil(interleaved.length / PHOTOBOOTH_SLOTS_PER_STRIP);
  const strips: (MemoryPhoto | null)[][] = [];

  for (let s = 0; s < stripCount; s++) {
    const slots: (MemoryPhoto | null)[] = [];
    for (let i = 0; i < PHOTOBOOTH_SLOTS_PER_STRIP; i++) {
      slots.push(interleaved[s * PHOTOBOOTH_SLOTS_PER_STRIP + i] ?? null);
    }
    strips.push(slots);
  }
  return strips;
}
