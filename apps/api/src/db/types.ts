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
