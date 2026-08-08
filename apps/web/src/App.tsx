import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SessionView } from "./features/session/SessionView";
import { HomePage } from "./pages/HomePage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/session/:id" element={<SessionView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
