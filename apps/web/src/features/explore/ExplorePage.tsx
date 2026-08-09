import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  TALLY_POLL_INTERVAL_MS,
  type TallyResponse,
} from "@summerhacks/shared";
import { api } from "../../lib/api";

export function ExplorePage() {
  const [tally, setTally] = useState<TallyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api<TallyResponse>("/tally");
        if (!cancelled) {
          setTally(res);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load activity",
          );
        }
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), TALLY_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <main className="page explore-page">
      <p className="eyebrow">Live · no login needed</p>
      <h1>Explore</h1>
      <p className="lede">
        Activity across every region in the last {tally?.windowDays ?? 7} days.
      </p>

      {error && <p className="error">{error}</p>}

      {!tally ? (
        <p className="muted">Loading…</p>
      ) : tally.regions.length === 0 ? (
        <p className="muted">No activity yet.</p>
      ) : (
        <div className="tally-grid">
          {tally.regions.map((r) => (
            <div key={r.region} className="tally-card">
              <h2>{r.region}</h2>
              <div className="tally-stats">
                <div className="tally-stat">
                  <span className="tally-stat__number">{r.checkin}</span>
                  <span className="tally-stat__label">check-ins</span>
                </div>
                <div className="tally-stat">
                  <span className="tally-stat__number">{r.friendAdd}</span>
                  <span className="tally-stat__label">friends added</span>
                </div>
                <div className="tally-stat">
                  <span className="tally-stat__number">{r.eventJoin}</span>
                  <span className="tally-stat__label">event joins</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Link className="text-link" to="/">
        ← Home
      </Link>
    </main>
  );
}
