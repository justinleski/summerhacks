import { afterEach, describe, expect, it, vi } from "vitest";
import { supportsOceanShader } from "./supportsOceanShader";

describe("supportsOceanShader", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is false when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    expect(supportsOceanShader()).toBe(false);
  });

  it("is false when reduced motion is preferred", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
    });
    expect(supportsOceanShader()).toBe(false);
  });

  it("is true when webgl2 context exists", () => {
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: (type: string) => (type === "webgl2" ? {} : null),
      }),
    });
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
    });
    expect(supportsOceanShader()).toBe(true);
  });
});
