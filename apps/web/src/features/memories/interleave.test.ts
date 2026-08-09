import { describe, expect, it } from "vitest";
import type { MemoryPhoto } from "@summerhacks/shared";
import { buildStrips, groupPhotosByUser, interleavePhotos } from "./interleave";

function photo(
  id: string,
  userId: string,
  uploadOrder: number,
): MemoryPhoto {
  return {
    id,
    userId,
    photoUrl: `https://example.com/${id}.jpg`,
    uploadOrder,
  };
}

describe("groupPhotosByUser", () => {
  it("groups and sorts by uploadOrder", () => {
    const byUser = groupPhotosByUser([
      photo("b", "u1", 2),
      photo("a", "u1", 1),
      photo("c", "u2", 1),
    ]);
    expect([...byUser.get("u1")!].map((p) => p.id)).toEqual(["a", "b"]);
    expect(byUser.get("u2")!).toHaveLength(1);
  });
});

describe("interleavePhotos", () => {
  it("round-robins across users", () => {
    const map = new Map([
      ["u2", [photo("c", "u2", 1)]],
      ["u1", [photo("a", "u1", 1), photo("b", "u1", 2)]],
    ]);
    expect(interleavePhotos(map).map((p) => p.id)).toEqual(["a", "c", "b"]);
  });
});

describe("buildStrips", () => {
  it("pads the final strip with nulls", () => {
    const strips = buildStrips([photo("a", "u1", 1)]);
    expect(strips).toHaveLength(1);
    expect(strips[0]).toHaveLength(4);
    expect(strips[0][0]?.id).toBe("a");
    expect(strips[0].slice(1)).toEqual([null, null, null]);
  });
});
