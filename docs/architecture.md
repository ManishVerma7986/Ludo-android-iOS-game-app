# Multiplayer Ludo Architecture

## Overview
The application is split into two main layers:

1. Flutter client for the Android/iOS experience.
2. Node.js + Socket.IO service for secure multiplayer room management and authoritative game state events.

## Current Client Layer
- Flutter Android/iOS client with display-name and room-code entry
- Socket.IO room lobby and game screen
- Room snapshots drive player, token, dice, and turn state
- Room chat supports bounded text history
- Configure `LUDO_SERVER_URL` with `--dart-define`; release builds require HTTPS

## Current Server Layer
- Node.js/TypeScript Socket.IO service with an Express health endpoint
- Opaque random guest sessions, hashed at rest and recovered from the mobile secure store
- Socket-bound room membership, host-only game start, server-validated turns, and reconnect seat recovery
- RoomManager service for 8-digit room codes, capacity, and game lifecycle
- PostgreSQL storage and versioned migrations for guest sessions, room snapshots, and bounded chat history
- A single authoritative server process is required today; PostgreSQL persistence does not yet provide cross-instance room locking or pub/sub synchronization
- Per-IP and per-socket connection/event limits, configurable chat moderation, readiness health, and Prometheus-format counters

## Database Design
`server/migrations/001_initial.sql` is the active schema for users, sessions, room snapshots, and room messages. The broader `database-schema.sql` is still a future proposal and is not migrated. The production server requires `DATABASE_URL` and applies numbered migrations on startup. The first migration includes:

- users
- rooms
- room_members
- room sessions and snapshots
- persisted room chat

See `database-schema.sql` for the initial SQL foundation.

## Security And Limitations
- Socket payloads are validated, room actions use the connected socket identity, and socket event rates are bounded per connection
- Room codes use cryptographic randomness; chat messages are limited to 100 in-memory entries per room
- Guest sessions are not account-grade authentication; there is no email/password, OAuth, recovery, or moderation dashboard
- Rate limits are in-memory and per observed IP/socket; deploy behind a trusted proxy with edge-level abuse controls
- The current rules engine and board representation are incomplete; this project is not production-ready

## Deployment And Operations
- `docker-compose.yml` runs the server and PostgreSQL; terminate TLS at a reverse proxy and do not publish the database port
- `server/Dockerfile` uses a non-root Node runtime image with health checks
- `.github/workflows/ci.yml` runs Node/Postgres integration tests, npm audit, Flutter tests/analyzer, and the container build
- `/health` reports readiness including PostgreSQL; `/metrics` exposes basic Prometheus counters
- The mobile app ID, Apple bundle ID/team, and Android keystore are publisher-owned inputs and are never committed

## Dev Workflow
- Run the backend with `npm run dev` in `server/`
- Run the Flutter app with `flutter run` in `mobile/`
- Use `npm test` in `server/` to validate room behavior
