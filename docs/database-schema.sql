CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  guest BOOLEAN DEFAULT FALSE,
  online_status TEXT DEFAULT 'offline',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rooms (
  id UUID PRIMARY KEY,
  code CHAR(8) UNIQUE NOT NULL,
  host_user_id UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'waiting',
  max_players INT NOT NULL DEFAULT 4,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ
);

CREATE TABLE room_members (
  id UUID PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  seat_number INT NOT NULL,
  ready BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, user_id),
  UNIQUE(room_id, seat_number)
);

CREATE TABLE matches (
  id UUID PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  winner_user_id UUID REFERENCES users(id),
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE game_events (
  id UUID PRIMARY KEY,
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE gifts (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  asset_url TEXT,
  price_coins INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE gift_transactions (
  id UUID PRIMARY KEY,
  sender_user_id UUID REFERENCES users(id),
  recipient_user_id UUID REFERENCES users(id),
  gift_id UUID REFERENCES gifts(id),
  amount_coins INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE friendships (
  id UUID PRIMARY KEY,
  requester_user_id UUID REFERENCES users(id),
  addressee_user_id UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(requester_user_id, addressee_user_id)
);

CREATE TABLE invitations (
  id UUID PRIMARY KEY,
  room_id UUID REFERENCES rooms(id),
  sender_user_id UUID REFERENCES users(id),
  recipient_user_id UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rooms_code ON rooms(code);
CREATE INDEX idx_room_members_room ON room_members(room_id);
CREATE INDEX idx_chat_room_created ON chat_messages(room_id, created_at DESC);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
