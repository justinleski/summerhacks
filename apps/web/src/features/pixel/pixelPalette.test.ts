import { describe, expect, it } from "vitest";
import { PIXEL_PALETTE } from "./PixelCanvasEditor";

describe("PIXEL_PALETTE", () => {
  it("starts with transparent eraser slot", () => {
    expect(PIXEL_PALETTE[0]).toBeNull();
  });

  it("has 17 slots including eraser", () => {
    expect(PIXEL_PALETTE).toHaveLength(17);
  });
});
