import { randomUUID } from "node:crypto";
import {
  MATCH_TIME_WINDOW_MS,
  type Session,
  type SessionPayload,
} from "@summerhacks/shared";
import type {
  CreateBumpInput,
  StoredBumpIntent,
  StoredSession,
  StoredSessionMember,
  StoredUser,
  Store,
} from "./types.js";
import { toIso } from "./types.js";

function placesMatch(a: StoredBumpIntent, b: StoredBumpIntent): boolean {
  if (a.geoCountry && b.geoCountry && a.geoCountry === b.geoCountry) {
    if (a.geoCity && b.geoCity && a.geoCity === b.geoCity) return true;
    if (a.geoRegion && b.geoRegion && a.geoRegion === b.geoRegion) return true;
  }
  if (
    a.geoLat != null &&
    a.geoLng != null &&
    b.geoLat != null &&
    b.geoLng != null
  ) {
    const dLat = a.geoLat - b.geoLat;
    const dLng = a.geoLng - b.geoLng;
    // ~0.5 degrees ≈ city-scale coarse match
    return Math.sqrt(dLat * dLat + dLng * dLng) < 0.5;
  }
  // Local/dev stub: same IP prefix or identical stub city
  if (a.ip === b.ip) return true;
  return false;
}

function withinTimeWindow(a: StoredBumpIntent, b: StoredBumpIntent): boolean {
  return (
    Math.abs(a.serverTimestamp.getTime() - b.serverTimestamp.getTime()) <=
    MATCH_TIME_WINDOW_MS
  );
}

function buildSessionView(
  session: StoredSession,
  members: StoredSessionMember[],
  users: Map<string, StoredUser>,
): Session {
  return {
    id: session.id,
    createdVia: "bump",
    status: session.status,
    payload: session.payload,
    createdAt: toIso(session.createdAt),
    members: members.map((m) => {
      const u = users.get(m.userId);
      return {
        userId: m.userId,
        displayName: u?.displayName ?? "Unknown",
        avatarUrl: u?.avatarUrl ?? null,
        joinedAt: toIso(m.joinedAt),
        confirmedAt: m.confirmedAt ? toIso(m.confirmedAt) : null,
      };
    }),
  };
}

export function createMemoryStore(): Store {
  const users = new Map<string, StoredUser>();
  const usersByDevice = new Map<string, string>();
  const bumps = new Map<string, StoredBumpIntent>();
  const bumpsByIdempotency = new Map<string, string>();
  const sessions = new Map<string, StoredSession>();
  const membersBySession = new Map<string, StoredSessionMember[]>();

  function expireIfNeeded(bump: StoredBumpIntent): StoredBumpIntent {
    if (
      bump.status === "pending" &&
      bump.expiresAt.getTime() <= Date.now()
    ) {
      const expired = { ...bump, status: "expired" as const };
      bumps.set(bump.id, expired);
      return expired;
    }
    return bump;
  }

  return {
    async bootstrapUser({ displayName, deviceId }) {
      if (deviceId && usersByDevice.has(deviceId)) {
        const existing = users.get(usersByDevice.get(deviceId)!)!;
        if (existing.displayName !== displayName) {
          const updated = { ...existing, displayName };
          users.set(updated.id, updated);
          return updated;
        }
        return existing;
      }
      const user: StoredUser = {
        id: randomUUID(),
        displayName,
        avatarUrl: null,
        deviceId: deviceId ?? null,
        createdAt: toIso(new Date()),
      };
      users.set(user.id, user);
      if (deviceId) usersByDevice.set(deviceId, user.id);
      return user;
    },

    async getUser(id) {
      return users.get(id) ?? null;
    },

    async findBumpByIdempotency(userId, idempotencyKey) {
      const id = bumpsByIdempotency.get(`${userId}:${idempotencyKey}`);
      if (!id) return null;
      return expireIfNeeded(bumps.get(id)!);
    },

    async getBump(id) {
      const bump = bumps.get(id);
      if (!bump) return null;
      return expireIfNeeded(bump);
    },

    async createBump(input: CreateBumpInput) {
      const existing = await this.findBumpByIdempotency(
        input.userId,
        input.idempotencyKey,
      );
      if (existing) return existing;

      const bump: StoredBumpIntent = {
        id: randomUUID(),
        userId: input.userId,
        clientTimestamp: input.clientTimestamp,
        serverTimestamp: new Date(),
        ip: input.geo.ip,
        geoCity: input.geo.city,
        geoRegion: input.geo.region,
        geoCountry: input.geo.country,
        geoLat: input.geo.lat,
        geoLng: input.geo.lng,
        peakMagnitude: input.peakMagnitude,
        idempotencyKey: input.idempotencyKey,
        status: "pending",
        matchedBumpId: null,
        sessionId: null,
        expiresAt: input.expiresAt,
      };
      bumps.set(bump.id, bump);
      bumpsByIdempotency.set(`${input.userId}:${input.idempotencyKey}`, bump.id);
      return bump;
    },

    async expireBump(id) {
      const bump = bumps.get(id);
      if (!bump) return null;
      if (bump.status !== "pending") return bump;
      const expired = { ...bump, status: "expired" as const };
      bumps.set(id, expired);
      return expired;
    },

    async tryMatchBump(bumpId) {
      let bump = bumps.get(bumpId);
      if (!bump) throw new Error("Bump not found");
      bump = expireIfNeeded(bump);
      if (bump.status !== "pending") {
        const peer =
          bump.matchedBumpId != null
            ? users.get(bumps.get(bump.matchedBumpId)!.userId) ?? null
            : null;
        const session =
          bump.sessionId != null
            ? await this.getSession(bump.sessionId)
            : null;
        return { bump, peer, session };
      }

      const candidates = [...bumps.values()]
        .map(expireIfNeeded)
        .filter(
          (other) =>
            other.id !== bump!.id &&
            other.userId !== bump!.userId &&
            other.status === "pending" &&
            withinTimeWindow(bump!, other) &&
            placesMatch(bump!, other),
        )
        .sort(
          (a, b) =>
            Math.abs(a.serverTimestamp.getTime() - bump!.serverTimestamp.getTime()) -
            Math.abs(b.serverTimestamp.getTime() - bump!.serverTimestamp.getTime()),
        );

      const partner = candidates[0];
      if (!partner) {
        return { bump, peer: null, session: null };
      }

      const now = new Date();
      const userA = users.get(bump.userId)!;
      const userB = users.get(partner.userId)!;
      const payload: SessionPayload = {
        profiles: [
          {
            userId: userA.id,
            displayName: userA.displayName,
            avatarUrl: userA.avatarUrl,
            photoUrls: [],
          },
          {
            userId: userB.id,
            displayName: userB.displayName,
            avatarUrl: userB.avatarUrl,
            photoUrls: [],
          },
        ],
        notes: "Connected via bump",
      };

      const session: StoredSession = {
        id: randomUUID(),
        createdVia: "bump",
        status: "pending_confirm",
        payload,
        createdAt: now,
      };
      sessions.set(session.id, session);

      const members: StoredSessionMember[] = [
        {
          sessionId: session.id,
          userId: userA.id,
          joinedAt: now,
          confirmedAt: null,
        },
        {
          sessionId: session.id,
          userId: userB.id,
          joinedAt: now,
          confirmedAt: null,
        },
      ];
      membersBySession.set(session.id, members);

      const matchedA: StoredBumpIntent = {
        ...bump,
        status: "matched",
        matchedBumpId: partner.id,
        sessionId: session.id,
      };
      const matchedB: StoredBumpIntent = {
        ...partner,
        status: "matched",
        matchedBumpId: bump.id,
        sessionId: session.id,
      };
      bumps.set(matchedA.id, matchedA);
      bumps.set(matchedB.id, matchedB);

      return {
        bump: matchedA,
        peer: userB,
        session: buildSessionView(session, members, users),
      };
    },

    async getSession(id) {
      const session = sessions.get(id);
      if (!session) return null;
      const members = membersBySession.get(id) ?? [];
      return buildSessionView(session, members, users);
    },

    async listSessionsForUser(userId) {
      const result: Session[] = [];
      for (const [sessionId, members] of membersBySession) {
        if (!members.some((m) => m.userId === userId)) continue;
        const session = sessions.get(sessionId);
        if (!session) continue;
        result.push(buildSessionView(session, members, users));
      }
      return result.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    },

    async confirmSession(sessionId, userId) {
      const session = sessions.get(sessionId);
      const members = membersBySession.get(sessionId);
      if (!session || !members) return null;
      const mine = members.find((m) => m.userId === userId);
      if (!mine) return null;

      const now = new Date();
      const updatedMembers = members.map((m) =>
        m.userId === userId && !m.confirmedAt
          ? { ...m, confirmedAt: now }
          : m,
      );
      membersBySession.set(sessionId, updatedMembers);

      const allConfirmed = updatedMembers.every((m) => m.confirmedAt != null);
      const updatedSession: StoredSession = {
        ...session,
        status: allConfirmed ? "active" : session.status,
      };
      sessions.set(sessionId, updatedSession);
      return buildSessionView(updatedSession, updatedMembers, users);
    },
  };
}
