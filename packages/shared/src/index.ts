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

export const PROFILE_BIO_MAX = 280;

export const userSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).max(64),
  avatarUrl: z.string().url().nullable(),
  bio: z.string().max(PROFILE_BIO_MAX).nullable().optional(),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof userSchema>;

export const meProfileSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  bio: z.string().nullable(),
  email: z.string().nullable().optional(),
  friendCode: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type MeProfile = z.infer<typeof meProfileSchema>;

export const updateProfileBodySchema = z
  .object({
    displayName: z.string().min(1).max(64).optional(),
    bio: z.string().max(PROFILE_BIO_MAX).nullable().optional(),
    avatarUrl: z.string().url().nullable().optional(),
  })
  .refine(
    (v) =>
      v.displayName !== undefined ||
      v.bio !== undefined ||
      v.avatarUrl !== undefined,
    { message: "At least one of displayName, bio, avatarUrl is required" },
  );
export type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>;

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

// --- Friends ---

export const FRIEND_CODE_LENGTH = 8;

export const friendRequestStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
]);
export type FriendRequestStatus = z.infer<typeof friendRequestStatusSchema>;

export const createFriendRequestBodySchema = z.object({
  code: z
    .string()
    .min(4)
    .max(16)
    .transform((s) => s.trim().toUpperCase()),
});
export type CreateFriendRequestBody = z.infer<
  typeof createFriendRequestBodySchema
>;

export const friendSummarySchema = peerSummarySchema;
export type FriendSummary = z.infer<typeof friendSummarySchema>;

export const friendsMeResponseSchema = z.object({
  friendCode: z.string(),
  friends: z.array(friendSummarySchema),
});
export type FriendsMeResponse = z.infer<typeof friendsMeResponseSchema>;

export const friendRequestSchema = z.object({
  id: z.string().uuid(),
  fromUserId: z.string().uuid(),
  toUserId: z.string().uuid(),
  status: friendRequestStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  fromUser: peerSummarySchema.optional(),
});
export type FriendRequest = z.infer<typeof friendRequestSchema>;

// --- Calendar / events ---

export const EVENT_TITLE_MAX = 80;
export const EVENT_DESCRIPTION_MAX = 280;
export const EVENT_COMMENT_MAX = 280;
export const ACTIVITY_POLL_INTERVAL_MS = 2000;

export const rsvpStatusSchema = z.enum(["going", "not_going"]);
export type RsvpStatus = z.infer<typeof rsvpStatusSchema>;

export const activityTypeSchema = z.enum([
  "event_published",
  "rsvp_changed",
  "event_comment",
]);
export type ActivityType = z.infer<typeof activityTypeSchema>;

export const createEventBodySchema = z.object({
  title: z.string().min(1).max(EVENT_TITLE_MAX),
  description: z.string().min(1).max(EVENT_DESCRIPTION_MAX),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
});
export type CreateEventBody = z.infer<typeof createEventBodySchema>;

export const rsvpBodySchema = z.object({
  status: rsvpStatusSchema,
});
export type RsvpBody = z.infer<typeof rsvpBodySchema>;

export const createCommentBodySchema = z.object({
  body: z.string().min(1).max(EVENT_COMMENT_MAX),
});
export type CreateCommentBody = z.infer<typeof createCommentBodySchema>;

export const calendarEventSchema = z.object({
  id: z.string().uuid(),
  hostUserId: z.string().uuid(),
  hostDisplayName: z.string(),
  title: z.string(),
  description: z.string(),
  imageUrl: z.string().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  myRsvp: rsvpStatusSchema.nullable().optional(),
});
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export const eventAttendeeSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  status: rsvpStatusSchema,
  updatedAt: z.string().datetime(),
});
export type EventAttendee = z.infer<typeof eventAttendeeSchema>;

export const eventCommentSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  userId: z.string().uuid(),
  displayName: z.string(),
  body: z.string(),
  createdAt: z.string().datetime(),
});
export type EventComment = z.infer<typeof eventCommentSchema>;

export const eventDetailSchema = calendarEventSchema.extend({
  attendees: z.array(eventAttendeeSchema),
  comments: z.array(eventCommentSchema),
});
export type EventDetail = z.infer<typeof eventDetailSchema>;

export const activityNotificationSchema = z.object({
  id: z.string().uuid(),
  type: activityTypeSchema,
  eventId: z.string().uuid(),
  actorUserId: z.string().uuid(),
  actorDisplayName: z.string(),
  payload: z.record(z.unknown()),
  createdAt: z.string().datetime(),
  readAt: z.string().datetime().nullable(),
});
export type ActivityNotification = z.infer<typeof activityNotificationSchema>;

export const uploadEventImageResponseSchema = z.object({
  url: z.string().url(),
});
export type UploadEventImageResponse = z.infer<
  typeof uploadEventImageResponseSchema
>;
