import { z } from "zod";

export const MATCH_TIME_WINDOW_MS = 2000;
export const BUMP_EXPIRY_MS = 8000;
export const BUMP_POLL_INTERVAL_MS = 500;
/**
 * After auto-match expires, candidates are other recent same-place bump intents
 * created within this window (45s — within the 30–60s product range).
 * Proposal TTL uses the same constant.
 */
export const BUMP_CANDIDATE_WINDOW_MS = 45_000;

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

/** Anonymous candidate for post-expiry "was this you?" picker — no displayName. */
export const bumpCandidateSchema = z.object({
  bumpId: z.string().uuid(),
  userId: z.string().uuid(),
  avatarUrl: z.string().url().nullable(),
});
export type BumpCandidate = z.infer<typeof bumpCandidateSchema>;

export const bumpCandidatesResponseSchema = z.object({
  candidates: z.array(bumpCandidateSchema),
});
export type BumpCandidatesResponse = z.infer<typeof bumpCandidatesResponseSchema>;

export const proposeBumpBodySchema = z.object({
  targetBumpId: z.string().uuid(),
});
export type ProposeBumpBody = z.infer<typeof proposeBumpBodySchema>;

export const bumpProposalStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  "expired",
]);
export type BumpProposalStatus = z.infer<typeof bumpProposalStatusSchema>;

export const bumpProposalSchema = z.object({
  id: z.string().uuid(),
  fromBumpId: z.string().uuid(),
  toBumpId: z.string().uuid(),
  fromUserId: z.string().uuid(),
  toUserId: z.string().uuid(),
  status: bumpProposalStatusSchema,
  sessionId: z.string().uuid().nullable(),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  /** Proposer avatar for incoming prompt — no displayName required. */
  fromAvatarUrl: z.string().url().nullable().optional(),
});
export type BumpProposal = z.infer<typeof bumpProposalSchema>;

export const bumpProposalsResponseSchema = z.object({
  proposals: z.array(bumpProposalSchema),
});
export type BumpProposalsResponse = z.infer<typeof bumpProposalsResponseSchema>;

export const acceptBumpProposalResponseSchema = z.object({
  proposalId: z.string().uuid(),
  status: z.literal("accepted"),
  sessionId: z.string().uuid(),
  bumpId: z.string().uuid(),
  peer: peerSummarySchema,
});
export type AcceptBumpProposalResponse = z.infer<
  typeof acceptBumpProposalResponseSchema
>;

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

export const friendListEntrySchema = peerSummarySchema.extend({
  isWatchlisted: z.boolean(),
});
export type FriendListEntry = z.infer<typeof friendListEntrySchema>;

export const friendsMeResponseSchema = z.object({
  friendCode: z.string(),
  friends: z.array(friendListEntrySchema),
});
export type FriendsMeResponse = z.infer<typeof friendsMeResponseSchema>;

export const setFriendshipWatchlistBodySchema = z.object({
  isWatchlisted: z.boolean(),
});
export type SetFriendshipWatchlistBody = z.infer<
  typeof setFriendshipWatchlistBodySchema
>;

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

export const createEventPhotoBodySchema = z.object({
  photoUrl: z.string().url(),
});
export type CreateEventPhotoBody = z.infer<typeof createEventPhotoBodySchema>;

export const eventPhotoSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  photoUrl: z.string(),
  createdAt: z.string().datetime(),
});
export type EventPhoto = z.infer<typeof eventPhotoSchema>;

export const uploadEventPhotoResponseSchema = z.object({
  url: z.string().url(),
});
export type UploadEventPhotoResponse = z.infer<
  typeof uploadEventPhotoResponseSchema
>;

// --- Checkins / map ---

export const CHECKIN_CAPTION_MAX = 140;
export const CHECKIN_REGION_MAX = 120;

export const createCheckinBodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  region: z.string().min(1).max(CHECKIN_REGION_MAX),
  caption: z.string().max(CHECKIN_CAPTION_MAX).optional(),
  photoUrl: z.string().url().nullable().optional(),
});
export type CreateCheckinBody = z.infer<typeof createCheckinBodySchema>;

export const checkinSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  lat: z.number(),
  lng: z.number(),
  region: z.string().nullable(),
  photoUrl: z.string().nullable(),
  caption: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type Checkin = z.infer<typeof checkinSchema>;

export const uploadCheckinPhotoResponseSchema = z.object({
  url: z.string().url(),
});
export type UploadCheckinPhotoResponse = z.infer<
  typeof uploadCheckinPhotoResponseSchema
>;

export const friendCheckinSchema = checkinSchema.extend({
  ownerDisplayName: z.string(),
  ownerAvatarUrl: z.string().nullable(),
});
export type FriendCheckin = z.infer<typeof friendCheckinSchema>;

export const friendMapResponseSchema = z.object({
  friend: peerSummarySchema,
  checkins: z.array(checkinSchema),
});
export type FriendMapResponse = z.infer<typeof friendMapResponseSchema>;

// --- Public tally (no auth) ---

export const TALLY_WINDOW_DAYS = 7;
export const TALLY_POLL_INTERVAL_MS = 8000;

export const connectionTypeSchema = z.enum([
  "checkin",
  "friend_add",
  "event_join",
]);
export type ConnectionType = z.infer<typeof connectionTypeSchema>;

export const tallyRegionSchema = z.object({
  region: z.string(),
  checkin: z.number().int().nonnegative(),
  friendAdd: z.number().int().nonnegative(),
  eventJoin: z.number().int().nonnegative(),
});
export type TallyRegion = z.infer<typeof tallyRegionSchema>;

export const tallyResponseSchema = z.object({
  windowDays: z.literal(TALLY_WINDOW_DAYS),
  regions: z.array(tallyRegionSchema),
});
export type TallyResponse = z.infer<typeof tallyResponseSchema>;

// --- Session album covers (one per member) + vote / spin ---

/** Default cover edit window after bump session create. Override with ALBUM_EDIT_WINDOW_MS. */
export const ALBUM_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const COVER_CONTEST_POLL_MS = 1500;
export const PIXEL_GRID_SIZES = [16, 32] as const;
export type PixelGridSize = (typeof PIXEL_GRID_SIZES)[number];
export const DEFAULT_PIXEL_GRID_SIZE: PixelGridSize = 16;

export const pixelGridSizeSchema = z.union([z.literal(16), z.literal(32)]);

export const pixelCellSchema = z.string().nullable();

export function emptyPixelGrid(size: PixelGridSize): (string | null)[] {
  return Array.from({ length: size * size }, () => null);
}

export function albumPixelsSchema(size: PixelGridSize) {
  return z.array(pixelCellSchema).length(size * size);
}

/** @deprecated Prefer albumCoverSchema — kept as alias during migrate. */
export const albumSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  displayName: z.string(),
  title: z.string().nullable(),
  gridSize: pixelGridSizeSchema,
  pixels: z.array(pixelCellSchema),
  coverUrl: z.string().url().nullable(),
  editableUntil: z.string().datetime(),
  readyAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  editable: z.boolean(),
});
export type Album = z.infer<typeof albumSchema>;
export const albumCoverSchema = albumSchema;
export type AlbumCover = Album;

export const coverContestPhaseSchema = z.enum([
  "editing",
  "voting",
  "resolved",
]);
export type CoverContestPhase = z.infer<typeof coverContestPhaseSchema>;

export const coverVoteSchema = z.object({
  voterUserId: z.string().uuid(),
  choiceUserId: z.string().uuid().nullable(),
});
export type CoverVote = z.infer<typeof coverVoteSchema>;

export const coverContestSchema = z.object({
  phase: coverContestPhaseSchema,
  votes: z.array(coverVoteSchema),
  winnerUserId: z.string().uuid().nullable(),
  method: z.enum(["vote", "spin"]).nullable(),
  resolvedAt: z.string().datetime().nullable(),
});
export type CoverContest = z.infer<typeof coverContestSchema>;

export const sessionCoversResponseSchema = z.object({
  covers: z.array(albumCoverSchema),
  contest: coverContestSchema,
  mine: albumCoverSchema.nullable(),
});
export type SessionCoversResponse = z.infer<typeof sessionCoversResponseSchema>;

export const updateAlbumBodySchema = z
  .object({
    pixels: z.array(pixelCellSchema).optional(),
    coverUrl: z.string().url().nullable().optional(),
    gridSize: pixelGridSizeSchema.optional(),
    title: z.string().max(64).nullable().optional(),
  })
  .refine(
    (v) =>
      v.pixels !== undefined ||
      v.coverUrl !== undefined ||
      v.gridSize !== undefined ||
      v.title !== undefined,
    { message: "At least one field is required" },
  );
export type UpdateAlbumBody = z.infer<typeof updateAlbumBodySchema>;

export const coverVoteBodySchema = z.object({
  /** Cover author to vote for, or null to abstain / “surprise me”. */
  choiceUserId: z.string().uuid().nullable(),
});
export type CoverVoteBody = z.infer<typeof coverVoteBodySchema>;

// --- Memories (album receipt interior: songs + photos + note) ---

/** Same window as album covers — alias of ALBUM_EDIT_WINDOW_MS. */
export const MEMORY_WINDOW_MS = ALBUM_EDIT_WINDOW_MS;
export const MEMORY_MAX_PHOTOS_PER_USER = 8;
export const MEMORY_MIN_PHOTOS_PER_USER = 2;
export const MEMORY_SONGS_PER_USER = 3;
export const MEMORY_NOTE_MAX = 140;
export const PHOTOBOOTH_SLOTS_PER_STRIP = 4;
export const MEMORY_POLL_INTERVAL_MS = 2000;

/** Client/server: locked memories are immutable — cache for a week. */
export const LOCKED_MEMORY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Client in-memory TTL for open session / album / draft reads (then revalidate). */
export const OPEN_READ_CACHE_TTL_MS = 15_000;
/** Server in-process TTL for open memory / covers GET responses. */
export const SERVER_OPEN_READ_CACHE_TTL_MS = 5_000;
/** Server in-process TTL for session detail / session list. */
export const SERVER_SESSION_CACHE_TTL_MS = 30_000;
/** Server in-process TTL for locked memory GET responses. */
export const SERVER_LOCKED_MEMORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Photos are contributed in pairs: 2, 4, 6, or 8 per member. */
export const MEMORY_VALID_PHOTO_COUNTS = [2, 4, 6, 8] as const;

export function isValidMemoryPhotoCount(count: number): boolean {
  return (
    count >= MEMORY_MIN_PHOTOS_PER_USER &&
    count <= MEMORY_MAX_PHOTOS_PER_USER &&
    count % 2 === 0
  );
}

export const memoryStatusSchema = z.enum(["open", "locked", "expired"]);
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;

/** Resolved Spotify metadata for one contributed track. */
export const memorySongInputSchema = z.object({
  spotifyUrl: z.string().url(),
  spotifyTrackId: z.string().min(1),
  trackTitle: z.string().min(1),
  artistName: z.string().min(1),
  albumArtUrl: z.string().url().nullable(),
});
export type MemorySongInput = z.infer<typeof memorySongInputSchema>;

export const memorySongSchema = memorySongInputSchema.extend({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  position: z.number().int().min(0).max(MEMORY_SONGS_PER_USER - 1),
});
export type MemorySong = z.infer<typeof memorySongSchema>;

export const memoryPhotoSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  photoUrl: z.string().url(),
  uploadOrder: z.number().int().nonnegative(),
});
export type MemoryPhoto = z.infer<typeof memoryPhotoSchema>;

export const memoryMemberSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  submitted: z.boolean(),
  isViewer: z.boolean(),
});
export type MemoryMember = z.infer<typeof memoryMemberSchema>;

export const memoryPlaylistSchema = z.object({
  spotifyPlaylistId: z.string(),
  spotifyPlaylistUrl: z.string().url(),
});
export type MemoryPlaylist = z.infer<typeof memoryPlaylistSchema>;

const memoryBaseShape = {
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  note: z.string().nullable(),
  /** Mirrors `sessions.createdAt` — when the bump happened. */
  hangoutAt: z.string().datetime(),
  windowStartsAt: z.string().datetime(),
  windowExpiresAt: z.string().datetime(),
  members: z.array(memoryMemberSchema),
};

/**
 * Open window: collaborative — all members see everyone's photos/songs.
 * `mySubmitted` is a soft "I'm done" signal; it does not lock edits.
 */
export const memoryDraftResponseSchema = z.object({
  ...memoryBaseShape,
  status: z.literal("open"),
  lockedAt: z.null(),
  mySubmitted: z.boolean(),
  photos: z.array(memoryPhotoSchema),
  songs: z.array(memorySongSchema),
  /** Viewer's own contributions (convenience filters of photos/songs). */
  myPhotos: z.array(memoryPhotoSchema),
  mySongs: z.array(memorySongSchema),
});
export type MemoryDraftResponse = z.infer<typeof memoryDraftResponseSchema>;

/** Post-lock view: receipt + playlists; no further edits. */
export const memoryLockedResponseSchema = z.object({
  ...memoryBaseShape,
  status: z.literal("locked"),
  lockedAt: z.string().datetime(),
  photos: z.array(memoryPhotoSchema),
  songs: z.array(memorySongSchema),
  myPlaylist: memoryPlaylistSchema.nullable(),
});
export type MemoryLockedResponse = z.infer<typeof memoryLockedResponseSchema>;

export const memoryResponseSchema = z.discriminatedUnion("status", [
  memoryDraftResponseSchema,
  memoryLockedResponseSchema,
]);
export type MemoryResponse = z.infer<typeof memoryResponseSchema>;

export const memoryListItemSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  hangoutAt: z.string().datetime(),
  lockedAt: z.string().datetime(),
  memberDisplayNames: z.array(z.string()),
  coverPhotoUrl: z.string().url().nullable(),
  songCount: z.number().int().nonnegative(),
});
export type MemoryListItem = z.infer<typeof memoryListItemSchema>;

export const memoryPhotoUploadResponseSchema = z.object({
  photo: memoryPhotoSchema,
});
export type MemoryPhotoUploadResponse = z.infer<
  typeof memoryPhotoUploadResponseSchema
>;

export const putMemorySongBodySchema = z.object({
  spotifyUrl: z.string().min(1).max(512),
});
export type PutMemorySongBody = z.infer<typeof putMemorySongBodySchema>;

export const updateMemoryNoteBodySchema = z.object({
  note: z.string().max(MEMORY_NOTE_MAX).nullable(),
});
export type UpdateMemoryNoteBody = z.infer<typeof updateMemoryNoteBodySchema>;

/** Soft "I'm done" signal — does not lock the album; window end does. */
export const submitMemoryBodySchema = z.object({
  confirm: z.literal(true),
});
export type SubmitMemoryBody = z.infer<typeof submitMemoryBodySchema>;

export const spotifyStatusResponseSchema = z.object({
  connected: z.boolean(),
  spotifyUserId: z.string().nullable(),
});
export type SpotifyStatusResponse = z.infer<typeof spotifyStatusResponseSchema>;

export const spotifyConnectResponseSchema = z.object({
  authUrl: z.string().url(),
});
export type SpotifyConnectResponse = z.infer<
  typeof spotifyConnectResponseSchema
>;

export const exportPlaylistResponseSchema = z.object({
  playlistUrl: z.string().url(),
});
export type ExportPlaylistResponse = z.infer<
  typeof exportPlaylistResponseSchema
>;

/** Accepts `https://open.spotify.com/track/{id}`, `spotify:track:{id}`, or a bare id. */
export function parseSpotifyTrackId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const uriMatch = /^spotify:track:([A-Za-z0-9]+)$/.exec(raw);
  if (uriMatch) return uriMatch[1]!;

  const urlMatch = /^https?:\/\/[^/]*spotify\.com\/(?:[^/]+\/)*track\/([A-Za-z0-9]+)/.exec(
    raw,
  );
  if (urlMatch) return urlMatch[1]!;

  if (/^[A-Za-z0-9]{22}$/.test(raw)) return raw;
  return null;
}
