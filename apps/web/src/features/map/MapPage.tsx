import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { CHECKIN_CAPTION_MAX, type Checkin } from "@summerhacks/shared";
import { api, uploadCheckinPhoto } from "../../lib/api";

const DEFAULT_CENTER: [number, number] = [40.7128, -74.006];

const CARTO_LIGHT_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const CARTO_ATTRIBUTION =
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

const checkinIcon = pinIcon("#2f6b3a", "#f4f7f2");
const meIcon = pinIcon("#e2ff6e", "#142016");

export function MapPage() {
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(true);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [region, setRegion] = useState("");
  const [caption, setCaption] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [busy, setBusy] = useState(false);

  const loadCheckins = useCallback(async () => {
    const res = await api<{ checkins: Checkin[] }>("/checkins/me");
    setCheckins(res.checkins);
  }, []);

  useEffect(() => {
    loadCheckins().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load check-ins"),
    );
  }, [loadCheckins]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setCenter(DEFAULT_CENTER);
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter([pos.coords.latitude, pos.coords.longitude]);
        setLocating(false);
      },
      () => {
        setCenter(DEFAULT_CENTER);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  async function submitCheckin(e: FormEvent) {
    e.preventDefault();
    if (!center) return;
    setError(null);
    setBusy(true);
    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        try {
          photoUrl = await uploadCheckinPhoto(photoFile);
        } catch (uploadErr) {
          setError(
            uploadErr instanceof Error
              ? uploadErr.message
              : "Photo upload failed",
          );
          setPhotoFile(null);
          setPhotoInputKey((k) => k + 1);
          setBusy(false);
          return;
        }
      }
      await api("/checkins", {
        method: "POST",
        body: JSON.stringify({
          lat: center[0],
          lng: center[1],
          region: region.trim(),
          caption: caption.trim() || undefined,
          photoUrl,
        }),
      });
      setRegion("");
      setCaption("");
      setPhotoFile(null);
      setPhotoInputKey((k) => k + 1);
      setShowModal(false);
      await loadCheckins();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="map-page">
      <header className="map-page__header">
        <div>
          <p className="eyebrow">Explore</p>
          <h1>Map</h1>
        </div>
        <div className="map-page__header-actions">
          <button
            type="button"
            className="primary"
            disabled={!center}
            onClick={() => setShowModal(true)}
          >
            Check in
          </button>
          <Link className="text-link" to="/">
            ← Home
          </Link>
        </div>
      </header>

      {error && <p className="error map-page__error">{error}</p>}

      <div className="map-container">
        {locating && !center ? (
          <p className="muted map-page__loading">Finding your location…</p>
        ) : center ? (
          <MapContainer
            center={center}
            zoom={13}
            scrollWheelZoom
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer url={CARTO_LIGHT_URL} attribution={CARTO_ATTRIBUTION} />
            <Marker position={center} icon={meIcon}>
              <Popup>You are here</Popup>
            </Marker>
            {checkins.map((c) => (
              <Marker key={c.id} position={[c.lat, c.lng]} icon={checkinIcon}>
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
        ) : null}
      </div>

      {showModal && (
        <div className="checkin-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="checkin-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Check in here</h2>
            <form className="stack-form" onSubmit={submitCheckin}>
              <label>
                Region
                <input
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="e.g. Downtown SF"
                  maxLength={120}
                  required
                />
              </label>
              <label>
                Caption (optional)
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={CHECKIN_CAPTION_MAX}
                  rows={3}
                  placeholder="What's happening?"
                />
                <span className="member-meta">
                  {caption.length}/{CHECKIN_CAPTION_MAX}
                </span>
              </label>
              <label>
                Photo (optional)
                <input
                  key={photoInputKey}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <div className="checkin-modal__actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={busy || !region.trim()}
                >
                  {busy ? "Checking in…" : "Check in"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
