import { afterEach, describe, expect, it, vi } from "vitest";
import { vibrateConfirm } from "./useBumpHaptics";

describe("vibrateConfirm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no-ops when vibrate is unavailable", () => {
    vi.stubGlobal("navigator", {});
    expect(() => vibrateConfirm()).not.toThrow();
  });

  it("pulses when vibrate exists", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    vibrateConfirm();
    expect(vibrate).toHaveBeenCalledWith([40, 40, 80]);
  });
});
