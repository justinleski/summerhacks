import { useCallback, useEffect, useRef, useState } from "react";
import {
  BUMP_POLL_INTERVAL_MS,
  type AcceptBumpProposalResponse,
  type BumpCandidate,
  type BumpProposal,
  type BumpResponse,
} from "@summerhacks/shared";
import { api } from "../../lib/api";

/**
 * After auto-match expires: list anonymous candidates, send proposes,
 * and poll for incoming "was this you?" requests / late matches.
 */
export function useBumpFallback(
  bump: BumpResponse | null,
  enabled: boolean,
  onMatched: (next: BumpResponse) => void,
) {
  const [candidates, setCandidates] = useState<BumpCandidate[]>([]);
  const [incoming, setIncoming] = useState<BumpProposal[]>([]);
  const [proposingId, setProposingId] = useState<string | null>(null);
  const [proposedIds, setProposedIds] = useState<Set<string>>(new Set());
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onMatchedRef = useRef(onMatched);
  onMatchedRef.current = onMatched;

  const refresh = useCallback(async () => {
    if (!bump?.bumpId) return;
    try {
      const [cRes, pRes, next] = await Promise.all([
        api<{ candidates: BumpCandidate[] }>(
          `/bumps/${bump.bumpId}/candidates`,
        ),
        api<{ proposals: BumpProposal[] }>("/bumps/proposals"),
        api<BumpResponse>(`/bumps/${bump.bumpId}`),
      ]);
      setCandidates(cRes.candidates);
      setIncoming(pRes.proposals);
      if (next.status === "matched") {
        onMatchedRef.current(next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fallback poll failed");
    }
  }, [bump?.bumpId]);

  useEffect(() => {
    if (!enabled || !bump?.bumpId) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), BUMP_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [enabled, bump?.bumpId, refresh]);

  useEffect(() => {
    if (!enabled) {
      setCandidates([]);
      setIncoming([]);
      setProposingId(null);
      setProposedIds(new Set());
      setError(null);
    }
  }, [enabled]);

  async function propose(targetBumpId: string) {
    if (!bump?.bumpId || proposingId || proposedIds.has(targetBumpId)) return;
    setProposingId(targetBumpId);
    setError(null);
    try {
      await api(`/bumps/${bump.bumpId}/propose`, {
        method: "POST",
        body: JSON.stringify({ targetBumpId }),
      });
      setProposedIds((prev) => new Set(prev).add(targetBumpId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Propose failed");
    } finally {
      setProposingId(null);
    }
  }

  async function accept(proposalId: string) {
    setActing(true);
    setError(null);
    try {
      const res = await api<AcceptBumpProposalResponse>(
        `/bumps/proposals/${proposalId}/accept`,
        { method: "POST" },
      );
      onMatchedRef.current({
        bumpId: res.bumpId,
        status: "matched",
        expiresAt: bump?.expiresAt ?? new Date().toISOString(),
        sessionId: res.sessionId,
        peer: res.peer,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accept failed");
    } finally {
      setActing(false);
    }
  }

  async function reject(proposalId: string) {
    setActing(true);
    setError(null);
    try {
      await api(`/bumps/proposals/${proposalId}/reject`, { method: "POST" });
      setIncoming((prev) => prev.filter((p) => p.id !== proposalId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setActing(false);
    }
  }

  return {
    candidates,
    incoming,
    proposingId,
    proposedIds,
    acting,
    error,
    propose,
    accept,
    reject,
  };
}
