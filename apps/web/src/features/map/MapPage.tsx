import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import {
  CHECKIN_CAPTION_MAX,
  type Checkin,
  type FriendCheckin,
} from "@summerhacks/shared";
import { api, uploadCheckinPhoto } from "../../lib/api";
import {
  CARTO_ATTRIBUTION,
  CARTO_LIGHT_URL,
  checkinIcon,
  friendCheckinIcon,
  meIcon,
} from "./mapConfig";

const DEFAULT_CENTER: [number, number] = [40.7128, -74.006];

export function MapPage() {
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(true);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [friendCheckins, setFriendCheckins] = useState<FriendCheckin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [region, setRegion] = useState("");
  const [caption, setCaption] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [checkinsLoaded, setCheckinsLoaded] = useState(false);

  const loadCheckins = useCallback(async () => {
    const [mine, friends] = await Promise.all([
      api<{ checkins: Checkin[] }>("/checkins/me"),
      api<{ checkins: FriendCheckin[] }>("/checkins/friends"),
    ]);
    setCheckins(mine.checkins);
    setFriendCheckins(friends.checkins);
    setCheckinsLoaded(true);
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
          <>
            {checkinsLoaded &&
              checkins.length === 0 &&
              friendCheckins.length === 0 && (
                <p className="map-page__empty">
                  No check-ins yet — tap Check in to drop the first pin.
                </p>
              )}
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
            {friendCheckins.map((c) => (
              <Marker
                key={c.id}
                position={[c.lat, c.lng]}
                icon={friendCheckinIcon}
                zIndexOffset={1000}
              >
                <Popup>
                  <strong>{c.region ?? "Somewhere"}</strong>
                  <p className="member-meta" style={{ margin: "0.1rem 0" }}>
                    {c.ownerDisplayName}
                  </p>
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
          </>
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
