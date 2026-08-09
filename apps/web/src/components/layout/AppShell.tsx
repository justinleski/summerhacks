import { Outlet } from "react-router-dom";
import { AmbientBackground } from "../ambient/AmbientBackground";
import { AmbientProvider } from "../../lib/ambient";
import { StarNav } from "../nav/StarNav";

/** Router layout route — every page gets the ambient background + nav with no per-page wiring. */
export function AppShell() {
  return (
    <AmbientProvider>
      <AmbientBackground />
      <StarNav />
      <Outlet />
    </AmbientProvider>
  );
}
