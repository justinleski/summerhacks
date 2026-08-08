import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { and, desc, eq, gt, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import {
  MATCH_TIME_WINDOW_MS,
  type Session,
  type SessionPayload,
} from "@summerhacks/shared";
import * as schema from "./schema.js";
import type {
  CreateBumpInput,
  StoredBumpIntent,
  StoredUser,
  Store,
} from "./types.js";
import { toIso } from "./types.js";

function mapUser(row: typeof schema.users.$inferSelect): StoredUser {
  return {
    id: row.id,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    deviceId: row.deviceId,
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

function placesSqlMatch(a: StoredBumpIntent): ReturnType<typeof and> {
  // Neon HTTP driver needs explicit casts — untyped params become "could not determine data type of parameter $N"
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

export function createNeonStore(databaseUrl: string): Store {
  const sqlClient = neon(databaseUrl);
  const db = drizzle(sqlClient, { schema });

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

  return {
    async bootstrapUser({ displayName, deviceId }) {
      if (deviceId) {
        const [existing] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.deviceId, deviceId))
          .limit(1);
        if (existing) {
          if (existing.displayName !== displayName) {
            const [updated] = await db
              .update(schema.users)
              .set({ displayName })
              .where(eq(schema.users.id, existing.id))
              .returning();
            return mapUser(updated);
          }
          return mapUser(existing);
        }
      }
      const [row] = await db
        .insert(schema.users)
        .values({ displayName, deviceId: deviceId ?? null })
        .returning();
      return mapUser(row);
    },

    async getUser(id) {
      const [row] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, id))
        .limit(1);
      return row ? mapUser(row) : null;
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
        // Lost race; reload
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
  };
}
