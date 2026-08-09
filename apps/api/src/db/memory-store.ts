import { randomUUID } from "node:crypto";
import {
  BUMP_CANDIDATE_WINDOW_MS,
  MATCH_TIME_WINDOW_MS,
  MEMORY_SONGS_PER_USER,
  TALLY_WINDOW_DAYS,
  emptyPixelGrid,
  isValidMemoryPhotoCount,
  type ActivityNotification,
  type BumpCandidate,
  type BumpProposal,
  type CalendarEvent,
  type EventComment,
  type EventDetail,
  type FriendListEntry,
  type FriendSummary,
  type MemoryMember,
  type MemoryPhoto,
  type MemoryResponse,
  type MemorySong,
  type RsvpStatus,
  type Session,
  type SessionPayload,
} from "@summerhacks/shared";
import { generateFriendCode, normalizeFriendCode } from "./friend-code.js";
import type {
  CreateBumpInput,
  CreateEventInput,
  ExpiredMemory,
  InboxFriendRequest,
  LockedMemorySweep,
  StoredAlbum,
  StoredAlbumContest,
  StoredAlbumVote,
  StoredBumpIntent,
  StoredBumpProposal,
  TallyRegionCount,
  CreateEventPhotoInput,
  CreateCheckinInput,
  StoredFriendCheckin,
  StoredEventPhoto,
  StoredCheckin,
  StoredFriendRequest,
  StoredMemory,
  StoredSession,
  StoredSessionMember,
  StoredSpotifyConnection,
  StoredUser,
  Store,
  SweepMemoriesResult,
  UpdateAlbumInput,
} from "./types.js";
import {
  albumEditWindowMs,
  freshAlbumForMember,
  orderedFriendshipPair,
  toIso,
} from "./types.js";

function storeError(message: string, status: number): Error {
  const err = new Error(message);
  (err as Error & { status: number }).status = status;
  return err;
}

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

type StoredMemorySubmission = {
  memoryId: string;
  userId: string;
  submittedAt: Date | null;
  createdAt: Date;
};

type StoredMemoryPhoto = {
  id: string;
  memoryId: string;
  userId: string;
  photoUrl: string;
  uploadOrder: number;
  createdAt: Date;
};

type StoredMemorySong = {
  id: string;
  memoryId: string;
  userId: string;
  spotifyUrl: string;
  spotifyTrackId: string;
  trackTitle: string;
  artistName: string;
  albumArtUrl: string | null;
  position: number;
  createdAt: Date;
};

type StoredMemoryPlaylist = {
  memoryId: string;
  userId: string;
  spotifyPlaylistId: string;
  spotifyPlaylistUrl: string;
  createdAt: Date;
};

export function createMemoryStore(): Store {
  const users = new Map<string, StoredUser>();
  const usersByDevice = new Map<string, string>();
  const usersByAuthId = new Map<string, string>();
  const usersByFriendCode = new Map<string, string>();
  const bumps = new Map<string, StoredBumpIntent>();
  const bumpsByIdempotency = new Map<string, string>();
  const bumpProposals = new Map<string, StoredBumpProposal>();
  const sessions = new Map<string, StoredSession>();
  const membersBySession = new Map<string, StoredSessionMember[]>();
  const albumsByKey = new Map<string, StoredAlbum>();
  const albumContests = new Map<string, StoredAlbumContest>();
  const albumVotes = new Map<string, StoredAlbumVote>();
  const friendRequests = new Map<string, StoredFriendRequest>();
  const friendships = new Map<string, { isWatchlisted: boolean }>();
  const checkins = new Map<string, StoredCheckin>();
  type StoredConnection = {
    id: string;
    type: string;
    region: string;
    createdAt: Date;
  };
  const connections = new Map<string, StoredConnection>();
  const eventPhotos = new Map<string, StoredEventPhoto>();
  const events = new Map<string, StoredEvent>();
  const attendees = new Map<string, StoredAttendee>(); // `${eventId}:${userId}`
  const comments = new Map<string, StoredComment>();
  const subscriptions = new Set<string>(); // `${eventId}:${userId}`
  const activities = new Map<string, StoredActivity>();
  const memories = new Map<string, StoredMemory>();
  const memoryIdBySession = new Map<string, string>();
  const memorySubmissions = new Map<string, StoredMemorySubmission>(); // `${memoryId}:${userId}`
  const memoryPhotos = new Map<string, StoredMemoryPhoto>();
  const memorySongs = new Map<string, StoredMemorySong>(); // `${memoryId}:${userId}:${position}`
  const memoryPlaylists = new Map<string, StoredMemoryPlaylist>(); // `${memoryId}:${userId}`
  const spotifyConnections = new Map<string, StoredSpotifyConnection>();

  function allocFriendCode(): string {
    for (let i = 0; i < 32; i++) {
      const code = generateFriendCode();
      if (!usersByFriendCode.has(code)) return code;
    }
    throw new Error("Failed to allocate friend code");
  }

  function ensureFriendCode(user: StoredUser): StoredUser {
    const current = users.get(user.id) ?? user;
    if (current.friendCode) return current;
    const code = allocFriendCode();
    const updated = { ...current, friendCode: code };
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
    for (const key of friendships.keys()) {
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

  function expireProposalIfNeeded(
    proposal: StoredBumpProposal,
  ): StoredBumpProposal {
    if (
      proposal.status === "pending" &&
      proposal.expiresAt.getTime() <= Date.now()
    ) {
      const expired = { ...proposal, status: "expired" as const };
      bumpProposals.set(proposal.id, expired);
      return expired;
    }
    return proposal;
  }

  function pairBumps(
    bump: StoredBumpIntent,
    partner: StoredBumpIntent,
  ): {
    bump: StoredBumpIntent;
    peer: StoredUser;
    session: Session;
  } {
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

    // Memory row must exist before this call returns so the client can jump
    // straight to /memories/session/:sessionId without racing.
    seedMemory(
      session.id,
      members.map((m) => m.userId),
      now,
    );

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
  }

  /** Session membership is authoritative for who owes a submission (N-safe). */
  function memoryMemberIds(sessionId: string): string[] {
    return (membersBySession.get(sessionId) ?? []).map((m) => m.userId);
  }

  function submittedUserIds(memoryId: string): Set<string> {
    const ids = new Set<string>();
    for (const row of memorySubmissions.values()) {
      if (row.memoryId === memoryId && row.submittedAt) ids.add(row.userId);
    }
    return ids;
  }

  function memoryPhotoRows(
    memoryId: string,
    userId?: string,
  ): StoredMemoryPhoto[] {
    return [...memoryPhotos.values()]
      .filter(
        (p) => p.memoryId === memoryId && (!userId || p.userId === userId),
      )
      .sort(
        (a, b) =>
          a.userId.localeCompare(b.userId) || a.uploadOrder - b.uploadOrder,
      );
  }

  function memorySongRows(
    memoryId: string,
    userId?: string,
  ): StoredMemorySong[] {
    return [...memorySongs.values()]
      .filter(
        (s) => s.memoryId === memoryId && (!userId || s.userId === userId),
      )
      .sort(
        (a, b) => a.userId.localeCompare(b.userId) || a.position - b.position,
      );
  }

  function toMemoryPhoto(row: StoredMemoryPhoto): MemoryPhoto {
    return {
      id: row.id,
      userId: row.userId,
      photoUrl: row.photoUrl,
      uploadOrder: row.uploadOrder,
    };
  }

  function toMemorySong(row: StoredMemorySong): MemorySong {
    return {
      id: row.id,
      userId: row.userId,
      spotifyUrl: row.spotifyUrl,
      spotifyTrackId: row.spotifyTrackId,
      trackTitle: row.trackTitle,
      artistName: row.artistName,
      albumArtUrl: row.albumArtUrl,
      position: row.position,
    };
  }

  function memoryMembers(
    memory: StoredMemory,
    viewerUserId: string,
  ): MemoryMember[] {
    const submitted = submittedUserIds(memory.id);
    return memoryMemberIds(memory.sessionId).map((uid) => {
      const u = users.get(uid);
      return {
        userId: uid,
        displayName: u?.displayName ?? "Unknown",
        avatarUrl: u?.avatarUrl ?? null,
        submitted: submitted.has(uid),
        isViewer: uid === viewerUserId,
      };
    });
  }

  /** Collaborative draft while open; full reveal once locked. */
  function shapeMemory(
    memory: StoredMemory,
    viewerUserId: string,
  ): MemoryResponse | null {
    if (memory.status === "expired") return null;

    const base = {
      id: memory.id,
      sessionId: memory.sessionId,
      note: memory.note,
      hangoutAt: toIso(memory.windowStartsAt),
      windowStartsAt: toIso(memory.windowStartsAt),
      windowExpiresAt: toIso(memory.windowExpiresAt),
      members: memoryMembers(memory, viewerUserId),
    };

    if (memory.status === "locked") {
      const playlist = memoryPlaylists.get(`${memory.id}:${viewerUserId}`);
      return {
        ...base,
        status: "locked",
        lockedAt: toIso(memory.lockedAt ?? memory.windowExpiresAt),
        photos: memoryPhotoRows(memory.id).map(toMemoryPhoto),
        songs: memorySongRows(memory.id).map(toMemorySong),
        myPlaylist: playlist
          ? {
              spotifyPlaylistId: playlist.spotifyPlaylistId,
              spotifyPlaylistUrl: playlist.spotifyPlaylistUrl,
            }
          : null,
      };
    }

    const photos = memoryPhotoRows(memory.id).map(toMemoryPhoto);
    const songs = memorySongRows(memory.id).map(toMemorySong);
    return {
      ...base,
      status: "open",
      lockedAt: null,
      mySubmitted: submittedUserIds(memory.id).has(viewerUserId),
      photos,
      songs,
      myPhotos: photos.filter((p) => p.userId === viewerUserId),
      mySongs: songs.filter((s) => s.userId === viewerUserId),
    };
  }

  function seedMemory(
    sessionId: string,
    memberUserIds: string[],
    sessionCreatedAt: Date,
  ): StoredMemory {
    const existingId = memoryIdBySession.get(sessionId);
    if (existingId) return memories.get(existingId)!;

    const memory: StoredMemory = {
      id: randomUUID(),
      sessionId,
      status: "open",
      note: null,
      windowStartsAt: sessionCreatedAt,
      windowExpiresAt: new Date(
        sessionCreatedAt.getTime() + albumEditWindowMs(),
      ),
      lockedAt: null,
      createdAt: new Date(),
    };
    memories.set(memory.id, memory);
    memoryIdBySession.set(sessionId, memory.id);

    for (const userId of memberUserIds) {
      memorySubmissions.set(`${memory.id}:${userId}`, {
        memoryId: memory.id,
        userId,
        submittedAt: null,
        createdAt: memory.createdAt,
      });
    }
    return memory;
  }

  function lockMemory(memory: StoredMemory, at: Date): StoredMemory {
    const locked: StoredMemory = { ...memory, status: "locked", lockedAt: at };
    memories.set(memory.id, locked);
    return locked;
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
          // Keep app profile name; claims only seed displayName on create.
          displayName: existing.displayName,
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

      const paired = pairBumps(bump, partner);
      return {
        bump: paired.bump,
        peer: paired.peer,
        session: paired.session,
      };
    },

    async listBumpCandidates(bumpId) {
      let bump = bumps.get(bumpId);
      if (!bump) return [];
      bump = expireIfNeeded(bump);
      if (bump.status === "matched") return [];

      const cutoff = Date.now() - BUMP_CANDIDATE_WINDOW_MS;
      const byUser = new Map<string, { bump: StoredBumpIntent; user: StoredUser }>();

      for (const other of bumps.values()) {
        const o = expireIfNeeded(other);
        if (o.id === bump.id) continue;
        if (o.userId === bump.userId) continue;
        if (o.status === "matched") continue;
        if (o.serverTimestamp.getTime() < cutoff) continue;
        if (!placesMatch(bump, o)) continue;
        const user = users.get(o.userId);
        if (!user) continue;
        const prev = byUser.get(o.userId);
        if (
          !prev ||
          o.serverTimestamp.getTime() > prev.bump.serverTimestamp.getTime()
        ) {
          byUser.set(o.userId, { bump: o, user });
        }
      }

      const candidates: BumpCandidate[] = [...byUser.values()]
        .sort(
          (a, b) =>
            b.bump.serverTimestamp.getTime() - a.bump.serverTimestamp.getTime(),
        )
        .map(({ bump: b, user }) => ({
          bumpId: b.id,
          userId: user.id,
          avatarUrl: user.avatarUrl,
        }));
      return candidates;
    },

    async createBumpProposal(fromBumpId, targetBumpId, fromUserId) {
      let fromBump = bumps.get(fromBumpId);
      if (!fromBump || fromBump.userId !== fromUserId) {
        throw storeError("Bump not found", 404);
      }
      fromBump = expireIfNeeded(fromBump);
      if (fromBump.status === "matched") {
        throw storeError("Bump already matched", 409);
      }

      let target = bumps.get(targetBumpId);
      if (!target) throw storeError("Target bump not found", 404);
      target = expireIfNeeded(target);
      if (target.userId === fromUserId) {
        throw storeError("Cannot propose to yourself", 400);
      }
      if (target.status === "matched") {
        throw storeError("Target already matched", 409);
      }

      const cutoff = Date.now() - BUMP_CANDIDATE_WINDOW_MS;
      if (target.serverTimestamp.getTime() < cutoff) {
        throw storeError("Target bump too old", 410);
      }
      if (!placesMatch(fromBump, target)) {
        throw storeError("Target not in same place", 400);
      }

      for (const p of bumpProposals.values()) {
        const cur = expireProposalIfNeeded(p);
        if (
          cur.status === "pending" &&
          cur.fromBumpId === fromBumpId &&
          cur.toBumpId === targetBumpId
        ) {
          return cur;
        }
      }

      const now = new Date();
      const proposal: StoredBumpProposal = {
        id: randomUUID(),
        fromBumpId,
        toBumpId: targetBumpId,
        fromUserId,
        toUserId: target.userId,
        status: "pending",
        sessionId: null,
        createdAt: now,
        expiresAt: new Date(now.getTime() + BUMP_CANDIDATE_WINDOW_MS),
      };
      bumpProposals.set(proposal.id, proposal);
      return proposal;
    },

    async listPendingBumpProposals(userId) {
      const result: BumpProposal[] = [];
      for (const raw of bumpProposals.values()) {
        const p = expireProposalIfNeeded(raw);
        if (p.toUserId !== userId || p.status !== "pending") continue;
        const fromUser = users.get(p.fromUserId);
        result.push({
          id: p.id,
          fromBumpId: p.fromBumpId,
          toBumpId: p.toBumpId,
          fromUserId: p.fromUserId,
          toUserId: p.toUserId,
          status: p.status,
          sessionId: p.sessionId,
          expiresAt: toIso(p.expiresAt),
          createdAt: toIso(p.createdAt),
          fromAvatarUrl: fromUser?.avatarUrl ?? null,
        });
      }
      return result.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    },

    async acceptBumpProposal(proposalId, userId) {
      let proposal = bumpProposals.get(proposalId);
      if (!proposal) throw storeError("Proposal not found", 404);
      proposal = expireProposalIfNeeded(proposal);
      if (proposal.toUserId !== userId) {
        throw storeError("Proposal not found", 404);
      }
      if (proposal.status === "expired") {
        throw storeError("Proposal expired", 410);
      }
      if (proposal.status === "rejected") {
        throw storeError("Proposal rejected", 409);
      }
      if (proposal.status === "accepted" && proposal.sessionId) {
        const bump = bumps.get(proposal.toBumpId)!;
        const peer = users.get(proposal.fromUserId)!;
        const session = await this.getSession(proposal.sessionId);
        return {
          proposal,
          bump,
          peer: {
            id: peer.id,
            displayName: peer.displayName,
            avatarUrl: peer.avatarUrl,
          },
          session: session!,
        };
      }

      let fromBump = bumps.get(proposal.fromBumpId);
      let toBump = bumps.get(proposal.toBumpId);
      if (!fromBump || !toBump) throw storeError("Bump not found", 404);
      fromBump = expireIfNeeded(fromBump);
      toBump = expireIfNeeded(toBump);
      if (fromBump.status === "matched" || toBump.status === "matched") {
        throw storeError("Bump already matched", 409);
      }

      const paired = pairBumps(toBump, fromBump);
      const accepted: StoredBumpProposal = {
        ...proposal,
        status: "accepted",
        sessionId: paired.session.id,
      };
      bumpProposals.set(accepted.id, accepted);

      return {
        proposal: accepted,
        bump: paired.bump,
        peer: {
          id: paired.peer.id,
          displayName: paired.peer.displayName,
          avatarUrl: paired.peer.avatarUrl,
        },
        session: paired.session,
      };
    },

    async rejectBumpProposal(proposalId, userId) {
      let proposal = bumpProposals.get(proposalId);
      if (!proposal) throw storeError("Proposal not found", 404);
      proposal = expireProposalIfNeeded(proposal);
      if (proposal.toUserId !== userId) {
        throw storeError("Proposal not found", 404);
      }
      if (proposal.status !== "pending") {
        throw storeError("Proposal is not pending", 409);
      }
      const rejected: StoredBumpProposal = {
        ...proposal,
        status: "rejected",
      };
      bumpProposals.set(rejected.id, rejected);
      return rejected;
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

    async listAlbumsForSession(sessionId) {
      return [...albumsByKey.values()].filter((a) => a.sessionId === sessionId);
    },

    async getAlbumForUser(sessionId, userId) {
      return albumsByKey.get(`${sessionId}:${userId}`) ?? null;
    },

    async createAlbumForUser(sessionId, userId) {
      const key = `${sessionId}:${userId}`;
      const existing = albumsByKey.get(key);
      if (existing) return existing;
      const session = sessions.get(sessionId);
      if (!session) {
        const err = new Error("Session not found");
        (err as Error & { status: number }).status = 404;
        throw err;
      }
      const fields = freshAlbumForMember(sessionId, userId, session.createdAt);
      const album: StoredAlbum = {
        id: randomUUID(),
        sessionId: fields.sessionId,
        userId: fields.userId,
        title: fields.title,
        gridSize: fields.gridSize,
        pixels: fields.pixels,
        coverUrl: fields.coverUrl,
        editableUntil: fields.editableUntil,
        readyAt: fields.readyAt,
        createdAt: fields.createdAt,
        updatedAt: fields.updatedAt,
      };
      albumsByKey.set(key, album);
      return album;
    },

    async updateAlbumForUser(sessionId, userId, input: UpdateAlbumInput) {
      const key = `${sessionId}:${userId}`;
      const existing = albumsByKey.get(key);
      if (!existing) return null;
      const next: StoredAlbum = {
        ...existing,
        pixels: input.pixels ?? existing.pixels,
        coverUrl:
          input.coverUrl !== undefined ? input.coverUrl : existing.coverUrl,
        gridSize: input.gridSize ?? existing.gridSize,
        title: input.title !== undefined ? input.title : existing.title,
        updatedAt: new Date(),
      };
      if (input.gridSize && input.gridSize !== existing.gridSize && !input.pixels) {
        next.pixels = emptyPixelGrid(input.gridSize);
      }
      albumsByKey.set(key, next);
      return next;
    },

    async markAlbumReady(sessionId, userId) {
      const key = `${sessionId}:${userId}`;
      const existing = albumsByKey.get(key);
      if (!existing) return null;
      const next: StoredAlbum = {
        ...existing,
        readyAt: existing.readyAt ?? new Date(),
        updatedAt: new Date(),
      };
      albumsByKey.set(key, next);
      return next;
    },

    async getAlbumContest(sessionId) {
      return albumContests.get(sessionId) ?? null;
    },

    async listAlbumVotes(sessionId) {
      return [...albumVotes.values()].filter((v) => v.sessionId === sessionId);
    },

    async upsertAlbumVote(sessionId, voterUserId, choiceUserId) {
      const key = `${sessionId}:${voterUserId}`;
      const vote: StoredAlbumVote = {
        sessionId,
        voterUserId,
        choiceUserId,
      };
      albumVotes.set(key, vote);
      return vote;
    },

    async setAlbumContestWinner(sessionId, winnerUserId, method) {
      const contest: StoredAlbumContest = {
        sessionId,
        winnerUserId,
        method,
        resolvedAt: new Date(),
      };
      albumContests.set(sessionId, contest);
      return contest;
    },

    async getFriendsMe(userId) {
      const me = await this.getUser(userId);
      if (!me) throw new Error("User not found");
      const friends = friendIdsOf(userId)
        .map((id) => users.get(id))
        .filter((u): u is StoredUser => Boolean(u))
        .map((u) => ({
          ...toFriendSummary(u),
          isWatchlisted:
            friendships.get(friendshipKey(userId, u.id))?.isWatchlisted ??
            false,
        }))
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

    async acceptFriendRequest(userId, requestId, region) {
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
      friendships.set(friendshipKey(req.fromUserId, req.toUserId), {
        isWatchlisted: false,
      });

      const connection: StoredConnection = {
        id: randomUUID(),
        type: "friend_add",
        region,
        createdAt: new Date(),
      };
      connections.set(connection.id, connection);
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

    async setFriendshipWatchlist(userId, friendId, isWatchlisted) {
      const key = friendshipKey(userId, friendId);
      if (!friendships.has(key)) return false;
      friendships.set(key, { isWatchlisted });
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

    async rsvpEvent(userId, eventId, status, region) {
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

        const connection: StoredConnection = {
          id: randomUUID(),
          type: "event_join",
          region,
          createdAt: now,
        };
        connections.set(connection.id, connection);
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

    async addEventPhoto(input: CreateEventPhotoInput) {
      const photo: StoredEventPhoto = {
        id: randomUUID(),
        eventId: input.eventId,
        photoUrl: input.photoUrl,
        createdAt: new Date(),
      };
      eventPhotos.set(photo.id, photo);
      return photo;
    },

    async listEventPhotos(eventId) {
      return [...eventPhotos.values()]
        .filter((p) => p.eventId === eventId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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
        region: input.connectionRegion,
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

    async listFriendCheckins(userId) {
      const visibleFriendIds = friendIdsOf(userId).filter(
        (fid) => !friendships.get(friendshipKey(userId, fid))?.isWatchlisted,
      );
      if (visibleFriendIds.length === 0) return [];
      const visible = new Set(visibleFriendIds);
      const rows: StoredFriendCheckin[] = [...checkins.values()]
        .filter((c) => visible.has(c.userId))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((c) => {
          const owner = users.get(c.userId);
          return {
            ...c,
            ownerDisplayName: owner?.displayName ?? "Unknown",
            ownerAvatarUrl: owner?.avatarUrl ?? null,
          };
        });
      return rows;
    },

    async listCheckinsForFriend(userId, friendId) {
      if (!areFriends(userId, friendId)) return null;
      return [...checkins.values()]
        .filter((c) => c.userId === friendId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async getTally() {
      const cutoff = Date.now() - TALLY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
      const byRegion = new Map<string, TallyRegionCount>();
      for (const c of connections.values()) {
        if (c.createdAt.getTime() < cutoff) continue;
        const entry = byRegion.get(c.region) ?? {
          region: c.region,
          checkin: 0,
          friendAdd: 0,
          eventJoin: 0,
        };
        if (c.type === "checkin") entry.checkin++;
        else if (c.type === "friend_add") entry.friendAdd++;
        else if (c.type === "event_join") entry.eventJoin++;
        byRegion.set(c.region, entry);
      }
      return [...byRegion.values()].sort(
        (a, b) =>
          b.checkin +
          b.friendAdd +
          b.eventJoin -
          (a.checkin + a.friendAdd + a.eventJoin),
      );
    },

    async createMemoryForSession(sessionId, memberUserIds, sessionCreatedAt) {
      return seedMemory(sessionId, memberUserIds, sessionCreatedAt);
    },

    async getMemoryAccess(memoryId, userId) {
      const memory = memories.get(memoryId);
      if (!memory) return null;
      const memberUserIds = memoryMemberIds(memory.sessionId);
      return {
        memory,
        isMember: memberUserIds.includes(userId),
        submitted: submittedUserIds(memoryId).has(userId),
        photoCount: memoryPhotoRows(memoryId, userId).length,
        songCount: memorySongRows(memoryId, userId).length,
        memberUserIds,
      };
    },

    async getMemoryBySessionId(sessionId, viewerUserId) {
      const memoryId = memoryIdBySession.get(sessionId);
      if (!memoryId) return null;
      const memory = memories.get(memoryId);
      if (!memory) return null;
      if (!memoryMemberIds(memory.sessionId).includes(viewerUserId)) return null;
      return shapeMemory(memory, viewerUserId);
    },

    async getMemoryById(memoryId, viewerUserId) {
      const memory = memories.get(memoryId);
      if (!memory) return null;
      if (!memoryMemberIds(memory.sessionId).includes(viewerUserId)) return null;
      return shapeMemory(memory, viewerUserId);
    },

    async listLockedMemoriesForUser(userId) {
      const rows = [...memories.values()].filter(
        (m) =>
          m.status === "locked" &&
          memoryMemberIds(m.sessionId).includes(userId),
      );
      return rows
        .sort(
          (a, b) => b.windowStartsAt.getTime() - a.windowStartsAt.getTime(),
        )
        .map((memory) => {
          const photos = memoryPhotoRows(memory.id);
          return {
            id: memory.id,
            sessionId: memory.sessionId,
            hangoutAt: toIso(memory.windowStartsAt),
            lockedAt: toIso(memory.lockedAt ?? memory.windowExpiresAt),
            memberDisplayNames: memoryMemberIds(memory.sessionId).map(
              (uid) => users.get(uid)?.displayName ?? "Unknown",
            ),
            coverPhotoUrl: photos[0]?.photoUrl ?? null,
            songCount: memorySongRows(memory.id).length,
          };
        });
    },

    async addMemoryPhoto(memoryId, userId, photoUrl) {
      const memory = memories.get(memoryId);
      if (!memory) throw storeError("Memory not found", 404);
      const mine = memoryPhotoRows(memoryId, userId);
      const nextOrder =
        mine.length === 0
          ? 0
          : Math.max(...mine.map((p) => p.uploadOrder)) + 1;
      const row: StoredMemoryPhoto = {
        id: randomUUID(),
        memoryId,
        userId,
        photoUrl,
        uploadOrder: nextOrder,
        createdAt: new Date(),
      };
      memoryPhotos.set(row.id, row);
      return toMemoryPhoto(row);
    },

    async deleteMemoryPhoto(memoryId, userId, photoId) {
      const row = memoryPhotos.get(photoId);
      if (!row || row.memoryId !== memoryId || row.userId !== userId) {
        return false;
      }
      memoryPhotos.delete(photoId);
      return true;
    },

    async upsertMemorySong(memoryId, userId, position, input) {
      const memory = memories.get(memoryId);
      if (!memory) throw storeError("Memory not found", 404);
      const key = `${memoryId}:${userId}:${position}`;
      const existing = memorySongs.get(key);
      const row: StoredMemorySong = {
        id: existing?.id ?? randomUUID(),
        memoryId,
        userId,
        spotifyUrl: input.spotifyUrl,
        spotifyTrackId: input.spotifyTrackId,
        trackTitle: input.trackTitle,
        artistName: input.artistName,
        albumArtUrl: input.albumArtUrl,
        position,
        createdAt: existing?.createdAt ?? new Date(),
      };
      memorySongs.set(key, row);
      return toMemorySong(row);
    },

    async deleteMemorySong(memoryId, userId, position) {
      return memorySongs.delete(`${memoryId}:${userId}:${position}`);
    },

    async updateMemoryNote(memoryId, note) {
      const memory = memories.get(memoryId);
      if (!memory) return null;
      const updated: StoredMemory = { ...memory, note };
      memories.set(memoryId, updated);
      return updated;
    },

    async submitMemory(memoryId, userId) {
      const memory = memories.get(memoryId);
      if (!memory) throw storeError("Memory not found", 404);
      if (memory.status !== "open") {
        throw storeError("Memory is no longer open", 409);
      }
      const memberUserIds = memoryMemberIds(memory.sessionId);
      if (!memberUserIds.includes(userId)) {
        throw storeError("Not a member of this memory", 403);
      }

      const positions = new Set(
        memorySongRows(memoryId, userId).map((s) => s.position),
      );
      if (positions.size !== MEMORY_SONGS_PER_USER) {
        throw storeError(
          `Add ${MEMORY_SONGS_PER_USER} songs before marking done`,
          400,
        );
      }
      const photoCount = memoryPhotoRows(memoryId, userId).length;
      if (!isValidMemoryPhotoCount(photoCount)) {
        throw storeError("Photos must come in pairs (2, 4, 6, or 8)", 400);
      }

      const now = new Date();
      const key = `${memoryId}:${userId}`;
      memorySubmissions.set(key, {
        memoryId,
        userId,
        submittedAt: now,
        createdAt: memorySubmissions.get(key)?.createdAt ?? now,
      });

      return {
        memory,
        locked: false,
        memberUserIds,
      };
    },

    async expireStaleMemories(): Promise<SweepMemoriesResult> {
      const now = new Date();
      const locked: LockedMemorySweep[] = [];
      const expired: ExpiredMemory[] = [];
      for (const memory of [...memories.values()]) {
        if (memory.status !== "open") continue;
        if (memory.windowExpiresAt.getTime() > now.getTime()) continue;

        const photos = memoryPhotoRows(memory.id);
        const songs = memorySongRows(memory.id);
        const memberUserIds = memoryMemberIds(memory.sessionId);

        if (photos.length > 0 || songs.length > 0) {
          lockMemory(memory, now);
          locked.push({ memoryId: memory.id, memberUserIds });
          continue;
        }

        memories.set(memory.id, { ...memory, status: "expired" });
        expired.push({
          memoryId: memory.id,
          sessionId: memory.sessionId,
          photoUrls: [],
        });
      }
      return { locked, expired };
    },

    async getSpotifyConnection(userId) {
      return spotifyConnections.get(userId) ?? null;
    },

    async upsertSpotifyConnection(userId, tokens) {
      const existing = spotifyConnections.get(userId);
      const row: StoredSpotifyConnection = {
        userId,
        spotifyUserId: tokens.spotifyUserId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        createdAt: existing?.createdAt ?? new Date(),
      };
      spotifyConnections.set(userId, row);
      return row;
    },

    async deleteSpotifyConnection(userId) {
      return spotifyConnections.delete(userId);
    },

    async upsertMemoryPlaylist(memoryId, userId, playlistId, playlistUrl) {
      const key = `${memoryId}:${userId}`;
      memoryPlaylists.set(key, {
        memoryId,
        userId,
        spotifyPlaylistId: playlistId,
        spotifyPlaylistUrl: playlistUrl,
        createdAt: memoryPlaylists.get(key)?.createdAt ?? new Date(),
      });
    },
  };
}
