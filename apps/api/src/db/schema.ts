import {
  doublePrecision,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { SessionPayload } from "@summerhacks/shared";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    deviceId: text("device_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("users_device_id_idx").on(t.deviceId)],
);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdVia: text("created_via").notNull().default("bump"),
  status: text("status").notNull().default("pending_confirm"),
  payload: jsonb("payload").$type<SessionPayload>().notNull().default({
    profiles: [],
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessionMembers = pgTable(
  "session_members",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.userId] })],
);

export const bumpIntents = pgTable(
  "bump_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientTimestamp: timestamp("client_timestamp", { withTimezone: true })
      .notNull(),
    serverTimestamp: timestamp("server_timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ip: text("ip").notNull(),
    geoCity: text("geo_city"),
    geoRegion: text("geo_region"),
    geoCountry: text("geo_country"),
    geoLat: doublePrecision("geo_lat"),
    geoLng: doublePrecision("geo_lng"),
    peakMagnitude: doublePrecision("peak_magnitude"),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("pending"),
    matchedBumpId: uuid("matched_bump_id"),
    sessionId: uuid("session_id").references(() => sessions.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("bump_intents_user_idempotency_idx").on(
      t.userId,
      t.idempotencyKey,
    ),
  ],
);
