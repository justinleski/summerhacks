import { Link } from "react-router-dom";
import type { Session } from "@summerhacks/shared";

export function RecentSessions({ sessions }: { sessions: Session[] }) {
  if (sessions.length === 0) {
    return (
      <section className="recent">
        <h2>Recent connections</h2>
        <p className="muted">No sessions yet — bump with someone to start.</p>
      </section>
    );
  }

  return (
    <section className="recent">
      <h2>Recent connections</h2>
      <ul className="session-list">
        {sessions.map((s) => {
          const others = s.members.map((m) => m.displayName).join(" · ");
          return (
            <li key={s.id}>
              <Link to={`/session/${s.id}`}>
                <span className="session-list__title">{others}</span>
                <span className="session-list__meta">
                  {s.status} · {new Date(s.createdAt).toLocaleString()}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
