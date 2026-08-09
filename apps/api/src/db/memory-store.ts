import { randomUUID } from "node:crypto";
import {
  MATCH_TIME_WINDOW_MS,
  type ActivityNotification,
  type CalendarEvent,
  type EventComment,
  type EventDetail,
  type FriendSummary,
  type RsvpStatus,
  type Session,
  type SessionPayload,
} from "@summerhacks/shared";
import { generateFriendCode, normalizeFriendCode } from "./friend-code.js";
import type {
  CreateBumpInput,
  CreateCheckinInput,
  CreateEventInput,
  InboxFriendRequest,
  StoredBumpIntent,
  StoredCheckin,
  StoredFriendRequest,
  StoredSession,
  StoredSessionMember,
  StoredUser,
  Store,
} from "./types.js";
import { orderedFriendshipPair, toIso } from "./types.js";

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
    return Math.sqrt(dLat * dLat + dLng * dLng) < 0.5;
  }
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

function toFriendSummary(u: StoredUser): FriendSummary {
  return {
    id: u.id,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
  };
}

type StoredEvent = {
  id: string;
  hostUserId: string;
  title: string;
  description: string;
  imageUrl: string | null;
  startsAt: Date;
  endsAt: Date | null;
  createdAt: Date;
};

type StoredAttendee = {
  eventId: string;
  userId: string;
  status: RsvpStatus;
  updatedAt: Date;
};

type StoredComment = {
  id: string;
  eventId: string;
  userId: string;
  body: string;
  createdAt: Date;
};

type StoredSubscription = {
  eventId: string;
  userId: string;
};

type StoredActivity = {
  id: string;
  userId: string;
  type: ActivityNotification["type"];
  eventId: string;
  actorUserId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  readAt: Date | null;
};

type StoredConnection = {
  id: string;
  type: string;
  region: string;
  createdAt: Date;
};

export function createMemoryStore(): Store {
  const users = new Map<string, StoredUser>();
  const usersByDevice = new Map<string, string>();
  const usersByAuthId = new Map<string, string>();
  const usersByFriendCode = new Map<string, string>();
  const bumps = new Map<string, StoredBumpIntent>();
  const bumpsByIdempotency = new Map<string, string>();
  const sessions = new Map<string, StoredSession>();
  const membersBySession = new Map<string, StoredSessionMember[]>();
  const friendRequests = new Map<string, StoredFriendRequest>();
  const friendships = new Set<string>();
  const events = new Map<string, StoredEvent>();
  const attendees = new Map<string, StoredAttendee>(); // `${eventId}:${userId}`
  const comments = new Map<string, StoredComment>();
  const subscriptions = new Set<string>(); // `${eventId}:${userId}`
  const activities = new Map<string, StoredActivity>();
  const checkins = new Map<string, StoredCheckin>();
  const connections = new Map<string, StoredConnection>();

  function allocFriendCode(): string {
    for (let i = 0; i < 20; i++) {
      const code = generateFriendCode();
      if (!usersByFriendCode.has(code)) return code;
    }
    throw new Error("Failed to allocate friend code");
  }

  function ensureFriendCode(user: StoredUser): StoredUser {
    if (user.friendCode) return user;
    const code = allocFriendCode();
    const updated = { ...user, friendCode: code };
    users.set(updated.id, updated);
    usersByFriendCode.set(code, updated.id);
    return updated;
  }

  function friendshipKey(a: string, b: string): string {
    const { userAId, userBId } = orderedFriendshipPair(a, b);
    return `${userAId}:${userBId}`;
  }

  function areFriends(a: string, b: string): boolean {
    return friendships.has(friendshipKey(a, b));
  }

  function friendIdsOf(userId: string): string[] {
    const ids: string[] = [];
    for (const key of friendships) {
      const [a, b] = key.split(":");
      if (a === userId) ids.push(b!);
      else if (b === userId) ids.push(a!);
    }
    return ids;
  }

  function subscribe(eventId: string, userId: string) {
    subscriptions.add(`${eventId}:${userId}`);
  }

  function isSubscribed(eventId: string, userId: string): boolean {
    return subscriptions.has(`${eventId}:${userId}`);
  }

  function subscriberIds(eventId: string): string[] {
    const ids: string[] = [];
    for (const key of subscriptions) {
      if (key.startsWith(`${eventId}:`)) {
        ids.push(key.slice(eventId.length + 1));
      }
    }
    return ids;
  }

  function notify(
    userId: string,
    type: ActivityNotification["type"],
    eventId: string,
    actorUserId: string,
    payload: Record<string, unknown>,
  ) {
    if (userId === actorUserId) return;
    const row: StoredActivity = {
      id: randomUUID(),
      userId,
      type,
      eventId,
      actorUserId,
      payload,
      createdAt: new Date(),
      readAt: null,
    };
    activities.set(row.id, row);
  }

  function calendarEventView(
    event: StoredEvent,
    viewerId: string,
  ): CalendarEvent {
    const host = users.get(event.hostUserId);
    const mine = attendees.get(`${event.id}:${viewerId}`);
    return {
      id: event.id,
      hostUserId: event.hostUserId,
      hostDisplayName: host?.displayName ?? "Unknown",
      title: event.title,
      description: event.description,
      imageUrl: event.imageUrl,
      startsAt: toIso(event.startsAt),
      endsAt: event.endsAt ? toIso(event.endsAt) : null,
      createdAt: toIso(event.createdAt),
      myRsvp: mine?.status ?? null,
    };
  }

  function canSeeEvent(viewerId: string, event: StoredEvent): boolean {
    if (event.hostUserId === viewerId) return true;
    if (isSubscribed(event.id, viewerId)) return true;
    if (areFriends(viewerId, event.hostUserId)) return true;
    const friends = friendIdsOf(viewerId);
    for (const fid of friends) {
      const att = attendees.get(`${event.id}:${fid}`);
      if (att?.status === "going") return true;
    }
    return false;
  }

  function eventDetail(viewerId: string, event: StoredEvent): EventDetail {
    const attendeeList = [...attendees.values()]
      .filter((a) => a.eventId === event.id)
      .map((a) => {
        const u = users.get(a.userId);
        return {
          userId: a.userId,
          displayName: u?.displayName ?? "Unknown",
          avatarUrl: u?.avatarUrl ?? null,
          status: a.status,
          updatedAt: toIso(a.updatedAt),
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    const commentList = [...comments.values()]
      .filter((c) => c.eventId === event.id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((c) => {
        const u = users.get(c.userId);
        return {
          id: c.id,
          eventId: c.eventId,
          userId: c.userId,
          displayName: u?.displayName ?? "Unknown",
          body: c.body,
          createdAt: toIso(c.createdAt),
        };
      });

    return {
      ...calendarEventView(event, viewerId),
      attendees: attendeeList,
      comments: commentList,
    };
  }

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
        let existing = users.get(usersByDevice.get(deviceId)!)!;
        existing = ensureFriendCode(existing);
        if (existing.displayName !== displayName) {
          const updated = { ...existing, displayName };
          users.set(updated.id, updated);
          return updated;
        }
        return existing;
      }
      const friendCode = allocFriendCode();
      const user: StoredUser = {
        id: randomUUID(),
        displayName,
        avatarUrl: null,
        deviceId: deviceId ?? null,
        authUserId: null,
        email: null,
        friendCode,
        bio: null,
        createdAt: toIso(new Date()),
      };
      users.set(user.id, user);
      usersByFriendCode.set(friendCode, user.id);
      if (deviceId) usersByDevice.set(deviceId, user.id);
      return user;
    },

    async upsertFromAuth(input) {
      const existingId = usersByAuthId.get(input.authUserId);
      if (existingId) {
        let existing = ensureFriendCode(users.get(existingId)!);
        const updated: StoredUser = {
          ...existing,
          displayName: input.displayName || existing.displayName,
          avatarUrl: input.avatarUrl ?? existing.avatarUrl,
          email: input.email ?? existing.email,
        };
        users.set(updated.id, updated);
        return updated;
      }
      const friendCode = allocFriendCode();
      const user: StoredUser = {
        id: randomUUID(),
        displayName: input.displayName,
        avatarUrl: input.avatarUrl ?? null,
        deviceId: null,
        authUserId: input.authUserId,
        email: input.email ?? null,
        friendCode,
        bio: null,
        createdAt: toIso(new Date()),
      };
      users.set(user.id, user);
      usersByAuthId.set(input.authUserId, user.id);
      usersByFriendCode.set(friendCode, user.id);
      return user;
    },

    async getUser(id) {
      const user = users.get(id);
      if (!user) return null;
      return ensureFriendCode(user);
    },

    async getUserByAuthId(authUserId) {
      const id = usersByAuthId.get(authUserId);
      if (!id) return null;
      return ensureFriendCode(users.get(id)!);
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

    async updateProfile(userId, input) {
      const existing = await this.getUser(userId);
      if (!existing) {
        const err = new Error("User not found");
        (err as Error & { status: number }).status = 404;
        throw err;
      }
      const updated: StoredUser = {
        ...existing,
        displayName: input.displayName ?? existing.displayName,
        bio: input.bio !== undefined ? input.bio : existing.bio,
        avatarUrl:
          input.avatarUrl !== undefined ? input.avatarUrl : existing.avatarUrl,
      };
      users.set(updated.id, updated);
      return updated;
    },

    async getFriendsMe(userId) {
      const me = await this.getUser(userId);
      if (!me) throw new Error("User not found");
      const friends = friendIdsOf(userId)
        .map((id) => users.get(id))
        .filter((u): u is StoredUser => Boolean(u))
        .map(toFriendSummary)
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      return { friendCode: me.friendCode, friends };
    },

    async createFriendRequest(fromUserId, code) {
      const normalized = normalizeFriendCode(code);
      const toId = usersByFriendCode.get(normalized);
      if (!toId) {
        const err = new Error("Friend code not found");
        (err as Error & { status: number }).status = 404;
        throw err;
      }
      if (toId === fromUserId) {
        const err = new Error("Cannot friend yourself");
        (err as Error & { status: number }).status = 400;
        throw err;
      }
      if (areFriends(fromUserId, toId)) {
        const err = new Error("Already friends");
        (err as Error & { status: number }).status = 409;
        throw err;
      }
      for (const req of friendRequests.values()) {
        if (
          req.status === "pending" &&
          ((req.fromUserId === fromUserId && req.toUserId === toId) ||
            (req.fromUserId === toId && req.toUserId === fromUserId))
        ) {
          const err = new Error("Friend request already pending");
          (err as Error & { status: number }).status = 409;
          throw err;
        }
      }
      const now = new Date();
      const row: StoredFriendRequest = {
        id: randomUUID(),
        fromUserId,
        toUserId: toId,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      };
      friendRequests.set(row.id, row);
      return row;
    },

    async listFriendInbox(userId) {
      const result: InboxFriendRequest[] = [];
      for (const req of friendRequests.values()) {
        if (req.toUserId !== userId || req.status !== "pending") continue;
        const from = users.get(req.fromUserId);
        if (!from) continue;
        result.push({
          id: req.id,
          fromUserId: req.fromUserId,
          toUserId: req.toUserId,
          status: req.status,
          createdAt: toIso(req.createdAt),
          updatedAt: toIso(req.updatedAt),
          fromUser: toFriendSummary(from),
        });
      }
      return result.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    },

    async acceptFriendRequest(userId, requestId) {
      const req = friendRequests.get(requestId);
      if (!req || req.toUserId !== userId) {
        const err = new Error("Friend request not found");
        (err as Error & { status: number }).status = 404;
        throw err;
      }
      if (req.status !== "pending") {
        const err = new Error("Friend request is not pending");
        (err as Error & { status: number }).status = 409;
        throw err;
      }
      const updated: StoredFriendRequest = {
        ...req,
        status: "accepted",
        updatedAt: new Date(),
      };
      friendRequests.set(requestId, updated);
      friendships.add(friendshipKey(req.fromUserId, req.toUserId));
      return updated;
    },

    async rejectFriendRequest(userId, requestId) {
      const req = friendRequests.get(requestId);
      if (!req || req.toUserId !== userId) {
        const err = new Error("Friend request not found");
        (err as Error & { status: number }).status = 404;
        throw err;
      }
      if (req.status !== "pending") {
        const err = new Error("Friend request is not pending");
        (err as Error & { status: number }).status = 409;
        throw err;
      }
      const updated: StoredFriendRequest = {
        ...req,
        status: "rejected",
        updatedAt: new Date(),
      };
      friendRequests.set(requestId, updated);
      return updated;
    },

    async unfriend(userId, otherUserId) {
      const key = friendshipKey(userId, otherUserId);
      if (!friendships.has(key)) return false;
      friendships.delete(key);
      return true;
    },

    async createEvent(input: CreateEventInput) {
      const now = new Date();
      const event: StoredEvent = {
        id: randomUUID(),
        hostUserId: input.hostUserId,
        title: input.title,
        description: input.description,
        imageUrl: input.imageUrl,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        createdAt: now,
      };
      events.set(event.id, event);
      attendees.set(`${event.id}:${input.hostUserId}`, {
        eventId: event.id,
        userId: input.hostUserId,
        status: "going",
        updatedAt: now,
      });
      subscribe(event.id, input.hostUserId);

      const friends = friendIdsOf(input.hostUserId);
      for (const fid of friends) {
        subscribe(event.id, fid);
        notify(fid, "event_published", event.id, input.hostUserId, {
          title: event.title,
          startsAt: toIso(event.startsAt),
        });
      }

      return calendarEventView(event, input.hostUserId);
    },

    async listCalendar(userId) {
      const now = Date.now();
      const visible: CalendarEvent[] = [];
      for (const event of events.values()) {
        if (event.startsAt.getTime() + 24 * 60 * 60 * 1000 < now) continue;
        if (!canSeeEvent(userId, event)) continue;
        visible.push(calendarEventView(event, userId));
      }
      return visible.sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );
    },

    async getEventDetail(userId, eventId) {
      const event = events.get(eventId);
      if (!event || !canSeeEvent(userId, event)) return null;
      return eventDetail(userId, event);
    },

    async rsvpEvent(userId, eventId, status) {
      const event = events.get(eventId);
      if (!event || !canSeeEvent(userId, event)) return null;

      const now = new Date();
      attendees.set(`${eventId}:${userId}`, {
        eventId,
        userId,
        status,
        updatedAt: now,
      });
      subscribe(eventId, userId);

      for (const sid of subscriberIds(eventId)) {
        notify(sid, "rsvp_changed", eventId, userId, {
          status,
          title: event.title,
        });
      }

      if (status === "going") {
        for (const fid of friendIdsOf(userId)) {
          if (isSubscribed(eventId, fid)) continue;
          subscribe(eventId, fid);
          notify(fid, "event_published", eventId, userId, {
            title: event.title,
            startsAt: toIso(event.startsAt),
            via: "foaf_attendance",
          });
        }
      }

      return eventDetail(userId, event);
    },

    async addEventComment(userId, eventId, body) {
      const event = events.get(eventId);
      if (!event || !canSeeEvent(userId, event)) {
        const err = new Error("Event not found");
        (err as Error & { status: number }).status = 404;
        throw err;
      }
      subscribe(eventId, userId);
      const comment: StoredComment = {
        id: randomUUID(),
        eventId,
        userId,
        body,
        createdAt: new Date(),
      };
      comments.set(comment.id, comment);

      for (const sid of subscriberIds(eventId)) {
        notify(sid, "event_comment", eventId, userId, {
          body,
          title: event.title,
        });
      }

      const u = users.get(userId);
      return {
        id: comment.id,
        eventId,
        userId,
        displayName: u?.displayName ?? "Unknown",
        body,
        createdAt: toIso(comment.createdAt),
      };
    },

    async listActivity(userId) {
      const rows = [...activities.values()]
        .filter((a) => a.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 100);
      return rows.map((a) => {
        const actor = users.get(a.actorUserId);
        return {
          id: a.id,
          type: a.type,
          eventId: a.eventId,
          actorUserId: a.actorUserId,
          actorDisplayName: actor?.displayName ?? "Unknown",
          payload: a.payload,
          createdAt: toIso(a.createdAt),
          readAt: a.readAt ? toIso(a.readAt) : null,
        };
      });
    },

    async markActivityRead(userId, notificationId) {
      const row = activities.get(notificationId);
      if (!row || row.userId !== userId) return null;
      const updated = { ...row, readAt: row.readAt ?? new Date() };
      activities.set(notificationId, updated);
      const actor = users.get(updated.actorUserId);
      return {
        id: updated.id,
        type: updated.type,
        eventId: updated.eventId,
        actorUserId: updated.actorUserId,
        actorDisplayName: actor?.displayName ?? "Unknown",
        payload: updated.payload,
        createdAt: toIso(updated.createdAt),
        readAt: updated.readAt ? toIso(updated.readAt) : null,
      };
    },

    async markAllActivityRead(userId) {
      const now = new Date();
      let count = 0;
      for (const [id, row] of activities) {
        if (row.userId !== userId || row.readAt) continue;
        activities.set(id, { ...row, readAt: now });
        count++;
      }
      return count;
    },

    async createCheckin(input: CreateCheckinInput) {
      const now = new Date();
      const checkin: StoredCheckin = {
        id: randomUUID(),
        userId: input.userId,
        lat: input.lat,
        lng: input.lng,
        region: input.region,
        photoUrl: input.photoUrl,
        caption: input.caption,
        createdAt: now,
      };
      checkins.set(checkin.id, checkin);

      const connection: StoredConnection = {
        id: randomUUID(),
        type: "checkin",
        region: input.region,
        createdAt: now,
      };
      connections.set(connection.id, connection);

      return checkin;
    },

    async listCheckinsForUser(userId) {
      return [...checkins.values()]
        .filter((c) => c.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
  };
}
