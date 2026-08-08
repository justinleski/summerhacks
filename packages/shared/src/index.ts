import { z } from "zod";

export const MATCH_TIME_WINDOW_MS = 2000;
export const BUMP_EXPIRY_MS = 8000;
export const BUMP_POLL_INTERVAL_MS = 500;

export const bumpStatusSchema = z.enum(["pending", "matched", "expired"]);
export type BumpStatus = z.infer<typeof bumpStatusSchema>;

export const sessionStatusSchema = z.enum([
  "pending_confirm",
  "active",
  "closed",
]);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const userSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).max(64),
  avatarUrl: z.string().url().nullable(),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof userSchema>;

export const bootstrapUserBodySchema = z.object({
  displayName: z.string().min(1).max(64),
  deviceId: z.string().min(1).max(128).optional(),
});
export type BootstrapUserBody = z.infer<typeof bootstrapUserBodySchema>;

export const createBumpBodySchema = z.object({
  clientTimestamp: z.number().int().positive(),
  peakMagnitude: z.number().nonnegative().optional(),
  idempotencyKey: z.string().min(8).max(128),
});
export type CreateBumpBody = z.infer<typeof createBumpBodySchema>;

export const peerSummarySchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});
export type PeerSummary = z.infer<typeof peerSummarySchema>;

export const bumpResponseSchema = z.object({
  bumpId: z.string().uuid(),
  status: bumpStatusSchema,
  expiresAt: z.string().datetime(),
  sessionId: z.string().uuid().nullable().optional(),
  peer: peerSummarySchema.nullable().optional(),
});
export type BumpResponse = z.infer<typeof bumpResponseSchema>;

export const sessionMemberSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  joinedAt: z.string().datetime(),
  confirmedAt: z.string().datetime().nullable(),
});
export type SessionMember = z.infer<typeof sessionMemberSchema>;

export const sessionPayloadSchema = z.object({
  profiles: z
    .array(
      z.object({
        userId: z.string().uuid(),
        displayName: z.string(),
        avatarUrl: z.string().nullable(),
        photoUrls: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  notes: z.string().optional(),
});
export type SessionPayload = z.infer<typeof sessionPayloadSchema>;

export const sessionSchema = z.object({
  id: z.string().uuid(),
  createdVia: z.literal("bump"),
  status: sessionStatusSchema,
  payload: sessionPayloadSchema,
  createdAt: z.string().datetime(),
  members: z.array(sessionMemberSchema),
});
export type Session = z.infer<typeof sessionSchema>;

export const bootstrapResponseSchema = z.object({
  user: userSchema,
  token: z.string(),
});
export type BootstrapResponse = z.infer<typeof bootstrapResponseSchema>;
