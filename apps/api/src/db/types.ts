import type {
  ActivityNotification,
  ActivityType,
  Album,
  AlbumCover,
  BumpCandidate,
  BumpProposal,
  BumpProposalStatus,
  BumpStatus,
  CalendarEvent,
  CoverContest,
  CoverContestPhase,
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
  PeerSummary,
  PixelGridSize,
  RsvpStatus,
  Session,
  SessionPayload,
  SessionStatus,
  User,
} from "@summerhacks/shared";
import {
  ALBUM_EDIT_WINDOW_MS,
  DEFAULT_PIXEL_GRID_SIZE,
  emptyPixelGrid,
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

export type StoredAlbum = {
  id: string;
  sessionId: string;
  userId: string;
  title: string | null;
  gridSize: PixelGridSize;
  pixels: (string | null)[];
  coverUrl: string | null;
  editableUntil: Date;
  readyAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredAlbumContest = {
  sessionId: string;
  winnerUserId: string | null;
  method: "vote" | "spin" | null;
  resolvedAt: Date | null;
};

export type StoredAlbumVote = {
  sessionId: string;
  voterUserId: string;
  choiceUserId: string | null;
};

export type UpdateAlbumInput = {
  pixels?: (string | null)[];
  coverUrl?: string | null;
  gridSize?: PixelGridSize;
  title?: string | null;
};

export function albumEditWindowMs(): number {
  const raw = process.env.ALBUM_EDIT_WINDOW_MS;
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return ALBUM_EDIT_WINDOW_MS;
}

export function toAlbumView(
  row: StoredAlbum,
  displayName: string,
  now = new Date(),
): AlbumCover {
  const windowOpen = now.getTime() < row.editableUntil.getTime();
  const editable = windowOpen && row.readyAt == null;
  return {
    id: row.id,
    sessionId: row.sessionId,
    userId: row.userId,
    displayName,
    title: row.title,
    gridSize: row.gridSize,
    pixels: row.pixels,
    coverUrl: row.coverUrl,
    editableUntil: toIso(row.editableUntil),
    readyAt: row.readyAt ? toIso(row.readyAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    editable,
  };
}

export function freshAlbumForMember(
  sessionId: string,
  userId: string,
  sessionCreatedAt: Date,
): Omit<StoredAlbum, "id"> & { id?: string } {
  const gridSize = DEFAULT_PIXEL_GRID_SIZE;
  const now = new Date();
  return {
    sessionId,
    userId,
    title: null,
    gridSize,
    pixels: emptyPixelGrid(gridSize),
    coverUrl: null,
    editableUntil: new Date(sessionCreatedAt.getTime() + albumEditWindowMs()),
    readyAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function computeContestPhase(input: {
  memberIds: string[];
  covers: StoredAlbum[];
  contest: StoredAlbumContest | null;
  now?: Date;
}): CoverContestPhase {
  if (input.contest?.winnerUserId) return "resolved";
  const now = input.now ?? new Date();
  const editableUntil =
    input.covers[0]?.editableUntil ??
    new Date(now.getTime() + albumEditWindowMs());
  const windowEnded = now.getTime() >= editableUntil.getTime();
  const allReady =
    input.memberIds.length > 0 &&
    input.memberIds.every((id) =>
      input.covers.some((c) => c.userId === id && c.readyAt != null),
    );
  if (windowEnded || allReady) return "voting";
  return "editing";
}

export function toContestView(
  contest: StoredAlbumContest | null,
  votes: StoredAlbumVote[],
  phase: CoverContestPhase,
): CoverContest {
  return {
    phase,
    votes: votes.map((v) => ({
      voterUserId: v.voterUserId,
      choiceUserId: v.choiceUserId,
    })),
    winnerUserId: contest?.winnerUserId ?? null,
    method: contest?.method ?? null,
    resolvedAt: contest?.resolvedAt ? toIso(contest.resolvedAt) : null,
  };
}

export function resolveCoverWinner(input: {
  memberIds: string[];
  coverUserIds: string[];
  votes: StoredAlbumVote[];
}): { winnerUserId: string; method: "vote" | "spin" } {
  const candidates =
    input.coverUserIds.length > 0 ? input.coverUserIds : input.memberIds;
  if (candidates.length === 0) {
    throw new Error("No cover candidates");
  }

  const choices = input.votes
    .map((v) => v.choiceUserId)
    .filter((id): id is string => id != null && candidates.includes(id));

  const allMembersVoted =
    input.memberIds.length > 0 &&
    input.memberIds.every((id) =>
      input.votes.some((v) => v.voterUserId === id),
    );

  if (allMembersVoted && choices.length === input.memberIds.length) {
    const first = choices[0]!;
    if (choices.every((c) => c === first)) {
      return { winnerUserId: first, method: "vote" };
    }
  }

  const idx = Math.floor(Math.random() * candidates.length);
  return { winnerUserId: candidates[idx]!, method: "spin" };
}

export type CreateBumpInput = {
  userId: string;
  clientTimestamp: Date;
  peakMagnitude: number | null;
  idempotencyKey: string;
  geo: GeoPlace;
  expiresAt: Date;
};

export type StoredBumpProposal = {
  id: string;
  fromBumpId: string;
  toBumpId: string;
  fromUserId: string;
  toUserId: string;
  status: BumpProposalStatus;
  sessionId: string | null;
  createdAt: Date;
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
  tryMatchBump(bumpId: string): Promise<{
    bump: StoredBumpIntent;
    peer: StoredUser | null;
    session: Session | null;
  }>;
  listBumpCandidates(bumpId: string): Promise<BumpCandidate[]>;
  createBumpProposal(
    fromBumpId: string,
    targetBumpId: string,
    fromUserId: string,
  ): Promise<StoredBumpProposal>;
  listPendingBumpProposals(userId: string): Promise<BumpProposal[]>;
  acceptBumpProposal(
    proposalId: string,
    userId: string,
  ): Promise<{
    proposal: StoredBumpProposal;
    bump: StoredBumpIntent;
    peer: PeerSummary;
    session: Session;
  }>;
  rejectBumpProposal(
    proposalId: string,
    userId: string,
  ): Promise<StoredBumpProposal>;
  getSession(id: string): Promise<Session | null>;
  listSessionsForUser(userId: string): Promise<Session[]>;
  confirmSession(sessionId: string, userId: string): Promise<Session | null>;
  updateProfile(userId: string, input: UpdateProfileInput): Promise<StoredUser>;

  listAlbumsForSession(sessionId: string): Promise<StoredAlbum[]>;
  getAlbumForUser(
    sessionId: string,
    userId: string,
  ): Promise<StoredAlbum | null>;
  createAlbumForUser(
    sessionId: string,
    userId: string,
  ): Promise<StoredAlbum>;
  updateAlbumForUser(
    sessionId: string,
    userId: string,
    input: UpdateAlbumInput,
  ): Promise<StoredAlbum | null>;
  markAlbumReady(
    sessionId: string,
    userId: string,
  ): Promise<StoredAlbum | null>;
  getAlbumContest(sessionId: string): Promise<StoredAlbumContest | null>;
  listAlbumVotes(sessionId: string): Promise<StoredAlbumVote[]>;
  upsertAlbumVote(
    sessionId: string,
    voterUserId: string,
    choiceUserId: string | null,
  ): Promise<StoredAlbumVote>;
  setAlbumContestWinner(
    sessionId: string,
    winnerUserId: string,
    method: "vote" | "spin",
  ): Promise<StoredAlbumContest>;

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

export type { ActivityType, Album };
