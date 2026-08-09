import L from "leaflet";

export const CARTO_LIGHT_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

function pinIcon(fill: string, ink: string): L.DivIcon {
  return L.divIcon({
    className: "checkin-pin",
    html: `<svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 10.4 12.4 20.9 14.4 22.5a.9.9 0 0 0 1.2 0C17.6 35.9 30 25.4 30 15 30 6.7 23.3 0 15 0z" fill="${fill}"/>
      <circle cx="15" cy="15" r="6" fill="${ink}"/>
    </svg>`,
    iconSize: [30, 38],
    iconAnchor: [15, 38],
    popupAnchor: [0, -32],
  });
}

/** The signed-in user's own location. */
export const meIcon = pinIcon("#e2ff6e", "#142016");
/** The signed-in user's own check-ins. */
export const checkinIcon = pinIcon("#2f6b3a", "#f4f7f2");
/** Friends' check-ins — visually distinct from the user's own pins. */
export const friendCheckinIcon = pinIcon("#4a7fd9", "#f4f7f2");
