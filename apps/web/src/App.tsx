import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";

const HomePage = lazy(() =>
  import("./pages/HomePage").then((m) => ({ default: m.HomePage })),
);
const CalendarPage = lazy(() =>
  import("./features/calendar/CalendarPage").then((m) => ({
    default: m.CalendarPage,
  })),
);
const EventDetailPage = lazy(() =>
  import("./features/calendar/EventDetailPage").then((m) => ({
    default: m.EventDetailPage,
  })),
);
const ExplorePage = lazy(() =>
  import("./features/explore/ExplorePage").then((m) => ({
    default: m.ExplorePage,
  })),
);
const FriendMapPage = lazy(() =>
  import("./features/friends/FriendMapPage").then((m) => ({
    default: m.FriendMapPage,
  })),
);
const FriendsPage = lazy(() =>
  import("./features/friends/FriendsPage").then((m) => ({
    default: m.FriendsPage,
  })),
);
const MapPage = lazy(() =>
  import("./features/map/MapPage").then((m) => ({ default: m.MapPage })),
);
const MemoriesListPage = lazy(() =>
  import("./features/memories/MemoriesListPage").then((m) => ({
    default: m.MemoriesListPage,
  })),
);
const MemoryBuildPage = lazy(() =>
  import("./features/memories/MemoryBuildPage").then((m) => ({
    default: m.MemoryBuildPage,
  })),
);
const MemoryDetailPage = lazy(() =>
  import("./features/memories/MemoryDetailPage").then((m) => ({
    default: m.MemoryDetailPage,
  })),
);
const ProfilePage = lazy(() =>
  import("./features/profile/ProfilePage").then((m) => ({
    default: m.ProfilePage,
  })),
);
const SessionView = lazy(() =>
  import("./features/session/SessionView").then((m) => ({
    default: m.SessionView,
  })),
);

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="route-loading">Loading…</div>}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/friends" element={<FriendsPage />} />
            <Route path="/friends/:friendId/map" element={<FriendMapPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/events/:id" element={<EventDetailPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/session/:id" element={<SessionView />} />
            <Route path="/memories" element={<MemoriesListPage />} />
            <Route
              path="/memories/session/:sessionId"
              element={<MemoryBuildPage />}
            />
            <Route path="/memories/:id" element={<MemoryDetailPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
