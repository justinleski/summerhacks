import { useEffect, useRef, useState } from "react";
import {
  BUMP_POLL_INTERVAL_MS,
  type BumpResponse,
} from "@summerhacks/shared";
import { api } from "../../lib/api";

export function useBumpSearch() {
  const [bump, setBump] = useState<BumpResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const pollRef = useRef<number | null>(null);
  const bumpIdRef = useRef<string | null>(null);

  function stopPolling() {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function startSearch(peakMagnitude: number) {
    stopPolling();
    setError(null);
    setSearching(true);

    try {
      const created = await api<BumpResponse>("/bumps", {
        method: "POST",
        body: JSON.stringify({
          clientTimestamp: Date.now(),
          peakMagnitude,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setBump(created);
      bumpIdRef.current = created.bumpId;

      if (created.status === "matched") {
        setSearching(false);
        return created;
      }

      pollRef.current = window.setInterval(async () => {
        const id = bumpIdRef.current;
        if (!id) return;
        try {
          const next = await api<BumpResponse>(`/bumps/${id}`);
          setBump(next);
          if (next.status === "matched" || next.status === "expired") {
            stopPolling();
            setSearching(false);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Poll failed");
          stopPolling();
          setSearching(false);
        }
      }, BUMP_POLL_INTERVAL_MS);

      return created;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bump failed");
      setSearching(false);
      return null;
    }
  }

  async function cancel() {
    stopPolling();
    setSearching(false);
    const id = bumpIdRef.current;
    if (id) {
      try {
        await api<BumpResponse>(`/bumps/${id}`, { method: "DELETE" });
      } catch {
        // ignore cancel errors
      }
    }
    bumpIdRef.current = null;
  }

  useEffect(() => () => stopPolling(), []);

  return { bump, error, searching, startSearch, cancel, setBump };
}
