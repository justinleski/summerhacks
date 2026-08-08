import type {
  BumpStatus,
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

export interface Store {
  bootstrapUser(input: {
    displayName: string;
    deviceId?: string;
  }): Promise<StoredUser>;
  getUser(id: string): Promise<StoredUser | null>;
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
}

export function toIso(d: Date): string {
  return d.toISOString();
}
