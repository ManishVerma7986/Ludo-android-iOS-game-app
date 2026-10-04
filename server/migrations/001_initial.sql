CREATE TABLE game_users (
  id uuid PRIMARY KEY,
  display_name varchar(18) NOT NULL,
  guest boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES game_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_sessions_user_id_idx ON user_sessions(user_id);
CREATE INDEX user_sessions_expires_at_idx ON user_sessions(expires_at);

CREATE TABLE game_rooms (
  room_code char(8) PRIMARY KEY CHECK (room_code ~ '^[0-9]{8}$'),
  host_user_id uuid NOT NULL REFERENCES game_users(id),
  state jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX game_rooms_expires_at_idx ON game_rooms(expires_at);

CREATE TABLE room_messages (
  id uuid PRIMARY KEY,
  room_code char(8) NOT NULL REFERENCES game_rooms(room_code) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES game_users(id),
  sender_name varchar(18) NOT NULL,
  body varchar(280) NOT NULL CHECK (length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX room_messages_created_idx ON room_messages(room_code, created_at DESC);