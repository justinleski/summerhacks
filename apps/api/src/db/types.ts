import type {
  ActivityNotification,
  ActivityType,
  BumpStatus,
  CalendarEvent,
  EventComment,
  EventDetail,
  FriendRequest,
  FriendRequestStatus,
  FriendSummary,
  MemoryListItem,
  MemoryPhoto,
  MemoryResponse,
  MemorySong,
  MemorySongInput,
  MemoryStatus,
  RsvpStatus,
  Session,
  SessionPayload,
  SessionStatus,
  User,
} from "@summerhacks/shared";

export type GeoPlace = {
  ip: string;
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
};

export type StoredUser = User & {
  deviceId: string | null;
  authUserId: string | null;
  email: string | null;
  friendCode: string;
  bio: string | null;
};

export type UpdateProfileInput = {
  displayName?: string;
  bio?: string | null;
  avatarUrl?: string | null;
};

export type UpsertAuthUserInput = {
  authUserId: string;
  displayName: string;
  avatarUrl?: string | null;
  email?: string | null;
};

export type StoredBumpIntent = {
  id: string;
  userId: string;
  clientTimestamp: Date;
  serverTimestamp: Date;
  ip: string;
  geoCity: string | null;
  geoRegion: string | null;
  geoCountry: string | null;
  geoLat: number | null;
  geoLng: number | null;
  peakMagnitude: number | null;
  idempotencyKey: string;
  status: BumpStatus;
  matchedBumpId: string | null;
  sessionId: string | null;
  expiresAt: Date;
};

export type StoredSession = {
  id: string;
  createdVia: "bump";
  status: SessionStatus;
  payload: SessionPayload;
  createdAt: Date;
};

export type StoredSessionMember = {
  sessionId: string;
  userId: string;
  joinedAt: Date;
  confirmedAt: Date | null;
};

export type CreateBumpInput = {
  userId: string;
  clientTimestamp: Date;
  peakMagnitude: number | null;
  idempotencyKey: string;
  geo: GeoPlace;
  expiresAt: Date;
};

export type StoredFriendRequest = {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: FriendRequestStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateEventInput = {
  hostUserId: string;
  title: string;
  description: string;
  imageUrl: string | null;
  startsAt: Date;
  endsAt: Date | null;
};

export type FriendsMeResult = {
  friendCode: string;
  friends: FriendSummary[];
};

export type InboxFriendRequest = FriendRequest & {
  fromUser: FriendSummary;
};

export type StoredMemory = {
  id: string;
  sessionId: string;
  status: MemoryStatus;
  note: string | null;
  windowStartsAt: Date;
  windowExpiresAt: Date;
  lockedAt: Date | null;
  createdAt: Date;
};

/** Everything the route guards need in one read: membership, submit state, counts. */
export type StoredMemoryAccess = {
  memory: StoredMemory;
  isMember: boolean;
  submitted: boolean;
  photoCount: number;
  songCount: number;
  memberUserIds: string[];
};

export type SubmitMemoryResult = {
  memory: StoredMemory;
  /** True when this submission was the one that locked the memory. */
  locked: boolean;
  memberUserIds: string[];
};

export type ExpiredMemory = {
  memoryId: string;
  sessionId: string;
  photoUrls: string[];
};

export type StoredSpotifyConnection = {
  userId: string;
  spotifyUserId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  createdAt: Date;
};

export type UpsertSpotifyConnectionInput = {
  spotifyUserId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

export interface Store {
  bootstrapUser(input: {
    displayName: string;
    deviceId?: string;
  }): Promise<StoredUser>;
  upsertFromAuth(input: UpsertAuthUserInput): Promise<StoredUser>;
  getUser(id: string): Promise<StoredUser | null>;
  getUserByAuthId(authUserId: string): Promise<StoredUser | null>;
  findBumpByIdempotency(
    userId: string,
    idempotencyKey: string,
  ): Promise<StoredBumpIntent | null>;
  getBump(id: string): Promise<StoredBumpIntent | null>;
  createBump(input: CreateBumpInput): Promise<StoredBumpIntent>;
  expireBump(id: string): Promise<StoredBumpIntent | null>;
  /** Atomically try to match a pending bump; returns updated bump + peer + session if matched */
  tryMatchBump(bumpId: string): Promise<{
    bump: StoredBumpIntent;
    peer: StoredUser | null;
    session: Session | null;
  }>;
  getSession(id: string): Promise<Session | null>;
  listSessionsForUser(userId: string): Promise<Session[]>;
  confirmSession(sessionId: string, userId: string): Promise<Session | null>;
  updateProfile(userId: string, input: UpdateProfileInput): Promise<StoredUser>;

  // Friends
  getFriendsMe(userId: string): Promise<FriendsMeResult>;
  createFriendRequest(
    fromUserId: string,
    code: string,
  ): Promise<StoredFriendRequest>;
  listFriendInbox(userId: string): Promise<InboxFriendRequest[]>;
  acceptFriendRequest(
    userId: string,
    requestId: string,
  ): Promise<StoredFriendRequest>;
  rejectFriendRequest(
    userId: string,
    requestId: string,
  ): Promise<StoredFriendRequest>;
  unfriend(userId: string, otherUserId: string): Promise<boolean>;

  // Calendar / events
  createEvent(input: CreateEventInput): Promise<CalendarEvent>;
  listCalendar(userId: string): Promise<CalendarEvent[]>;
  getEventDetail(userId: string, eventId: string): Promise<EventDetail | null>;
  rsvpEvent(
    userId: string,
    eventId: string,
    status: RsvpStatus,
  ): Promise<EventDetail | null>;
  addEventComment(
    userId: string,
    eventId: string,
    body: string,
  ): Promise<EventComment>;
  listActivity(userId: string): Promise<ActivityNotification[]>;
  markActivityRead(
    userId: string,
    notificationId: string,
  ): Promise<ActivityNotification | null>;
  markAllActivityRead(userId: string): Promise<number>;

  // Memories
  /** Called from `tryMatchBump` the moment a bump session is created. */
  createMemoryForSession(
    sessionId: string,
    memberUserIds: string[],
    sessionCreatedAt: Date,
  ): Promise<StoredMemory>;
  /** Guard helper: membership + submit state + counts for one memory. */
  getMemoryAccess(
    memoryId: string,
    userId: string,
  ): Promise<StoredMemoryAccess | null>;
  /** Viewer-scoped draft while open, full memory once locked, null when expired. */
  getMemoryBySessionId(
    sessionId: string,
    viewerUserId: string,
  ): Promise<MemoryResponse | null>;
  getMemoryById(
    memoryId: string,
    viewerUserId: string,
  ): Promise<MemoryResponse | null>;
  listLockedMemoriesForUser(userId: string): Promise<MemoryListItem[]>;
  addMemoryPhoto(
    memoryId: string,
    userId: string,
    photoUrl: string,
  ): Promise<MemoryPhoto>;
  deleteMemoryPhoto(
    memoryId: string,
    userId: string,
    photoId: string,
  ): Promise<boolean>;
  upsertMemorySong(
    memoryId: string,
    userId: string,
    position: number,
    input: MemorySongInput,
  ): Promise<MemorySong>;
  deleteMemorySong(
    memoryId: string,
    userId: string,
    position: number,
  ): Promise<boolean>;
  /** Shared note — any member may write, last write wins. */
  updateMemoryNote(
    memoryId: string,
    note: string | null,
  ): Promise<StoredMemory | null>;
  submitMemory(memoryId: string, userId: string): Promise<SubmitMemoryResult>;
  /** Locks fully-submitted stale memories, expires the rest. Returns expired ones. */
  expireStaleMemories(): Promise<ExpiredMemory[]>;

  // Spotify
  getSpotifyConnection(userId: string): Promise<StoredSpotifyConnection | null>;
  upsertSpotifyConnection(
    userId: string,
    tokens: UpsertSpotifyConnectionInput,
  ): Promise<StoredSpotifyConnection>;
  deleteSpotifyConnection(userId: string): Promise<boolean>;
  upsertMemoryPlaylist(
    memoryId: string,
    userId: string,
    playlistId: string,
    playlistUrl: string,
  ): Promise<void>;
}

export function toIso(d: Date): string {
  return d.toISOString();
}

export function orderedFriendshipPair(
  a: string,
  b: string,
): { userAId: string; userBId: string } {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

export type { ActivityType };
