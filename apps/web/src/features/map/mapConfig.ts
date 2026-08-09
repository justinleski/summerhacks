import L from "leaflet";
import { getTheme } from "../../lib/theme";

export const CARTO_LIGHT_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
export const CARTO_DARK_URL =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** Match the map basemap to the app's current theme so the map doesn't look disconnected from the ocean/night aesthetic. */
export function currentCartoTileUrl(): string {
  return getTheme() === "dark" ? CARTO_DARK_URL : CARTO_LIGHT_URL;
}

const GLINT_PATH =
  "M15 8 L16.8 13.2 L22 15 L16.8 16.8 L15 22 L13.2 16.8 L8 15 L13.2 13.2 Z";

function pinIcon(
  gradientId: string,
  colorA: string,
  colorB: string,
  glintColor: string,
): L.DivIcon {
  return L.divIcon({
    className: "checkin-pin",
    html: `<svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="${gradientId}" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stop-color="${colorA}"/>
          <stop offset="100%" stop-color="${colorB}"/>
        </radialGradient>
      </defs>
      <path d="M15 0C6.7 0 0 6.7 0 15c0 10.4 12.4 20.9 14.4 22.5a.9.9 0 0 0 1.2 0C17.6 35.9 30 25.4 30 15 30 6.7 23.3 0 15 0z" fill="url(#${gradientId})"/>
      <path d="${GLINT_PATH}" fill="${glintColor}"/>
    </svg>`,
    iconSize: [30, 38],
    iconAnchor: [15, 38],
    popupAnchor: [0, -32],
  });
}

/** The signed-in user's own location. */
export const meIcon = pinIcon(
  "pin-gradient-me",
  "var(--marker-me)",
  "color-mix(in srgb, var(--marker-me) 55%, var(--bg0))",
  "var(--marker-me-ink)",
);
/** The signed-in user's own check-ins. */
export const checkinIcon = pinIcon(
  "pin-gradient-mine",
  "var(--marker-mine)",
  "color-mix(in srgb, var(--marker-mine) 55%, var(--bg0))",
  "var(--marker-mine-ink)",
);
/** Friends' check-ins — visually distinct from the user's own pins. */
export const friendCheckinIcon = pinIcon(
  "pin-gradient-friend",
  "var(--marker-friend)",
  "color-mix(in srgb, var(--marker-friend) 55%, var(--bg0))",
  "var(--marker-friend-ink)",
);
