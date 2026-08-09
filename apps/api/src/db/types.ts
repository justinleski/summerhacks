import type {
  ActivityNotification,
  ActivityType,
  BumpStatus,
  CalendarEvent,
  EventComment,
  EventDetail,
  FriendListEntry,
  FriendRequest,
  FriendRequestStatus,
  FriendSummary,
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
  friends: FriendListEntry[];
};

export type CreateEventPhotoInput = {
  eventId: string;
  photoUrl: string;
};

export type StoredEventPhoto = {
  id: string;
  eventId: string;
  photoUrl: string;
  createdAt: Date;
};

export type CreateCheckinInput = {
  userId: string;
  lat: number;
  lng: number;
  /** Free-text, user-authored — stored on the checkin itself for map/popup display. */
  region: string;
  /** IP-derived (geoFromRequest), used only for the connections tally row — keeps region
   * bucketing consistent with friend_add/event_join, independent of what the user typed. */
  connectionRegion: string;
  photoUrl: string | null;
  caption: string | null;
};

export type StoredCheckin = {
  id: string;
  userId: string;
  lat: number;
  lng: number;
  region: string | null;
  photoUrl: string | null;
  caption: string | null;
  createdAt: Date;
};

export type StoredFriendCheckin = StoredCheckin & {
  ownerDisplayName: string;
  ownerAvatarUrl: string | null;
};

export type InboxFriendRequest = FriendRequest & {
  fromUser: FriendSummary;
};

export type TallyRegionCount = {
  region: string;
  checkin: number;
  friendAdd: number;
  eventJoin: number;
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
    region: string,
  ): Promise<StoredFriendRequest>;
  rejectFriendRequest(
    userId: string,
    requestId: string,
  ): Promise<StoredFriendRequest>;
  unfriend(userId: string, otherUserId: string): Promise<boolean>;
  setFriendshipWatchlist(
    userId: string,
    friendId: string,
    isWatchlisted: boolean,
  ): Promise<boolean>;

  // Calendar / events
  createEvent(input: CreateEventInput): Promise<CalendarEvent>;
  listCalendar(userId: string): Promise<CalendarEvent[]>;
  getEventDetail(userId: string, eventId: string): Promise<EventDetail | null>;
  rsvpEvent(
    userId: string,
    eventId: string,
    status: RsvpStatus,
    region: string,
  ): Promise<EventDetail | null>;
  addEventComment(
    userId: string,
    eventId: string,
    body: string,
  ): Promise<EventComment>;
  addEventPhoto(input: CreateEventPhotoInput): Promise<StoredEventPhoto>;
  listEventPhotos(eventId: string): Promise<StoredEventPhoto[]>;
  listActivity(userId: string): Promise<ActivityNotification[]>;
  markActivityRead(
    userId: string,
    notificationId: string,
  ): Promise<ActivityNotification | null>;
  markAllActivityRead(userId: string): Promise<number>;

  // Checkins
  createCheckin(input: CreateCheckinInput): Promise<StoredCheckin>;
  listCheckinsForUser(userId: string): Promise<StoredCheckin[]>;
  /** Friends' check-ins, excluding pairs where friendships.is_watchlisted = true. */
  listFriendCheckins(userId: string): Promise<StoredFriendCheckin[]>;
  /** A single friend's check-ins; null if the two users aren't friends. */
  listCheckinsForFriend(
    userId: string,
    friendId: string,
  ): Promise<StoredCheckin[] | null>;

  /** Public, unauthenticated aggregate — per-region connection counts, last TALLY_WINDOW_DAYS days. */
  getTally(): Promise<TallyRegionCount[]>;
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
