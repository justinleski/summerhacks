import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { and, desc, eq, gt, inArray, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import {
  MATCH_TIME_WINDOW_MS,
  TALLY_WINDOW_DAYS,
  type ActivityNotification,
  type CalendarEvent,
  type EventComment,
  type EventDetail,
  type FriendListEntry,
  type RsvpStatus,
  type Session,
  type SessionPayload,
} from "@summerhacks/shared";
import { generateFriendCode, normalizeFriendCode } from "./friend-code.js";
import * as schema from "./schema.js";
import type {
  CreateBumpInput,
  CreateCheckinInput,
  CreateEventInput,
  CreateEventPhotoInput,
  InboxFriendRequest,
  StoredBumpIntent,
  StoredCheckin,
  StoredEventPhoto,
  StoredFriendCheckin,
  StoredFriendRequest,
  StoredUser,
  Store,
  TallyRegionCount,
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

function mapCheckin(row: typeof schema.checkins.$inferSelect): StoredCheckin {
  return {
    id: row.id,
    userId: row.userId,
    lat: row.lat,
    lng: row.lng,
    region: row.region,
    photoUrl: row.photoUrl,
    caption: row.caption,
    createdAt: row.createdAt,
  };
}

function mapEventPhoto(
  row: typeof schema.eventPhotos.$inferSelect,
): StoredEventPhoto {
  return {
    id: row.id,
    eventId: row.eventId,
    photoUrl: row.photoUrl,
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
          inArray(schema.eventAttendees.userId, friendIds),
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
      const friendshipRows = await db
        .select()
        .from(schema.friendships)
        .where(
          or(
            eq(schema.friendships.userAId, userId),
            eq(schema.friendships.userBId, userId),
          ),
        );
      const watchlistByFriendId = new Map<string, boolean>();
      for (const row of friendshipRows) {
        const otherId = row.userAId === userId ? row.userBId : row.userAId;
        watchlistByFriendId.set(otherId, row.isWatchlisted);
      }
      const friends: FriendListEntry[] = [];
      for (const fid of friendIds) {
        const u = await this.getUser(fid);
        if (u) {
          friends.push({
            id: u.id,
            displayName: u.displayName,
            avatarUrl: u.avatarUrl,
            isWatchlisted: watchlistByFriendId.get(fid) ?? false,
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

    async acceptFriendRequest(userId, requestId, region) {
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

      await db.insert(schema.connections).values({
        type: "friend_add",
        region,
      });

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

    async setFriendshipWatchlist(userId, friendId, isWatchlisted) {
      const pair = orderedFriendshipPair(userId, friendId);
      const updated = await db
        .update(schema.friendships)
        .set({ isWatchlisted })
        .where(
          and(
            eq(schema.friendships.userAId, pair.userAId),
            eq(schema.friendships.userBId, pair.userBId),
          ),
        )
        .returning();
      return updated.length > 0;
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
                  inArray(schema.events.hostUserId, friendIds),
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
                  inArray(schema.eventAttendees.userId, friendIds),
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

    async rsvpEvent(userId, eventId, status, region) {
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

        await db.insert(schema.connections).values({
          type: "event_join",
          region,
        });
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

    async addEventPhoto(input: CreateEventPhotoInput) {
      const [row] = await db
        .insert(schema.eventPhotos)
        .values({ eventId: input.eventId, photoUrl: input.photoUrl })
        .returning();
      return mapEventPhoto(row);
    },

    async listEventPhotos(eventId) {
      const rows = await db
        .select()
        .from(schema.eventPhotos)
        .where(eq(schema.eventPhotos.eventId, eventId))
        .orderBy(desc(schema.eventPhotos.createdAt));
      return rows.map(mapEventPhoto);
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

    async createCheckin(input: CreateCheckinInput) {
      const now = new Date();
      const [row] = await db
        .insert(schema.checkins)
        .values({
          userId: input.userId,
          lat: input.lat,
          lng: input.lng,
          region: input.region,
          photoUrl: input.photoUrl,
          caption: input.caption,
          createdAt: now,
        })
        .returning();

      await db.insert(schema.connections).values({
        type: "checkin",
        region: input.connectionRegion,
        createdAt: now,
      });

      return mapCheckin(row);
    },

    async listCheckinsForUser(userId) {
      const rows = await db
        .select()
        .from(schema.checkins)
        .where(eq(schema.checkins.userId, userId))
        .orderBy(desc(schema.checkins.createdAt));
      return rows.map(mapCheckin);
    },

    async listFriendCheckins(userId) {
      const friendIds = await listFriendIds(userId);
      if (friendIds.length === 0) return [];

      const watchlistedRows = await db
        .select({
          userAId: schema.friendships.userAId,
          userBId: schema.friendships.userBId,
        })
        .from(schema.friendships)
        .where(
          and(
            or(
              eq(schema.friendships.userAId, userId),
              eq(schema.friendships.userBId, userId),
            ),
            eq(schema.friendships.isWatchlisted, true),
          ),
        );
      const watchlistedIds = new Set(
        watchlistedRows.map((r) =>
          r.userAId === userId ? r.userBId : r.userAId,
        ),
      );
      const visibleFriendIds = friendIds.filter(
        (id) => !watchlistedIds.has(id),
      );
      if (visibleFriendIds.length === 0) return [];

      const rows = await db
        .select({ checkin: schema.checkins, owner: schema.users })
        .from(schema.checkins)
        .innerJoin(schema.users, eq(schema.checkins.userId, schema.users.id))
        .where(inArray(schema.checkins.userId, visibleFriendIds))
        .orderBy(desc(schema.checkins.createdAt));

      const result: StoredFriendCheckin[] = rows.map(({ checkin, owner }) => ({
        ...mapCheckin(checkin),
        ownerDisplayName: owner.displayName,
        ownerAvatarUrl: owner.avatarUrl,
      }));
      return result;
    },

    async listCheckinsForFriend(userId, friendId) {
      const ok = await areFriends(userId, friendId);
      if (!ok) return null;
      const rows = await db
        .select()
        .from(schema.checkins)
        .where(eq(schema.checkins.userId, friendId))
        .orderBy(desc(schema.checkins.createdAt));
      return rows.map(mapCheckin);
    },

    async getTally() {
      const cutoff = new Date(
        Date.now() - TALLY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      );
      const rows = await db
        .select({
          region: schema.connections.region,
          type: schema.connections.type,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.connections)
        .where(gt(schema.connections.createdAt, cutoff))
        .groupBy(schema.connections.region, schema.connections.type);

      const byRegion = new Map<string, TallyRegionCount>();
      for (const row of rows) {
        const entry = byRegion.get(row.region) ?? {
          region: row.region,
          checkin: 0,
          friendAdd: 0,
          eventJoin: 0,
        };
        if (row.type === "checkin") entry.checkin = row.count;
        else if (row.type === "friend_add") entry.friendAdd = row.count;
        else if (row.type === "event_join") entry.eventJoin = row.count;
        byRegion.set(row.region, entry);
      }
      return [...byRegion.values()].sort(
        (a, b) =>
          b.checkin +
          b.friendAdd +
          b.eventJoin -
          (a.checkin + a.friendAdd + a.eventJoin),
      );
    },
  };
}
