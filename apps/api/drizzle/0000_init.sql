-- Generated for Neon / Postgres. Apply with: npm run db:push -w @summerhacks/api

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  avatar_url text,
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_device_id_idx ON users (device_id);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_via text NOT NULL DEFAULT 'bump',
  status text NOT NULL DEFAULT 'pending_confirm',
  payload jsonb NOT NULL DEFAULT '{"profiles":[]}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session_members (
  session_id uuid NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS bump_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  client_timestamp timestamptz NOT NULL,
  server_timestamp timestamptz NOT NULL DEFAULT now(),
  ip text NOT NULL,
  geo_city text,
  geo_region text,
  geo_country text,
  geo_lat double precision,
  geo_lng double precision,
  peak_magnitude double precision,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  matched_bump_id uuid,
  session_id uuid REFERENCES sessions (id),
  expires_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS bump_intents_user_idempotency_idx
  ON bump_intents (user_id, idempotency_key);
