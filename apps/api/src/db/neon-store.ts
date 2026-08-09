import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  isNotNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import {
  MATCH_TIME_WINDOW_MS,
  MEMORY_SONGS_PER_USER,
  MEMORY_WINDOW_MS,
  isValidMemoryPhotoCount,
  type ActivityNotification,
  type CalendarEvent,
  type EventComment,
  type EventDetail,
  type FriendSummary,
  type MemoryListItem,
  type MemoryMember,
  type MemoryPhoto,
  type MemoryResponse,
  type MemorySong,
  type RsvpStatus,
  type Session,
  type SessionPayload,
} from "@summerhacks/shared";
import { generateFriendCode, normalizeFriendCode } from "./friend-code.js";
import * as schema from "./schema.js";
import type {
  CreateBumpInput,
  CreateEventInput,
  ExpiredMemory,
  InboxFriendRequest,
  StoredBumpIntent,
  StoredFriendRequest,
  StoredMemory,
  StoredSpotifyConnection,
  StoredUser,
  Store,
} from "./types.js";
import { orderedFriendshipPair, toIso } from "./types.js";

function mapUser(row: typeof schema.users.$inferSelect): StoredUser {
  return {
    id: row.id,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    deviceId: row.deviceId,
    authUserId: row.authUserId,
    email: row.email,
    friendCode: row.friendCode ?? "",
    bio: row.bio ?? null,
    createdAt: toIso(row.createdAt),
  };
}

function mapBump(row: typeof schema.bumpIntents.$inferSelect): StoredBumpIntent {
  return {
    id: row.id,
    userId: row.userId,
    clientTimestamp: row.clientTimestamp,
    serverTimestamp: row.serverTimestamp,
    ip: row.ip,
    geoCity: row.geoCity,
    geoRegion: row.geoRegion,
    geoCountry: row.geoCountry,
    geoLat: row.geoLat,
    geoLng: row.geoLng,
    peakMagnitude: row.peakMagnitude,
    idempotencyKey: row.idempotencyKey,
    status: row.status as StoredBumpIntent["status"],
    matchedBumpId: row.matchedBumpId,
    sessionId: row.sessionId,
    expiresAt: row.expiresAt,
  };
}

function mapMemory(row: typeof schema.memories.$inferSelect): StoredMemory {
  return {
    id: row.id,
    sessionId: row.sessionId,
    status: row.status as StoredMemory["status"],
    note: row.note,
    windowStartsAt: row.windowStartsAt,
    windowExpiresAt: row.windowExpiresAt,
    lockedAt: row.lockedAt,
    createdAt: row.createdAt,
  };
}

function mapMemoryPhoto(
  row: typeof schema.memoryPhotos.$inferSelect,
): MemoryPhoto {
  return {
    id: row.id,
    userId: row.userId,
    photoUrl: row.photoUrl,
    uploadOrder: row.uploadOrder,
  };
}

function mapMemorySong(
  row: typeof schema.memorySongs.$inferSelect,
): MemorySong {
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

function mapSpotifyConnection(
  row: typeof schema.spotifyConnections.$inferSelect,
): StoredSpotifyConnection {
  return {
    userId: row.userId,
    spotifyUserId: row.spotifyUserId,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

function mapFriendRequest(
  row: typeof schema.friendRequests.$inferSelect,
): StoredFriendRequest {
  return {
    id: row.id,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    status: row.status as StoredFriendRequest["status"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function placesSqlMatch(a: StoredBumpIntent): ReturnType<typeof and> {
  const serverMs = a.serverTimestamp.getTime();
  const geoCountry = a.geoCountry;
  const geoCity = a.geoCity;
  const geoRegion = a.geoRegion;
  const geoLat = a.geoLat;
  const geoLng = a.geoLng;
  const ip = a.ip;

  return and(
    eq(schema.bumpIntents.status, "pending"),
    ne(schema.bumpIntents.userId, a.userId),
    gt(schema.bumpIntents.expiresAt, new Date()),
    sql`abs(extract(epoch from ${schema.bumpIntents.serverTimestamp}) * 1000 - ${serverMs}::float8) <= ${MATCH_TIME_WINDOW_MS}::float8`,
    sql`(
      (${schema.bumpIntents.geoCountry} is not null and ${geoCountry}::text is not null and ${schema.bumpIntents.geoCountry} = ${geoCountry}::text
        and (
          (${schema.bumpIntents.geoCity} is not null and ${geoCity}::text is not null and ${schema.bumpIntents.geoCity} = ${geoCity}::text)
          or (${schema.bumpIntents.geoRegion} is not null and ${geoRegion}::text is not null and ${schema.bumpIntents.geoRegion} = ${geoRegion}::text)
        )
      )
      or (
        ${schema.bumpIntents.geoLat} is not null and ${schema.bumpIntents.geoLng} is not null
        and ${geoLat}::float8 is not null and ${geoLng}::float8 is not null
        and sqrt(power(${schema.bumpIntents.geoLat} - ${geoLat}::float8, 2) + power(${schema.bumpIntents.geoLng} - ${geoLng}::float8, 2)) < 0.5
      )
      or ${schema.bumpIntents.ip} = ${ip}::text
    )`,
  );
}

function storeError(message: string, status: number): Error {
  const err = new Error(message);
  (err as Error & { status: number }).status = status;
  return err;
}

export function createNeonStore(databaseUrl: string): Store {
  const sqlClient = neon(databaseUrl);
  const db = drizzle(sqlClient, { schema });

  async function allocateFriendCode(): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const code = generateFriendCode();
      const [existing] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.friendCode, code))
        .limit(1);
      if (!existing) return code;
    }
    throw new Error("Failed to allocate friend code");
  }

  async function ensureFriendCode(
    row: typeof schema.users.$inferSelect,
  ): Promise<StoredUser> {
    if (row.friendCode) return mapUser(row);
    const code = await allocateFriendCode();
    const [updated] = await db
      .update(schema.users)
      .set({ friendCode: code })
      .where(eq(schema.users.id, row.id))
      .returning();
    return mapUser(updated);
  }

  async function expireIfNeeded(
    bump: StoredBumpIntent,
  ): Promise<StoredBumpIntent> {
    if (
      bump.status === "pending" &&
      bump.expiresAt.getTime() <= Date.now()
    ) {
      const [row] = await db
        .update(schema.bumpIntents)
        .set({ status: "expired" })
        .where(eq(schema.bumpIntents.id, bump.id))
        .returning();
      return mapBump(row);
    }
    return bump;
  }

  async function loadSession(id: string): Promise<Session | null> {
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, id))
      .limit(1);
    if (!session) return null;

    const memberRows = await db
      .select({
        member: schema.sessionMembers,
        user: schema.users,
      })
      .from(schema.sessionMembers)
      .innerJoin(schema.users, eq(schema.sessionMembers.userId, schema.users.id))
      .where(eq(schema.sessionMembers.sessionId, id));

    return {
      id: session.id,
      createdVia: "bump",
      status: session.status as Session["status"],
      payload: session.payload,
      createdAt: toIso(session.createdAt),
      members: memberRows.map(({ member, user }) => ({
        userId: member.userId,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        joinedAt: toIso(member.joinedAt),
        confirmedAt: member.confirmedAt ? toIso(member.confirmedAt) : null,
      })),
    };
  }

  /** Session membership is authoritative for who owes a submission (N-safe). */
  async function loadSessionMemberUsers(sessionId: string) {
    return db
      .select({ member: schema.sessionMembers, user: schema.users })
      .from(schema.sessionMembers)
      .innerJoin(
        schema.users,
        eq(schema.sessionMembers.userId, schema.users.id),
      )
      .where(eq(schema.sessionMembers.sessionId, sessionId))
      .orderBy(asc(schema.sessionMembers.userId));
  }

  async function submittedUserIdSet(memoryId: string): Promise<Set<string>> {
    const rows = await db
      .select({ userId: schema.memorySubmissions.userId })
      .from(schema.memorySubmissions)
      .where(
        and(
          eq(schema.memorySubmissions.memoryId, memoryId),
          isNotNull(schema.memorySubmissions.submittedAt),
        ),
      );
    return new Set(rows.map((r) => r.userId));
  }

  async function loadMemoryPhotos(
    memoryId: string,
    userId?: string,
  ): Promise<MemoryPhoto[]> {
    const rows = await db
      .select()
      .from(schema.memoryPhotos)
      .where(
        userId
          ? and(
              eq(schema.memoryPhotos.memoryId, memoryId),
              eq(schema.memoryPhotos.userId, userId),
            )
          : eq(schema.memoryPhotos.memoryId, memoryId),
      )
      .orderBy(
        asc(schema.memoryPhotos.userId),
        asc(schema.memoryPhotos.uploadOrder),
      );
    return rows.map(mapMemoryPhoto);
  }

  async function loadMemorySongs(
    memoryId: string,
    userId?: string,
  ): Promise<MemorySong[]> {
    const rows = await db
      .select()
      .from(schema.memorySongs)
      .where(
        userId
          ? and(
              eq(schema.memorySongs.memoryId, memoryId),
              eq(schema.memorySongs.userId, userId),
            )
          : eq(schema.memorySongs.memoryId, memoryId),
      )
      .orderBy(asc(schema.memorySongs.userId), asc(schema.memorySongs.position));
    return rows.map(mapMemorySong);
  }

  async function loadMemory(memoryId: string): Promise<StoredMemory | null> {
    const [row] = await db
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, memoryId))
      .limit(1);
    return row ? mapMemory(row) : null;
  }

  /** Draft while open (own contributions only), full reveal once locked. */
  async function shapeMemory(
    memory: StoredMemory,
    viewerUserId: string,
  ): Promise<MemoryResponse | null> {
    if (memory.status === "expired") return null;

    const memberRows = await loadSessionMemberUsers(memory.sessionId);
    const submitted = await submittedUserIdSet(memory.id);
    const members: MemoryMember[] = memberRows.map(({ member, user }) => ({
      userId: member.userId,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      submitted: submitted.has(member.userId),
      isViewer: member.userId === viewerUserId,
    }));

    const base = {
      id: memory.id,
      sessionId: memory.sessionId,
      note: memory.note,
      hangoutAt: toIso(memory.windowStartsAt),
      windowStartsAt: toIso(memory.windowStartsAt),
      windowExpiresAt: toIso(memory.windowExpiresAt),
      members,
    };

    if (memory.status === "locked") {
      const [playlist] = await db
        .select()
        .from(schema.memoryPlaylists)
        .where(
          and(
            eq(schema.memoryPlaylists.memoryId, memory.id),
            eq(schema.memoryPlaylists.userId, viewerUserId),
          ),
        )
        .limit(1);
      return {
        ...base,
        status: "locked",
        lockedAt: toIso(memory.lockedAt ?? memory.windowExpiresAt),
        photos: await loadMemoryPhotos(memory.id),
        songs: await loadMemorySongs(memory.id),
        myPlaylist: playlist
          ? {
              spotifyPlaylistId: playlist.spotifyPlaylistId,
              spotifyPlaylistUrl: playlist.spotifyPlaylistUrl,
            }
          : null,
      };
    }

    return {
      ...base,
      status: "open",
      lockedAt: null,
      mySubmitted: submitted.has(viewerUserId),
      myPhotos: await loadMemoryPhotos(memory.id, viewerUserId),
      mySongs: await loadMemorySongs(memory.id, viewerUserId),
    };
  }

  /** Shared by submit + sweeper: lock when every session member has submitted. */
  async function lockIfAllSubmitted(
    memory: StoredMemory,
    at: Date,
  ): Promise<StoredMemory> {
    const memberRows = await loadSessionMemberUsers(memory.sessionId);
    const submitted = await submittedUserIdSet(memory.id);
    const allSubmitted =
      memberRows.length > 0 &&
      memberRows.every(({ member }) => submitted.has(member.userId));
    if (!allSubmitted) return memory;

    const [locked] = await db
      .update(schema.memories)
      .set({ status: "locked", lockedAt: at })
      .where(
        and(eq(schema.memories.id, memory.id), eq(schema.memories.status, "open")),
      )
      .returning();
    return locked ? mapMemory(locked) : ((await loadMemory(memory.id)) ?? memory);
  }

  async function seedMemory(
    sessionId: string,
    memberUserIds: string[],
    sessionCreatedAt: Date,
  ): Promise<StoredMemory> {
    const [inserted] = await db
      .insert(schema.memories)
      .values({
        sessionId,
        status: "open",
        windowStartsAt: sessionCreatedAt,
        windowExpiresAt: new Date(sessionCreatedAt.getTime() + MEMORY_WINDOW_MS),
      })
      .onConflictDoNothing({ target: schema.memories.sessionId })
      .returning();

    const memory =
      inserted ??
      (
        await db
          .select()
          .from(schema.memories)
          .where(eq(schema.memories.sessionId, sessionId))
          .limit(1)
      )[0];
    if (!memory) throw new Error("Failed to create memory for session");

    if (memberUserIds.length > 0) {
      await db
        .insert(schema.memorySubmissions)
        .values(
          memberUserIds.map((userId) => ({ memoryId: memory.id, userId })),
        )
        .onConflictDoNothing();
    }
    return mapMemory(memory);
  }

  async function listFriendIds(userId: string): Promise<string[]> {
    const rows = await db
      .select()
      .from(schema.friendships)
      .where(
        or(
          eq(schema.friendships.userAId, userId),
          eq(schema.friendships.userBId, userId),
        ),
      );
    return rows.map((r) => (r.userAId === userId ? r.userBId : r.userAId));
  }

  async function areFriends(a: string, b: string): Promise<boolean> {
    const { userAId, userBId } = orderedFriendshipPair(a, b);
    const [row] = await db
      .select()
      .from(schema.friendships)
      .where(
        and(
          eq(schema.friendships.userAId, userAId),
          eq(schema.friendships.userBId, userBId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async function ensureSubscription(eventId: string, userId: string) {
    await db
      .insert(schema.eventSubscriptions)
      .values({ eventId, userId })
      .onConflictDoNothing();
  }

  async function insertActivity(
    userId: string,
    type: ActivityNotification["type"],
    eventId: string,
    actorUserId: string,
    payload: Record<string, unknown>,
  ) {
    if (userId === actorUserId) return;
    await db.insert(schema.activityNotifications).values({
      userId,
      type,
      eventId,
      actorUserId,
      payload,
    });
  }

  async function listSubscriberIds(eventId: string): Promise<string[]> {
    const rows = await db
      .select({ userId: schema.eventSubscriptions.userId })
      .from(schema.eventSubscriptions)
      .where(eq(schema.eventSubscriptions.eventId, eventId));
    return rows.map((r) => r.userId);
  }

  async function myRsvp(
    eventId: string,
    userId: string,
  ): Promise<RsvpStatus | null> {
    const [row] = await db
      .select()
      .from(schema.eventAttendees)
      .where(
        and(
          eq(schema.eventAttendees.eventId, eventId),
          eq(schema.eventAttendees.userId, userId),
        ),
      )
      .limit(1);
    return row ? (row.status as RsvpStatus) : null;
  }

  function mapCalendarEvent(
    event: typeof schema.events.$inferSelect,
    hostDisplayName: string,
    rsvp: RsvpStatus | null,
  ): CalendarEvent {
    return {
      id: event.id,
      hostUserId: event.hostUserId,
      hostDisplayName,
      title: event.title,
      description: event.description,
      imageUrl: event.imageUrl,
      startsAt: toIso(event.startsAt),
      endsAt: event.endsAt ? toIso(event.endsAt) : null,
      createdAt: toIso(event.createdAt),
      myRsvp: rsvp,
    };
  }

  async function canSeeEvent(
    viewerId: string,
    event: typeof schema.events.$inferSelect,
  ): Promise<boolean> {
    if (event.hostUserId === viewerId) return true;

    const [sub] = await db
      .select()
      .from(schema.eventSubscriptions)
      .where(
        and(
          eq(schema.eventSubscriptions.eventId, event.id),
          eq(schema.eventSubscriptions.userId, viewerId),
        ),
      )
      .limit(1);
    if (sub) return true;

    if (await areFriends(viewerId, event.hostUserId)) return true;

    const friendIds = await listFriendIds(viewerId);
    if (friendIds.length === 0) return false;

    const going = await db
      .select()
      .from(schema.eventAttendees)
      .where(
        and(
          eq(schema.eventAttendees.eventId, event.id),
          eq(schema.eventAttendees.status, "going"),
          sql`${schema.eventAttendees.userId} = any(${friendIds}::uuid[])`,
        ),
      )
      .limit(1);
    return going.length > 0;
  }

  async function loadEventDetail(
    viewerId: string,
    eventId: string,
  ): Promise<EventDetail | null> {
    const [event] = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, eventId))
      .limit(1);
    if (!event) return null;
    if (!(await canSeeEvent(viewerId, event))) return null;

    const [host] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, event.hostUserId))
      .limit(1);

    const attendeeRows = await db
      .select({
        attendee: schema.eventAttendees,
        user: schema.users,
      })
      .from(schema.eventAttendees)
      .innerJoin(schema.users, eq(schema.eventAttendees.userId, schema.users.id))
      .where(eq(schema.eventAttendees.eventId, eventId));

    const commentRows = await db
      .select({
        comment: schema.eventComments,
        user: schema.users,
      })
      .from(schema.eventComments)
      .innerJoin(schema.users, eq(schema.eventComments.userId, schema.users.id))
      .where(eq(schema.eventComments.eventId, eventId))
      .orderBy(schema.eventComments.createdAt);

    const rsvp = await myRsvp(eventId, viewerId);

    return {
      ...mapCalendarEvent(event, host?.displayName ?? "Unknown", rsvp),
      attendees: attendeeRows
        .map(({ attendee, user }) => ({
          userId: attendee.userId,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          status: attendee.status as RsvpStatus,
          updatedAt: toIso(attendee.updatedAt),
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
      comments: commentRows.map(({ comment, user }) => ({
        id: comment.id,
        eventId: comment.eventId,
        userId: comment.userId,
        displayName: user.displayName,
        body: comment.body,
        createdAt: toIso(comment.createdAt),
      })),
    };
  }

  return {
    async bootstrapUser({ displayName, deviceId }) {
      if (deviceId) {
        const [existing] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.deviceId, deviceId))
          .limit(1);
        if (existing) {
          const withCode = await ensureFriendCode(existing);
          if (existing.displayName !== displayName) {
            const [updated] = await db
              .update(schema.users)
              .set({ displayName })
              .where(eq(schema.users.id, existing.id))
              .returning();
            return mapUser({ ...updated, friendCode: withCode.friendCode });
          }
          return withCode;
        }
      }
      const friendCode = await allocateFriendCode();
      const [row] = await db
        .insert(schema.users)
        .values({ displayName, deviceId: deviceId ?? null, friendCode })
        .returning();
      return mapUser(row);
    },

    async upsertFromAuth(input) {
      const [existing] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.authUserId, input.authUserId))
        .limit(1);
      if (existing) {
        const withCode = await ensureFriendCode(existing);
        const [updated] = await db
          .update(schema.users)
          .set({
            displayName: input.displayName || existing.displayName,
            avatarUrl: input.avatarUrl ?? existing.avatarUrl,
            email: input.email ?? existing.email,
          })
          .where(eq(schema.users.id, existing.id))
          .returning();
        return mapUser({ ...updated, friendCode: withCode.friendCode });
      }
      const friendCode = await allocateFriendCode();
      const [row] = await db
        .insert(schema.users)
        .values({
          displayName: input.displayName,
          avatarUrl: input.avatarUrl ?? null,
          email: input.email ?? null,
          authUserId: input.authUserId,
          deviceId: null,
          friendCode,
        })
        .returning();
      return mapUser(row);
    },

    async getUser(id) {
      const [row] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, id))
        .limit(1);
      return row ? ensureFriendCode(row) : null;
    },

    async getUserByAuthId(authUserId) {
      const [row] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.authUserId, authUserId))
        .limit(1);
      return row ? ensureFriendCode(row) : null;
    },

    async findBumpByIdempotency(userId, idempotencyKey) {
      const [row] = await db
        .select()
        .from(schema.bumpIntents)
        .where(
          and(
            eq(schema.bumpIntents.userId, userId),
            eq(schema.bumpIntents.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      return row ? expireIfNeeded(mapBump(row)) : null;
    },

    async getBump(id) {
      const [row] = await db
        .select()
        .from(schema.bumpIntents)
        .where(eq(schema.bumpIntents.id, id))
        .limit(1);
      return row ? expireIfNeeded(mapBump(row)) : null;
    },

    async createBump(input: CreateBumpInput) {
      const existing = await this.findBumpByIdempotency(
        input.userId,
        input.idempotencyKey,
      );
      if (existing) return existing;

      const [row] = await db
        .insert(schema.bumpIntents)
        .values({
          userId: input.userId,
          clientTimestamp: input.clientTimestamp,
          serverTimestamp: new Date(),
          ip: input.geo.ip,
          geoCity: input.geo.city,
          geoRegion: input.geo.region,
          geoCountry: input.geo.country,
          geoLat: input.geo.lat,
          geoLng: input.geo.lng,
          peakMagnitude: input.peakMagnitude ?? null,
          idempotencyKey: input.idempotencyKey,
          status: "pending",
          expiresAt: input.expiresAt,
        })
        .returning();
      return mapBump(row);
    },

    async expireBump(id) {
      const bump = await this.getBump(id);
      if (!bump) return null;
      if (bump.status !== "pending") return bump;
      const [row] = await db
        .update(schema.bumpIntents)
        .set({ status: "expired" })
        .where(eq(schema.bumpIntents.id, id))
        .returning();
      return mapBump(row);
    },

    async tryMatchBump(bumpId) {
      let bump = await this.getBump(bumpId);
      if (!bump) throw new Error("Bump not found");
      bump = await expireIfNeeded(bump);

      if (bump.status !== "pending") {
        let peer: StoredUser | null = null;
        if (bump.matchedBumpId) {
          const partner = await this.getBump(bump.matchedBumpId);
          if (partner) peer = await this.getUser(partner.userId);
        }
        const session = bump.sessionId
          ? await loadSession(bump.sessionId)
          : null;
        return { bump, peer, session };
      }

      const candidates = await db
        .select()
        .from(schema.bumpIntents)
        .where(placesSqlMatch(bump))
        .limit(5);

      const partnerRow = candidates[0];
      if (!partnerRow) {
        return { bump, peer: null, session: null };
      }

      const partner = mapBump(partnerRow);
      const userA = (await this.getUser(bump.userId))!;
      const userB = (await this.getUser(partner.userId))!;
      const sessionId = randomUUID();
      const now = new Date();
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

      await db.insert(schema.sessions).values({
        id: sessionId,
        createdVia: "bump",
        status: "pending_confirm",
        payload,
        createdAt: now,
      });
      await db.insert(schema.sessionMembers).values([
        { sessionId, userId: userA.id, joinedAt: now },
        { sessionId, userId: userB.id, joinedAt: now },
      ]);

      // Memory row must exist before this call returns so the client can jump
      // straight to /memories/session/:sessionId without racing.
      await seedMemory(sessionId, [userA.id, userB.id], now);

      const [matchedA] = await db
        .update(schema.bumpIntents)
        .set({
          status: "matched",
          matchedBumpId: partner.id,
          sessionId,
        })
        .where(
          and(
            eq(schema.bumpIntents.id, bump.id),
            eq(schema.bumpIntents.status, "pending"),
          ),
        )
        .returning();

      if (!matchedA) {
        const reloaded = await this.getBump(bumpId);
        return {
          bump: reloaded!,
          peer: null,
          session: reloaded?.sessionId
            ? await loadSession(reloaded.sessionId)
            : null,
        };
      }

      await db
        .update(schema.bumpIntents)
        .set({
          status: "matched",
          matchedBumpId: bump.id,
          sessionId,
        })
        .where(eq(schema.bumpIntents.id, partner.id));

      const session = await loadSession(sessionId);
      return { bump: mapBump(matchedA), peer: userB, session };
    },

    async getSession(id) {
      return loadSession(id);
    },

    async listSessionsForUser(userId) {
      const rows = await db
        .select({ session: schema.sessions })
        .from(schema.sessionMembers)
        .innerJoin(
          schema.sessions,
          eq(schema.sessionMembers.sessionId, schema.sessions.id),
        )
        .where(eq(schema.sessionMembers.userId, userId))
        .orderBy(desc(schema.sessions.createdAt));

      const sessions: Session[] = [];
      for (const { session } of rows) {
        const full = await loadSession(session.id);
        if (full) sessions.push(full);
      }
      return sessions;
    },

    async confirmSession(sessionId, userId) {
      const now = new Date();
      await db
        .update(schema.sessionMembers)
        .set({ confirmedAt: now })
        .where(
          and(
            eq(schema.sessionMembers.sessionId, sessionId),
            eq(schema.sessionMembers.userId, userId),
          ),
        );

      const members = await db
        .select()
        .from(schema.sessionMembers)
        .where(eq(schema.sessionMembers.sessionId, sessionId));

      if (members.length > 0 && members.every((m) => m.confirmedAt != null)) {
        await db
          .update(schema.sessions)
          .set({ status: "active" })
          .where(eq(schema.sessions.id, sessionId));
      }

      return loadSession(sessionId);
    },

    async updateProfile(userId, input) {
      const existing = await this.getUser(userId);
      if (!existing) throw storeError("User not found", 404);
      const [updated] = await db
        .update(schema.users)
        .set({
          displayName: input.displayName ?? existing.displayName,
          bio: input.bio !== undefined ? input.bio : existing.bio,
          avatarUrl:
            input.avatarUrl !== undefined ? input.avatarUrl : existing.avatarUrl,
        })
        .where(eq(schema.users.id, userId))
        .returning();
      return mapUser(updated);
    },

    async getFriendsMe(userId) {
      const me = await this.getUser(userId);
      if (!me) throw storeError("User not found", 404);
      const friendIds = await listFriendIds(userId);
      const friends: FriendSummary[] = [];
      for (const fid of friendIds) {
        const u = await this.getUser(fid);
        if (u) {
          friends.push({
            id: u.id,
            displayName: u.displayName,
            avatarUrl: u.avatarUrl,
          });
        }
      }
      friends.sort((a, b) => a.displayName.localeCompare(b.displayName));
      return { friendCode: me.friendCode, friends };
    },

    async createFriendRequest(fromUserId, code) {
      const normalized = normalizeFriendCode(code);
      const [target] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.friendCode, normalized))
        .limit(1);
      if (!target) throw storeError("Friend code not found", 404);
      if (target.id === fromUserId) {
        throw storeError("Cannot friend yourself", 400);
      }
      if (await areFriends(fromUserId, target.id)) {
        throw storeError("Already friends", 409);
      }

      const pending = await db
        .select()
        .from(schema.friendRequests)
        .where(
          and(
            eq(schema.friendRequests.status, "pending"),
            or(
              and(
                eq(schema.friendRequests.fromUserId, fromUserId),
                eq(schema.friendRequests.toUserId, target.id),
              ),
              and(
                eq(schema.friendRequests.fromUserId, target.id),
                eq(schema.friendRequests.toUserId, fromUserId),
              ),
            ),
          ),
        )
        .limit(1);
      if (pending.length > 0) {
        throw storeError("Friend request already pending", 409);
      }

      const [row] = await db
        .insert(schema.friendRequests)
        .values({
          fromUserId,
          toUserId: target.id,
          status: "pending",
        })
        .returning();
      return mapFriendRequest(row);
    },

    async listFriendInbox(userId) {
      const rows = await db
        .select({
          request: schema.friendRequests,
          fromUser: schema.users,
        })
        .from(schema.friendRequests)
        .innerJoin(
          schema.users,
          eq(schema.friendRequests.fromUserId, schema.users.id),
        )
        .where(
          and(
            eq(schema.friendRequests.toUserId, userId),
            eq(schema.friendRequests.status, "pending"),
          ),
        )
        .orderBy(desc(schema.friendRequests.createdAt));

      return rows.map(({ request, fromUser }): InboxFriendRequest => ({
        id: request.id,
        fromUserId: request.fromUserId,
        toUserId: request.toUserId,
        status: request.status as InboxFriendRequest["status"],
        createdAt: toIso(request.createdAt),
        updatedAt: toIso(request.updatedAt),
        fromUser: {
          id: fromUser.id,
          displayName: fromUser.displayName,
          avatarUrl: fromUser.avatarUrl,
        },
      }));
    },

    async acceptFriendRequest(userId, requestId) {
      const [req] = await db
        .select()
        .from(schema.friendRequests)
        .where(eq(schema.friendRequests.id, requestId))
        .limit(1);
      if (!req || req.toUserId !== userId) {
        throw storeError("Friend request not found", 404);
      }
      if (req.status !== "pending") {
        throw storeError("Friend request is not pending", 409);
      }

      const [updated] = await db
        .update(schema.friendRequests)
        .set({ status: "accepted", updatedAt: new Date() })
        .where(eq(schema.friendRequests.id, requestId))
        .returning();

      const pair = orderedFriendshipPair(req.fromUserId, req.toUserId);
      await db
        .insert(schema.friendships)
        .values({ userAId: pair.userAId, userBId: pair.userBId })
        .onConflictDoNothing();

      return mapFriendRequest(updated);
    },

    async rejectFriendRequest(userId, requestId) {
      const [req] = await db
        .select()
        .from(schema.friendRequests)
        .where(eq(schema.friendRequests.id, requestId))
        .limit(1);
      if (!req || req.toUserId !== userId) {
        throw storeError("Friend request not found", 404);
      }
      if (req.status !== "pending") {
        throw storeError("Friend request is not pending", 409);
      }
      const [updated] = await db
        .update(schema.friendRequests)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(eq(schema.friendRequests.id, requestId))
        .returning();
      return mapFriendRequest(updated);
    },

    async unfriend(userId, otherUserId) {
      const pair = orderedFriendshipPair(userId, otherUserId);
      const deleted = await db
        .delete(schema.friendships)
        .where(
          and(
            eq(schema.friendships.userAId, pair.userAId),
            eq(schema.friendships.userBId, pair.userBId),
          ),
        )
        .returning();
      return deleted.length > 0;
    },

    async createEvent(input: CreateEventInput) {
      const now = new Date();
      const [event] = await db
        .insert(schema.events)
        .values({
          hostUserId: input.hostUserId,
          title: input.title,
          description: input.description,
          imageUrl: input.imageUrl,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          createdAt: now,
        })
        .returning();

      await db.insert(schema.eventAttendees).values({
        eventId: event.id,
        userId: input.hostUserId,
        status: "going",
        updatedAt: now,
      });
      await ensureSubscription(event.id, input.hostUserId);

      const friends = await listFriendIds(input.hostUserId);
      for (const fid of friends) {
        await ensureSubscription(event.id, fid);
        await insertActivity(fid, "event_published", event.id, input.hostUserId, {
          title: event.title,
          startsAt: toIso(event.startsAt),
        });
      }

      const host = await this.getUser(input.hostUserId);
      return mapCalendarEvent(event, host?.displayName ?? "Unknown", "going");
    },

    async listCalendar(userId) {
      const friendIds = await listFriendIds(userId);
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Hosted by me
      const hosted = await db
        .select({ event: schema.events, host: schema.users })
        .from(schema.events)
        .innerJoin(schema.users, eq(schema.events.hostUserId, schema.users.id))
        .where(
          and(
            eq(schema.events.hostUserId, userId),
            gt(schema.events.startsAt, cutoff),
          ),
        );

      // Hosted by friends
      const fromFriends =
        friendIds.length > 0
          ? await db
              .select({ event: schema.events, host: schema.users })
              .from(schema.events)
              .innerJoin(
                schema.users,
                eq(schema.events.hostUserId, schema.users.id),
              )
              .where(
                and(
                  sql`${schema.events.hostUserId} = any(${friendIds}::uuid[])`,
                  gt(schema.events.startsAt, cutoff),
                ),
              )
          : [];

      // Explicit subscriptions
      const subscribed = await db
        .select({ event: schema.events, host: schema.users })
        .from(schema.eventSubscriptions)
        .innerJoin(
          schema.events,
          eq(schema.eventSubscriptions.eventId, schema.events.id),
        )
        .innerJoin(schema.users, eq(schema.events.hostUserId, schema.users.id))
        .where(
          and(
            eq(schema.eventSubscriptions.userId, userId),
            gt(schema.events.startsAt, cutoff),
          ),
        );

      // FOAF: friend is going
      const foaf =
        friendIds.length > 0
          ? await db
              .select({ event: schema.events, host: schema.users })
              .from(schema.eventAttendees)
              .innerJoin(
                schema.events,
                eq(schema.eventAttendees.eventId, schema.events.id),
              )
              .innerJoin(
                schema.users,
                eq(schema.events.hostUserId, schema.users.id),
              )
              .where(
                and(
                  eq(schema.eventAttendees.status, "going"),
                  sql`${schema.eventAttendees.userId} = any(${friendIds}::uuid[])`,
                  gt(schema.events.startsAt, cutoff),
                ),
              )
          : [];

      const byId = new Map<string, { event: typeof schema.events.$inferSelect; hostName: string }>();
      for (const group of [hosted, fromFriends, subscribed, foaf]) {
        for (const { event, host } of group) {
          byId.set(event.id, { event, hostName: host.displayName });
        }
      }

      const result: CalendarEvent[] = [];
      for (const { event, hostName } of byId.values()) {
        const rsvp = await myRsvp(event.id, userId);
        result.push(mapCalendarEvent(event, hostName, rsvp));
      }
      return result.sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );
    },

    async getEventDetail(userId, eventId) {
      return loadEventDetail(userId, eventId);
    },

    async rsvpEvent(userId, eventId, status) {
      const [event] = await db
        .select()
        .from(schema.events)
        .where(eq(schema.events.id, eventId))
        .limit(1);
      if (!event) return null;
      if (!(await canSeeEvent(userId, event))) return null;

      const now = new Date();
      await db
        .insert(schema.eventAttendees)
        .values({
          eventId,
          userId,
          status,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [schema.eventAttendees.eventId, schema.eventAttendees.userId],
          set: { status, updatedAt: now },
        });

      await ensureSubscription(eventId, userId);

      const subscribers = await listSubscriberIds(eventId);
      for (const sid of subscribers) {
        await insertActivity(sid, "rsvp_changed", eventId, userId, {
          status,
          title: event.title,
        });
      }

      if (status === "going") {
        const friends = await listFriendIds(userId);
        for (const fid of friends) {
          const [existing] = await db
            .select()
            .from(schema.eventSubscriptions)
            .where(
              and(
                eq(schema.eventSubscriptions.eventId, eventId),
                eq(schema.eventSubscriptions.userId, fid),
              ),
            )
            .limit(1);
          if (existing) continue;
          await ensureSubscription(eventId, fid);
          await insertActivity(fid, "event_published", eventId, userId, {
            title: event.title,
            startsAt: toIso(event.startsAt),
            via: "foaf_attendance",
          });
        }
      }

      return loadEventDetail(userId, eventId);
    },

    async addEventComment(userId, eventId, body) {
      const [event] = await db
        .select()
        .from(schema.events)
        .where(eq(schema.events.id, eventId))
        .limit(1);
      if (!event || !(await canSeeEvent(userId, event))) {
        throw storeError("Event not found", 404);
      }

      await ensureSubscription(eventId, userId);
      const [comment] = await db
        .insert(schema.eventComments)
        .values({ eventId, userId, body })
        .returning();

      const subscribers = await listSubscriberIds(eventId);
      for (const sid of subscribers) {
        await insertActivity(sid, "event_comment", eventId, userId, {
          body,
          title: event.title,
        });
      }

      const user = await this.getUser(userId);
      const result: EventComment = {
        id: comment.id,
        eventId: comment.eventId,
        userId: comment.userId,
        displayName: user?.displayName ?? "Unknown",
        body: comment.body,
        createdAt: toIso(comment.createdAt),
      };
      return result;
    },

    async listActivity(userId) {
      const rows = await db
        .select({
          notification: schema.activityNotifications,
          actor: schema.users,
        })
        .from(schema.activityNotifications)
        .innerJoin(
          schema.users,
          eq(schema.activityNotifications.actorUserId, schema.users.id),
        )
        .where(eq(schema.activityNotifications.userId, userId))
        .orderBy(desc(schema.activityNotifications.createdAt))
        .limit(100);

      return rows.map(({ notification, actor }) => ({
        id: notification.id,
        type: notification.type as ActivityNotification["type"],
        eventId: notification.eventId,
        actorUserId: notification.actorUserId,
        actorDisplayName: actor.displayName,
        payload: notification.payload ?? {},
        createdAt: toIso(notification.createdAt),
        readAt: notification.readAt ? toIso(notification.readAt) : null,
      }));
    },

    async markActivityRead(userId, notificationId) {
      const [row] = await db
        .select({
          notification: schema.activityNotifications,
          actor: schema.users,
        })
        .from(schema.activityNotifications)
        .innerJoin(
          schema.users,
          eq(schema.activityNotifications.actorUserId, schema.users.id),
        )
        .where(
          and(
            eq(schema.activityNotifications.id, notificationId),
            eq(schema.activityNotifications.userId, userId),
          ),
        )
        .limit(1);
      if (!row) return null;

      const now = new Date();
      const [updated] = await db
        .update(schema.activityNotifications)
        .set({ readAt: row.notification.readAt ?? now })
        .where(eq(schema.activityNotifications.id, notificationId))
        .returning();

      return {
        id: updated.id,
        type: updated.type as ActivityNotification["type"],
        eventId: updated.eventId,
        actorUserId: updated.actorUserId,
        actorDisplayName: row.actor.displayName,
        payload: updated.payload ?? {},
        createdAt: toIso(updated.createdAt),
        readAt: updated.readAt ? toIso(updated.readAt) : null,
      };
    },

    async markAllActivityRead(userId) {
      const now = new Date();
      const updated = await db
        .update(schema.activityNotifications)
        .set({ readAt: now })
        .where(
          and(
            eq(schema.activityNotifications.userId, userId),
            sql`${schema.activityNotifications.readAt} is null`,
          ),
        )
        .returning();
      return updated.length;
    },

    async createMemoryForSession(sessionId, memberUserIds, sessionCreatedAt) {
      return seedMemory(sessionId, memberUserIds, sessionCreatedAt);
    },

    async getMemoryAccess(memoryId, userId) {
      const memory = await loadMemory(memoryId);
      if (!memory) return null;

      const memberRows = await loadSessionMemberUsers(memory.sessionId);
      const memberUserIds = memberRows.map(({ member }) => member.userId);
      const submitted = await submittedUserIdSet(memoryId);

      const [photoRow] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(schema.memoryPhotos)
        .where(
          and(
            eq(schema.memoryPhotos.memoryId, memoryId),
            eq(schema.memoryPhotos.userId, userId),
          ),
        );
      const [songRow] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(schema.memorySongs)
        .where(
          and(
            eq(schema.memorySongs.memoryId, memoryId),
            eq(schema.memorySongs.userId, userId),
          ),
        );

      return {
        memory,
        isMember: memberUserIds.includes(userId),
        submitted: submitted.has(userId),
        photoCount: photoRow?.value ?? 0,
        songCount: songRow?.value ?? 0,
        memberUserIds,
      };
    },

    async getMemoryBySessionId(sessionId, viewerUserId) {
      const [row] = await db
        .select()
        .from(schema.memories)
        .where(eq(schema.memories.sessionId, sessionId))
        .limit(1);
      if (!row) return null;
      const memory = mapMemory(row);
      const memberRows = await loadSessionMemberUsers(memory.sessionId);
      if (!memberRows.some(({ member }) => member.userId === viewerUserId)) {
        return null;
      }
      return shapeMemory(memory, viewerUserId);
    },

    async getMemoryById(memoryId, viewerUserId) {
      const memory = await loadMemory(memoryId);
      if (!memory) return null;
      const memberRows = await loadSessionMemberUsers(memory.sessionId);
      if (!memberRows.some(({ member }) => member.userId === viewerUserId)) {
        return null;
      }
      return shapeMemory(memory, viewerUserId);
    },

    async listLockedMemoriesForUser(userId) {
      const rows = await db
        .select({ memory: schema.memories })
        .from(schema.memories)
        .innerJoin(
          schema.sessionMembers,
          eq(schema.memories.sessionId, schema.sessionMembers.sessionId),
        )
        .where(
          and(
            eq(schema.sessionMembers.userId, userId),
            eq(schema.memories.status, "locked"),
          ),
        )
        .orderBy(desc(schema.memories.windowStartsAt));

      const result: MemoryListItem[] = [];
      for (const { memory: row } of rows) {
        const memory = mapMemory(row);
        const memberRows = await loadSessionMemberUsers(memory.sessionId);

        // Cover = first frame of the first photobooth strip (interleave index 0).
        const [cover] = await db
          .select({ photoUrl: schema.memoryPhotos.photoUrl })
          .from(schema.memoryPhotos)
          .where(eq(schema.memoryPhotos.memoryId, memory.id))
          .orderBy(
            asc(schema.memoryPhotos.userId),
            asc(schema.memoryPhotos.uploadOrder),
          )
          .limit(1);

        const [songRow] = await db
          .select({ value: sql<number>`count(*)::int` })
          .from(schema.memorySongs)
          .where(eq(schema.memorySongs.memoryId, memory.id));

        result.push({
          id: memory.id,
          sessionId: memory.sessionId,
          hangoutAt: toIso(memory.windowStartsAt),
          lockedAt: toIso(memory.lockedAt ?? memory.windowExpiresAt),
          memberDisplayNames: memberRows.map(({ user }) => user.displayName),
          coverPhotoUrl: cover?.photoUrl ?? null,
          songCount: songRow?.value ?? 0,
        });
      }
      return result;
    },

    async addMemoryPhoto(memoryId, userId, photoUrl) {
      const [maxRow] = await db
        .select({
          maxOrder: sql<number | null>`max(${schema.memoryPhotos.uploadOrder})::int`,
        })
        .from(schema.memoryPhotos)
        .where(
          and(
            eq(schema.memoryPhotos.memoryId, memoryId),
            eq(schema.memoryPhotos.userId, userId),
          ),
        );
      const nextOrder = (maxRow?.maxOrder ?? -1) + 1;

      const [row] = await db
        .insert(schema.memoryPhotos)
        .values({ memoryId, userId, photoUrl, uploadOrder: nextOrder })
        .returning();
      return mapMemoryPhoto(row);
    },

    async deleteMemoryPhoto(memoryId, userId, photoId) {
      const deleted = await db
        .delete(schema.memoryPhotos)
        .where(
          and(
            eq(schema.memoryPhotos.id, photoId),
            eq(schema.memoryPhotos.memoryId, memoryId),
            eq(schema.memoryPhotos.userId, userId),
          ),
        )
        .returning();
      return deleted.length > 0;
    },

    async upsertMemorySong(memoryId, userId, position, input) {
      const [row] = await db
        .insert(schema.memorySongs)
        .values({
          memoryId,
          userId,
          position,
          spotifyUrl: input.spotifyUrl,
          spotifyTrackId: input.spotifyTrackId,
          trackTitle: input.trackTitle,
          artistName: input.artistName,
          albumArtUrl: input.albumArtUrl,
        })
        .onConflictDoUpdate({
          target: [
            schema.memorySongs.memoryId,
            schema.memorySongs.userId,
            schema.memorySongs.position,
          ],
          set: {
            spotifyUrl: input.spotifyUrl,
            spotifyTrackId: input.spotifyTrackId,
            trackTitle: input.trackTitle,
            artistName: input.artistName,
            albumArtUrl: input.albumArtUrl,
          },
        })
        .returning();
      return mapMemorySong(row);
    },

    async deleteMemorySong(memoryId, userId, position) {
      const deleted = await db
        .delete(schema.memorySongs)
        .where(
          and(
            eq(schema.memorySongs.memoryId, memoryId),
            eq(schema.memorySongs.userId, userId),
            eq(schema.memorySongs.position, position),
          ),
        )
        .returning();
      return deleted.length > 0;
    },

    async updateMemoryNote(memoryId, note) {
      const [row] = await db
        .update(schema.memories)
        .set({ note })
        .where(eq(schema.memories.id, memoryId))
        .returning();
      return row ? mapMemory(row) : null;
    },

    async submitMemory(memoryId, userId) {
      const memory = await loadMemory(memoryId);
      if (!memory) throw storeError("Memory not found", 404);
      if (memory.status !== "open") {
        throw storeError("Memory is no longer open", 409);
      }

      const memberRows = await loadSessionMemberUsers(memory.sessionId);
      const memberUserIds = memberRows.map(({ member }) => member.userId);
      if (!memberUserIds.includes(userId)) {
        throw storeError("Not a member of this memory", 403);
      }
      if ((await submittedUserIdSet(memoryId)).has(userId)) {
        throw storeError("You already submitted", 409);
      }

      const songs = await loadMemorySongs(memoryId, userId);
      const positions = new Set(songs.map((s) => s.position));
      if (positions.size !== MEMORY_SONGS_PER_USER) {
        throw storeError(
          `Add ${MEMORY_SONGS_PER_USER} songs before submitting`,
          400,
        );
      }
      const photos = await loadMemoryPhotos(memoryId, userId);
      if (!isValidMemoryPhotoCount(photos.length)) {
        throw storeError("Photos must come in pairs (2, 4, 6, or 8)", 400);
      }

      const now = new Date();
      await db
        .insert(schema.memorySubmissions)
        .values({ memoryId, userId, submittedAt: now })
        .onConflictDoUpdate({
          target: [
            schema.memorySubmissions.memoryId,
            schema.memorySubmissions.userId,
          ],
          set: { submittedAt: now },
        });

      const updated = await lockIfAllSubmitted(memory, now);
      return {
        memory: updated,
        locked: updated.status === "locked",
        memberUserIds,
      };
    },

    async expireStaleMemories() {
      const now = new Date();
      const stale = await db
        .select()
        .from(schema.memories)
        .where(
          and(
            eq(schema.memories.status, "open"),
            lt(schema.memories.windowExpiresAt, now),
          ),
        );

      const expired: ExpiredMemory[] = [];
      for (const row of stale) {
        const memory = mapMemory(row);

        // Everyone submitted right at the boundary — lock instead of discard.
        const maybeLocked = await lockIfAllSubmitted(memory, now);
        if (maybeLocked.status === "locked") continue;

        const [updated] = await db
          .update(schema.memories)
          .set({ status: "expired" })
          .where(
            and(
              eq(schema.memories.id, memory.id),
              eq(schema.memories.status, "open"),
            ),
          )
          .returning();
        if (!updated) continue;

        const photos = await loadMemoryPhotos(memory.id);
        expired.push({
          memoryId: memory.id,
          sessionId: memory.sessionId,
          photoUrls: photos.map((p) => p.photoUrl),
        });
      }
      return expired;
    },

    async getSpotifyConnection(userId) {
      const [row] = await db
        .select()
        .from(schema.spotifyConnections)
        .where(eq(schema.spotifyConnections.userId, userId))
        .limit(1);
      return row ? mapSpotifyConnection(row) : null;
    },

    async upsertSpotifyConnection(userId, tokens) {
      const [row] = await db
        .insert(schema.spotifyConnections)
        .values({
          userId,
          spotifyUserId: tokens.spotifyUserId,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
        })
        .onConflictDoUpdate({
          target: schema.spotifyConnections.userId,
          set: {
            spotifyUserId: tokens.spotifyUserId,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: tokens.expiresAt,
          },
        })
        .returning();
      return mapSpotifyConnection(row);
    },

    async deleteSpotifyConnection(userId) {
      const deleted = await db
        .delete(schema.spotifyConnections)
        .where(eq(schema.spotifyConnections.userId, userId))
        .returning();
      return deleted.length > 0;
    },

    async upsertMemoryPlaylist(memoryId, userId, playlistId, playlistUrl) {
      await db
        .insert(schema.memoryPlaylists)
        .values({
          memoryId,
          userId,
          spotifyPlaylistId: playlistId,
          spotifyPlaylistUrl: playlistUrl,
        })
        .onConflictDoUpdate({
          target: [
            schema.memoryPlaylists.memoryId,
            schema.memoryPlaylists.userId,
          ],
          set: {
            spotifyPlaylistId: playlistId,
            spotifyPlaylistUrl: playlistUrl,
          },
        });
    },
  };
}
