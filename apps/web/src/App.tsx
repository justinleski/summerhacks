import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { CalendarPage } from "./features/calendar/CalendarPage";
import { EventDetailPage } from "./features/calendar/EventDetailPage";
import { FriendsPage } from "./features/friends/FriendsPage";
import { MapPage } from "./features/map/MapPage";
import { ProfilePage } from "./features/profile/ProfilePage";
import { SessionView } from "./features/session/SessionView";
import { HomePage } from "./pages/HomePage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/events/:id" element={<EventDetailPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/session/:id" element={<SessionView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
