import { describe, expect, it } from "vitest";
import { compressImageForUpload } from "./compressImage";

describe("compressImageForUpload", () => {
  it("passes through non-image files", async () => {
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    await expect(compressImageForUpload(file)).resolves.toBe(file);
  });

  it("passes through gifs", async () => {
    const file = new File(["GIF89a"], "anim.gif", { type: "image/gif" });
    await expect(compressImageForUpload(file)).resolves.toBe(file);
  });

  it("passes through small images under the skip threshold", async () => {
    const file = new File(["tiny"], "pic.jpg", { type: "image/jpeg" });
    await expect(compressImageForUpload(file)).resolves.toBe(file);
  });
});
