import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import type { FriendMapResponse } from "@summerhacks/shared";
import { api } from "../../lib/api";
import {
  CARTO_ATTRIBUTION,
  currentCartoTileUrl,
  friendCheckinIcon,
} from "../map/mapConfig";

const DEFAULT_CENTER: [number, number] = [20, 0];

export function FriendMapPage() {
  const { friendId } = useParams<{ friendId: string }>();
  const [data, setData] = useState<FriendMapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!friendId) return;
    api<FriendMapResponse>(`/checkins/friends/${friendId}`)
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load map"),
      );
  }, [friendId]);

  if (error) {
    return (
      <main className="page">
        <p className="eyebrow">Friend</p>
        <h1>Can't view this map</h1>
        <p className="error">{error}</p>
        <Link className="text-link" to="/friends">
          ← Friends
        </Link>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const center: [number, number] =
    data.checkins.length > 0
      ? [data.checkins[0]!.lat, data.checkins[0]!.lng]
      : DEFAULT_CENTER;

  return (
    <main className="map-page">
      <header className="map-page__header">
        <div>
          <p className="eyebrow">Friend</p>
          <h1>{data.friend.displayName}</h1>
        </div>
        <Link className="text-link" to="/friends">
          ← Friends
        </Link>
      </header>

      <div className="map-container">
        {data.checkins.length === 0 ? (
          <p className="muted map-page__loading">No check-ins yet.</p>
        ) : (
          <MapContainer
            center={center}
            zoom={data.checkins.length > 1 ? 6 : 12}
            scrollWheelZoom
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer url={currentCartoTileUrl()} attribution={CARTO_ATTRIBUTION} />
            {data.checkins.map((c) => (
              <Marker
                key={c.id}
                position={[c.lat, c.lng]}
                icon={friendCheckinIcon}
              >
                <Popup>
                  <strong>{c.region ?? "Somewhere"}</strong>
                  {c.photoUrl && (
                    <img
                      src={c.photoUrl}
                      alt=""
                      style={{
                        display: "block",
                        width: "100%",
                        maxWidth: 200,
                        borderRadius: 8,
                        margin: "0.4rem 0",
                      }}
                    />
                  )}
                  {c.caption && <p style={{ margin: "0.2rem 0" }}>{c.caption}</p>}
                  <span className="member-meta">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>
    </main>
  );
}
