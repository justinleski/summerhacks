import type { Context } from "hono";
import type { GeoPlace } from "../db/types.js";

function parseCoord(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function geoFromRequest(c: Context): GeoPlace {
  const headers = c.req.raw.headers;
  const forwarded = headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "127.0.0.1";

  const stubCity = process.env.DEV_GEO_CITY ?? "LocalDev";
  const stubRegion = process.env.DEV_GEO_REGION ?? "Dev";
  const stubCountry = process.env.DEV_GEO_COUNTRY ?? "XX";

  const city = headers.get("x-vercel-ip-city") ?? stubCity;
  const region =
    headers.get("x-vercel-ip-country-region") ?? stubRegion;
  const country = headers.get("x-vercel-ip-country") ?? stubCountry;
  const lat =
    parseCoord(headers.get("x-vercel-ip-latitude") ?? undefined) ??
    parseCoord(process.env.DEV_GEO_LAT) ??
    0;
  const lng =
    parseCoord(headers.get("x-vercel-ip-longitude") ?? undefined) ??
    parseCoord(process.env.DEV_GEO_LNG) ??
    0;

  return {
    ip,
    city,
    region,
    country,
    lat,
    lng,
  };
}
