import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { CalendarPage } from "./features/calendar/CalendarPage";
import { EventDetailPage } from "./features/calendar/EventDetailPage";
import { FriendsPage } from "./features/friends/FriendsPage";
import { DevMemoryPreview } from "./features/memories/DevMemoryPreview";
import { MemoriesListPage } from "./features/memories/MemoriesListPage";
import { MemoryBuildPage } from "./features/memories/MemoryBuildPage";
import { MemoryDetailPage } from "./features/memories/MemoryDetailPage";
import { ProfilePage } from "./features/profile/ProfilePage";
import { SessionView } from "./features/session/SessionView";
import { HomePage } from "./pages/HomePage";
import { LoginDarkPage, LoginLightPage } from "./pages/LoginLayouts";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/events/:id" element={<EventDetailPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/login-light" element={<LoginLightPage />} />
        <Route path="/login-dark" element={<LoginDarkPage />} />
        <Route path="/session/:id" element={<SessionView />} />
        <Route path="/memories" element={<MemoriesListPage />} />
        <Route
          path="/memories/session/:sessionId"
          element={<MemoryBuildPage />}
        />
        <Route path="/memories/:id" element={<MemoryDetailPage />} />
        {/* Visual QA harness for the Memory pages — fixture data, no API. */}
        <Route path="/dev/memory-preview/*" element={<DevMemoryPreview />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
