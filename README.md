# Ludo Android / iOS Multiplayer Game App

This workspace contains an in-progress Flutter + Socket.IO Ludo application inspired by the referenced Flutter project at https://github.com/Apoorv-cloud/Flutter_Ludo.git. It now has a PostgreSQL-backed guest-session and room foundation, but still needs publisher configuration, deployed-host verification, account-grade authentication, and complete rules QA before public production use.

## Included projects
- `mobile/` — Flutter app scaffold for the Android/iOS client
- `server/` — Node.js + TypeScript + Socket.IO server for room management and multiplayer event foundations
- `docs/` — architecture and database schema documents

## Implemented
- Flutter Android/iOS lobby and board screens
- Socket.IO private-room create/join, bounded text chat, presence snapshots, and host-start flow
- Server-controlled color routes, safe lanes, captures, exact home entry, and three-sixes rule
- PostgreSQL migrations, opaque guest sessions, reconnect seat recovery, room/chat persistence
- Per-IP/socket event limits, chat moderation hooks, health and Prometheus-format metrics
- Automated room/game, PostgreSQL, and live Socket.IO tests

## Quick start

Backend
```bash
cd server
npm install
cp .env.example .env
npm run dev
```

The server requires PostgreSQL. Set `DATABASE_URL` in `server/.env`; the first server startup applies `server/migrations/001_initial.sql`. Production startup requires `NODE_ENV=production`, `DATABASE_URL`, and HTTPS origins in `CLIENT_ORIGIN`.

Container deployment
```bash
cp .env.example .env
docker compose up --build -d
```

Set a unique `POSTGRES_PASSWORD` and the public HTTPS `CLIENT_ORIGIN` in the root `.env` before deployment. Put the Compose service behind a TLS-terminating reverse proxy; do not expose the database port publicly. Back up the Postgres volume.

Flutter app
```bash
cd mobile
flutter pub get
flutter run --dart-define=LUDO_SERVER_URL=http://10.0.2.2:4000
```

Android debug/profile builds permit the local emulator URL shown above. Physical devices need a reachable development server. Release builds require `--dart-define=LUDO_SERVER_URL=https://your-server.example`.

For iOS, set `LUDO_BUNDLE_IDENTIFIER` and `DEVELOPMENT_TEAM` in the ignored `mobile/ios/Flutter/Publisher.xcconfig`. Android release builds require publisher-owned `LUDO_APPLICATION_ID` plus `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`; these must be supplied through a secure build environment, never committed.

Tests
```bash
cd server
npm test
```

Set `TEST_DATABASE_URL` to a disposable PostgreSQL database to include the real migration/persistence integration test. CI runs that test with a temporary Postgres service. `/health` checks database readiness; `/metrics` exposes low-cardinality Prometheus counters.

## Notes
`server/migrations/` is the active schema for guest sessions, rooms, and chat. `docs/database-schema.sql` remains a broader future design draft. The current guest identity is not email/account authentication, and the app should not be treated as a finished commercial game.
