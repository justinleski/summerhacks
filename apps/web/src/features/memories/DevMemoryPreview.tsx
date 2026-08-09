/**
 * Visual QA harness for the Memories pages at /dev/memory-preview.
 *
 * It renders the *real* page components as child routes and serves them fixture
 * data by stubbing `fetch` for `/api/...`, so the whole feature can be eyeballed
 * at any viewport without a database, auth, blob storage or a Spotify app.
 * Nothing here is imported by the pages themselves.
 */
import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import type {
  MemoryDraftResponse,
  MemoryListItem,
  MemoryLockedResponse,
  MemoryMember,
  MemoryPhoto,
  MemorySong,
} from "@summerhacks/shared";
import { MemoriesListPage } from "./MemoriesListPage";
import { MemoryBuildPage } from "./MemoryBuildPage";
import { MemoryDetailPage } from "./MemoryDetailPage";

// --- fixtures ---------------------------------------------------------------

/** Flat-colour placeholder so the harness needs no network. */
function swatch(hue: number, label: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180">` +
    `<rect width="240" height="180" fill="hsl(${hue} 32% 68%)"/>` +
    `<text x="120" y="98" font-family="monospace" font-size="22" fill="hsl(${hue} 45% 22%)" ` +
    `text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const UUID = (n: number) =>
  `0000000${n}-0000-4000-8000-00000000000${n % 10}`.slice(0, 36);

const MEMBERS: MemoryMember[] = [
  {
    userId: UUID(1),
    displayName: "Ada Lovelace",
    avatarUrl: null,
    submitted: true,
    isViewer: true,
  },
  {
    userId: UUID(2),
    displayName: "Grace Hopper",
    avatarUrl: null,
    submitted: false,
    isViewer: false,
  },
  {
    userId: UUID(3),
    displayName: "Katherine Johnson",
    avatarUrl: null,
    submitted: false,
    isViewer: false,
  },
];

const PHOTOS: MemoryPhoto[] = Array.from({ length: 10 }, (_, i) => ({
  id: `photo-${i}`,
  userId: MEMBERS[i % 2]!.userId,
  photoUrl: swatch(190 + i * 17, String(i + 1)),
  uploadOrder: Math.floor(i / 2),
}));

const SONGS: MemorySong[] = [
  ["Bachianas Brasileiras No. 5", "Heitor Villa-Lobos"],
  ["A Very Long Track Title That Has To Truncate", "Some Artist Or Other"],
  ["Clair de Lune", "Claude Debussy"],
  ["Gymnopédie No. 1", "Erik Satie"],
  ["Spiegel im Spiegel", "Arvo Pärt"],
  ["Time", "Hans Zimmer"],
].map(([trackTitle, artistName], i) => ({
  id: `song-${i}`,
  userId: MEMBERS[Math.floor(i / 3)]!.userId,
  position: i % 3,
  spotifyUrl: "https://open.spotify.com/track/000000000000000000000",
  spotifyTrackId: `track${i}`,
  trackTitle: trackTitle!,
  artistName: artistName!,
  albumArtUrl: swatch(20 + i * 40, "♪"),
}));

const HANGOUT_AT = "2026-06-14T19:20:00.000Z";

const LOCKED: MemoryLockedResponse = {
  id: UUID(7),
  sessionId: UUID(8),
  title: null,
  note: "we stayed until they turned the lights off",
  hangoutAt: HANGOUT_AT,
  windowStartsAt: HANGOUT_AT,
  windowExpiresAt: "2026-06-15T19:20:00.000Z",
  members: MEMBERS,
  status: "locked",
  lockedAt: "2026-06-15T02:00:00.000Z",
  photos: PHOTOS,
  songs: SONGS,
  myPlaylist: null,
};

const DRAFT: MemoryDraftResponse = {
  id: UUID(7),
  sessionId: UUID(8),
  title: null,
  note: "",
  hangoutAt: HANGOUT_AT,
  windowStartsAt: HANGOUT_AT,
  // Kept in the future so the countdown ticks instead of sitting at zero.
  windowExpiresAt: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
  members: MEMBERS.map((m) => ({ ...m, submitted: !m.isViewer && false })),
  status: "open",
  lockedAt: null,
  mySubmitted: false,
  myPhotos: PHOTOS.slice(0, 3),
  mySongs: SONGS.slice(0, 2),
};

const LIST: MemoryListItem[] = [
  ["Lighthouse night", 9, 0],
  [null, 6, 2],
  ["A very long memory title that should truncate here", 3, 4],
  [null, 12, 6],
  ["Rooftop", 6, 8],
  ["Nobody brought a camera", 3, -1],
].map(([title, songCount, coverIndex], i) => ({
  id: UUID(10 + i),
  sessionId: UUID(20 + i),
  title: title as string | null,
  hangoutAt: new Date(Date.parse(HANGOUT_AT) - i * 86400000).toISOString(),
  lockedAt: new Date(Date.parse(HANGOUT_AT) - i * 86400000).toISOString(),
  memberDisplayNames:
    i % 3 === 0
      ? MEMBERS.slice(0, 2).map((m) => m.displayName)
      : MEMBERS.map((m) => m.displayName),
  coverPhotoUrl:
    (coverIndex as number) < 0
      ? null
      : PHOTOS[coverIndex as number]!.photoUrl,
  songCount: songCount as number,
}));

// --- fetch stub -------------------------------------------------------------

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Scenario variants are flagged on the query string. */
function flag(name: string): boolean {
  return new URLSearchParams(window.location.search).has(name);
}

/** `?ready` fills the draft so the submit button enables and the modal opens. */
const READY_DRAFT: MemoryDraftResponse = {
  ...DRAFT,
  myPhotos: PHOTOS.slice(0, 4),
  mySongs: SONGS.slice(0, 3),
};

/** `?submitted` shows the post-submit waiting composition. */
const SUBMITTED_DRAFT: MemoryDraftResponse = {
  ...READY_DRAFT,
  mySubmitted: true,
  members: MEMBERS.map((m) => ({ ...m, submitted: m.isViewer })),
};

function currentDraft(): MemoryDraftResponse {
  if (flag("submitted")) return SUBMITTED_DRAFT;
  if (flag("ready")) return READY_DRAFT;
  return DRAFT;
}

function stubbedResponse(path: string, method: string): Response {
  if (path.startsWith("/api/spotify/status")) {
    return json({ connected: false, spotifyUserId: null });
  }
  if (path.startsWith("/api/spotify/connect")) {
    return json({ authUrl: "#preview-no-oauth" });
  }
  if (path === "/api/memories") {
    return json({ memories: flag("empty") ? [] : LIST });
  }
  if (path.includes("/api/memories/session/")) {
    return json({ memory: currentDraft() });
  }
  if (method !== "GET") {
    // Mutations are inert here; echo enough for the callers to stay happy.
    return json({ ok: true, title: null, note: null, song: SONGS[0] });
  }
  return json({ memory: LOCKED });
}

let installed = false;

function installFetchStub(): void {
  if (installed) return;
  installed = true;
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (!url.startsWith("/api/")) return real(input, init);
    const method = (
      init?.method ??
      (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    return stubbedResponse(url, method);
  };
}

// --- harness ----------------------------------------------------------------

const SCENARIOS = [
  { label: "Detail", to: `detail/${LOCKED.id}` },
  { label: "List", to: "list" },
  { label: "List (empty)", to: "list?empty" },
  { label: "Build", to: `build/${DRAFT.sessionId}` },
  { label: "Build (ready)", to: `build/${DRAFT.sessionId}?ready` },
  { label: "Build (waiting)", to: `build/${DRAFT.sessionId}?submitted` },
];

const linkStyle = (active: boolean) => ({
  padding: "6px 10px",
  borderRadius: 3,
  fontSize: 11,
  fontFamily: "monospace",
  textDecoration: "none",
  border: "1px solid #6b7a8f",
  background: active ? "#f5efe4" : "transparent",
  color: active ? "#0f1e33" : "#f5efe4",
});

export function DevMemoryPreview() {
  // Installed during the first render pass, before any page effect fires.
  useState(installFetchStub);

  useEffect(() => {
    document.title = "Memory preview";
  }, []);

  return (
    <>
      <nav
        data-preview-chrome
        style={{
          position: "fixed",
          zIndex: 100,
          top: 8,
          left: 8,
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          padding: 4,
          background: "#0f1e33",
          borderRadius: 4,
        }}
      >
        {SCENARIOS.map((s) => (
          <NavLink
            key={s.label}
            to={s.to}
            style={({ isActive }) => linkStyle(isActive)}
          >
            {s.label}
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route path="list" element={<MemoriesListPage />} />
        <Route path="detail/:id" element={<MemoryDetailPage />} />
        <Route path="build/:sessionId" element={<MemoryBuildPage />} />
        <Route
          path="*"
          element={<Navigate to={`detail/${LOCKED.id}`} replace />}
        />
      </Routes>
    </>
  );
}
