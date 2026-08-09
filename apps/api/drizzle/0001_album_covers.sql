-- Per-member album covers + vote/spin contest.
-- Apply with: npm run db:push -w @summerhacks/api
-- Or run this manually on Neon if push can't rewrite the unique index.

ALTER TABLE albums ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS ready_at timestamptz;

-- Drop legacy joint rows (no owner) — recreate per user from the app.
DELETE FROM albums WHERE user_id IS NULL;

ALTER TABLE albums ALTER COLUMN user_id SET NOT NULL;

DROP INDEX IF EXISTS albums_session_id_idx;
CREATE UNIQUE INDEX IF NOT EXISTS albums_session_user_idx ON albums (session_id, user_id);

CREATE TABLE IF NOT EXISTS album_contests (
  session_id uuid PRIMARY KEY REFERENCES sessions (id) ON DELETE CASCADE,
  winner_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  method text,
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS album_votes (
  session_id uuid NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  voter_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  choice_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (session_id, voter_user_id)
);
