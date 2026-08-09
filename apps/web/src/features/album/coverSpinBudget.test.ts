import { describe, expect, it } from "vitest";
import { coverSpinBudgetMs } from "./CoverSpin";

describe("coverSpinBudgetMs", () => {
  it("uses a short budget for a single cover", () => {
    expect(coverSpinBudgetMs(1)).toBe(600);
    expect(coverSpinBudgetMs(0)).toBe(600);
  });

  it("starts near 5s for two covers and grows slowly", () => {
    expect(coverSpinBudgetMs(2)).toBe(5000);
    expect(coverSpinBudgetMs(3)).toBeGreaterThan(5000);
    expect(coverSpinBudgetMs(5)).toBeGreaterThan(coverSpinBudgetMs(3));
  });
});
