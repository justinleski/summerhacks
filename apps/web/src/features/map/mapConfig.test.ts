import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("leaflet", () => ({
  default: {
    divIcon: (opts: unknown) => opts,
  },
}));

vi.mock("../../lib/theme", () => ({
  getTheme: () => "dark" as const,
}));

describe("mapConfig", () => {
  beforeAll(async () => {
    // Leaflet needs a window stub even when mocked if the real module loads first.
    vi.stubGlobal("window", { devicePixelRatio: 1 });
  });

  it("exports carto tile URLs and dark theme basemap", async () => {
    const mod = await import("./mapConfig");
    expect(mod.CARTO_LIGHT_URL).toContain("light_all");
    expect(mod.CARTO_DARK_URL).toContain("dark_all");
    expect(mod.currentCartoTileUrl()).toBe(mod.CARTO_DARK_URL);
  });

  it("includes OSM attribution", async () => {
    const mod = await import("./mapConfig");
    expect(mod.CARTO_ATTRIBUTION).toContain("OpenStreetMap");
  });
});
