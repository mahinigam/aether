# Aether

<p align="center">
  <strong>A real-time chat platform built for scale, designed for calm.</strong>
</p>

<p align="center">
  <em>"Silent at rest. Alive on touch."</em>
</p>

---

## Overview

**Aether** is a real-time chat application built around a horizontally scalable architecture using Socket.io, Redis Pub/Sub, PostgreSQL, and NGINX. The original design records 10,000+ concurrent WebSocket connections as a capacity objective; this repository does not currently include a reproducible benchmark demonstrating that capacity.

The UI follows the **Obsidian Chrome** design system — a monochrome, performance-first aesthetic that prioritizes restraint over visual noise.

---

## Table of Contents

- [Features](#features)
- [Design System: Obsidian Chrome](#design-system-obsidian-chrome)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Local Development](#local-development)
- [Testing and Verification](#testing-and-verification)
- [API Reference](#api-reference)
- [Performance](#performance)
- [Security](#security)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### Core Messaging
| Feature | Description |
|---------|-------------|
| **Real-Time Messaging** | Real-time delivery implemented with Socket.io + Redis Pub/Sub; latency has not been benchmarked in a retained report |
| **Message Receipts** | Sent → Delivered → Read status indicators |
| **Offline Support** | Messages queued and delivered on reconnection |
| **Typing Indicators** | Debounced "User is typing..." with auto-stop |
| **Message Reactions** | Emoji reactions with real-time sync |

### Voice & Video
| Feature | Implementation Details |
|---------|-------------|
| **Mesh Calling** | Client-limited Mesh topology supporting up to 5 concurrent peers. |
| **Video & Voice** | HD streaming via reliable WebRTC transport. |
| **Screen Share** | Video-only track replacement negotiated via re-offers. |
| **Privacy** | Hardware-level track stop on mute/camera-off. |
| **Logs** | Persistent PostgreSQL logs for missed, rejected, and completed calls. |

### Rich Media
| Feature | Implementation |
|---------|-------------|
| **Orbit Search** | Hybrid search resolving Spotify metadata to YouTube audio streams. |
| **Voice Messages** | MediaRecorder API with real-time waveform visualization. |
| **Polls** | Real-time votable entities synchronized via Redis Pub/Sub. |
| **GIFs** | Giphy API integration with lazy-loaded grid. |
| **Location** | OpenStreetMap integration for coordinate sharing. |
| **File Uploads** | Multipart uploads with support for images, video, and documents. |

### User Controls
| Feature | Description |
|---------|-------------|
| **Block Users** | Block users in DMs to prevent messaging |
| **Mute Rooms** | Mute notifications for specific rooms |
| **Mute Users** | Mute notifications from specific users |
| **Blocked/Muted Lists** | Manage blocked and muted users from settings |
| **Chat Lock** | Lock individual chats with password protection (3-attempt limit + cooldown) |
| **Device Management** | View and revoke active sessions across devices |

### Identity & Profile
| Feature | Description |
|---------|-------------|
| **Display Names** | Set a custom display name separate from your unique username |
| **Unique Usernames** | Strict database-level enforcement of unique handles |
| **Profile Management** | Update avatar, bio, and personal details via "My Details" |

### Advanced Engineering
| Feature | Description |
|---------|-------------|
| **Horizontal Scaling** | Multiple server instances synchronized via Redis Adapter |
| **Optimistic UI** | Messages appear instantly before server confirmation |
| **Cursor Pagination** | Infinite scroll with stable message ordering |
| **Thundering Herd Protection** | Exponential backoff + jitter for mass reconnections |
| **Graceful Shutdown** | Clean connection draining on deployment |

---

## Design System: Obsidian Chrome

Aether's UI follows the **Obsidian Chrome** design philosophy, which emphasizes:

### Core Principles

1.  **Monochrome Void**
    -   Pure black and gray palette (`mono-*` tokens).
    -   No accent colors except for semantic purposes (Red = Destructive, Green = Online).
    -   The interface disappears so conversations stand out.

2.  **Physical Interactions**
    -   Buttons (`ChromeButton`) feel heavy and deliberate.
    -   No bounce, no glow abuse. Interactions use subtle shadows and opacity shifts.
    -   State changes are driven by user action, not time.

3.  **Zero-Cost Idle**
    -   Near-zero GPU usage when the user is not interacting.
    -   No infinite animations (`animate-pulse`, `repeat: Infinity`).
    -   Canvas/particle effects halt completely after 3 seconds of inactivity.

### Component Library

| Component | Purpose |
|-----------|---------|
| `ChromeButton` | Primary button with metallic rim and pressure-like active state |
| `GlassPanel` | Container with subtle borders and shadow |
| `Modal` | Focus-trapped dialog with smooth scale transition |
| `Toast` | Non-blocking notifications |
| `AetherLogo` | Brand logo with hover-triggered distortion effect |
| `AetherIntro` | Cinematic intro animation (see below) |

### Signature Intro Animation

Aether features a **7-second cinematic intro** inspired by Arcane/Valorant aesthetics:

| Stage | Duration | Effect |
|-------|----------|--------|
| **Void** | 2.5s | White logo fades in on pure black |
| **Corruption** | 1.9s | RGB split, glitch slices, particles + gradual color reveal |
| **Revealed** | 1.1s | Logo pauses in final form |
| **Zoom** | 1.5s | Smooth zoom-fade transition to app |

**Implementation:**
- Pure CSS & Framer Motion (No heavy JS libraries).
- Session storage logic ensures it runs only once per session.
- Precomputed keyframes for performance optimization.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                           NGINX                                 │
│                     (Load Balancer + Sticky Sessions)           │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│  Backend #1   │       │  Backend #2   │       │  Backend #N   │
│  (Socket.io)  │◄─────►│  (Socket.io)  │◄─────►│  (Socket.io)  │
└───────┬───────┘       └───────┬───────┘       └───────┬───────┘
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                │ Redis Pub/Sub
                                ▼
                        ┌───────────────┐
                        │     Redis     │
                        │ (Session/Pub) │
                        └───────────────┘
                                │
                                ▼
                        ┌───────────────┐
                        │  PostgreSQL   │
                        │  (Messages)   │
                        └───────────────┘
```

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Tailwind CSS, Framer Motion |
| **Backend** | Node.js, Express, Socket.io, TypeScript |
| **Database** | PostgreSQL (write-optimized schema) |
| **Cache/Broker** | Redis (Cluster-ready) |
| **Load Balancer** | NGINX (sticky sessions for WebSocket) |
| **Orchestration** | Docker Compose |

---

## Project Structure

```
aether/
├── backend/
│   ├── src/
│   │   ├── config/           # Database & Redis setup
│   │   ├── middleware/       # Auth, rate limiting
│   │   ├── repositories/     # Data access layer
│   │   ├── routes/           # REST API endpoints
│   │   ├── socket/           # WebSocket handlers
│   │   └── index.ts          # Server entrypoint
│   ├── Dockerfile
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/       # UI components (Obsidian Chrome)
│   │   ├── pages/            # Login, Register, Home
│   │   ├── services/         # Socket client, API calls
│   │   ├── styles/           # Design tokens, global CSS
│   │   └── App.tsx
│   ├── Dockerfile
│   └── package.json
│
├── database/
│   └── schema.sql            # PostgreSQL schema
│
├── nginx/
│   └── nginx.conf            # Load balancer config
│
├── docker-compose.yml
├── ARCHITECTURE.md
└── README.md
```

---

## Getting Started

### Prerequisites

-   Docker & Docker Compose
-   Node.js 18+ (for local development)

### Run with Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/mahinigam/aether.git
cd aether

# Create local secrets/config (never commit the resulting .env file)
cp .env.example .env
openssl rand -hex 32   # copy the output into JWT_SECRET in .env
sh scripts/generate-dev-cert.sh

# Start the local stack (single backend by default)
docker compose up -d
# For a multi-backend experiment, scale only after validating DB pool limits:
docker compose up -d --scale backend=4

# Access
# Frontend: http://localhost
# Backend:  http://localhost:3000
```

### Stop Services

```bash
docker-compose down       # Stop
docker-compose down -v    # Stop and remove volumes
```

---

## Local Development

### Backend

```bash
cd backend
npm install
npm run dev   # Runs on port 3000
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # Runs on port 5173
```

### Database

```bash
psql -h localhost -U postgres -d chat_platform
\i database/schema.sql
```

---

## Testing and Verification

The repository currently includes 19 backend unit-test files, 3 backend integration-test files, and 4 frontend test files.

Run the suites locally:

```bash
cd backend
npm install
npm test

cd ../frontend
npm install
npm test
```

The `.github/workflows/verification.yml` workflow runs the backend and frontend test suites and their production builds on GitHub Actions, plus a tracked-asset provenance check and SPDX dependency SBOM generation. Each job uploads a `verification-results` artifact containing the command output logs. Open the repository's **Actions** tab, select a verification run, and download the artifact.

A passing CI run is evidence that the checked-in test suites and builds passed in that CI environment. It is not evidence of a 10,000-connection capacity test, a production deployment review, or an external security assessment. See [asset provenance](docs/ASSET_PROVENANCE.md) and the [WebSocket capacity test guide](docs/WEBSOCKET_CAPACITY_TEST.md).

---

## API Reference

### WebSocket Events

| Direction | Event | Description |
|-----------|-------|-------------|
| **Client → Server** | `message:send` | Send a new message |
| | `message:delivered` | Mark as delivered |
| | `message:read` | Mark as read |
| | `typing:start` | User started typing |
| | `typing:stop` | User stopped typing |
| **Server → Client** | `message:new` | New message received |
| | `message:status` | Status update |
| | `typing:start` | Someone is typing |
| | `presence:change` | Online/offline status |

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register new user |
| `POST` | `/api/auth/login` | Login |
| `GET` | `/api/rooms` | Get user's rooms |
| `POST` | `/api/rooms` | Create new room |
| `GET` | `/api/messages/room/:id` | Get messages (cursor pagination) |

---

## Performance

Aether includes performance-oriented implementation choices. The figures below are historical project notes, not a newly generated Lighthouse report. No timestamped Lighthouse report is currently retained in this repository; reproduce the build and audit before treating the figures as verified.

### Performance-related implementation notes

| Optimization | Technique | Impact |
|-------------|-----------|--------|
| **Code Splitting** | `React.lazy()` for pages & heavy components | Implemented; current bundle sizes should be regenerated and archived |
| **Lazy Loading** | Deferred loading of GifPicker, LocationPicker, OrbitSearch, ChatSearch | Only loads when user accesses feature |
| **Skeleton Screens** | `MessageListSkeleton` during page transitions | Improved perceived load time |
| **Preconnect Hints** | `<link rel="preconnect">` for Giphy, Spotify, YouTube APIs | Faster third-party asset loading |
| **Static Assets** | Production build with minification | Minified output; current output sizes should be regenerated and archived |

### Historical bundle analysis notes

The following figures were recorded in earlier project notes. They are not a current build artifact and have not been independently reproduced as part of this repository update.

```
index.js         299 KB (main bundle)
Home.js          565 KB (lazy-loaded)
GifPicker.js     102 KB (lazy-loaded)
ChatSearch.js      4 KB (lazy-loaded)
OrbitSearch.js     6 KB (lazy-loaded)
```

### Hybrid Search Architecture

Aether implements a fail-safe hybrid search strategy to ensure availability:

| Layer | Technology | Role |
|-------|------------|---------|
| **Primary** | **Elasticsearch** | Handles high-throughput fuzzy matching and ngram tokenization. |
| **Fallback** | **PostgreSQL (ILIKE)** | Activates automatically if ES is unreachable. |
| **Sync** | **Real-time Indexing** | Messages are indexed asynchronously upon creation. |

**Capabilities:**
- **Fuzzy Matching**: Tolerates typos and partial queries (e.g., `"devlop"` matches `"developer"`).
- **Filters**: Supports `from:user`, `before:date`, and `after:date` syntax.
- **Privacy**: Global search respects room membership boundaries.

### Theme Performance (Obsidian Chrome)

| Principle | Implementation | Evidence status |
|-----------|----------------|------------|
| No continuous animations | Removed `animate-pulse`, `repeat: Infinity` | Intended to reduce idle work; no profiler result archived |
| State-driven motion only | Animations trigger on hover/interaction | Interaction-driven design; not quantitatively profiled in a retained report |
| Canvas particle halt | Stops after 3s of inactivity | Intended to stop particle work after inactivity; no GPU measurement archived |

### Capacity planning estimates (not benchmark results)

> **Measurement status:** The values below are illustrative estimates from the original design notes. The repository includes load-test definitions, but no retained run report demonstrating these throughput, memory, or connection figures. Treat them as hypotheses to validate, not measured capacity.

| Metric | Single-instance estimate | Four-instance estimate (via Redis Adapter) |
|--------|-----------------|----------------------------------|
| Concurrent WebSocket Connections | ~2,500 | **10,000+** |
| Messages/Second | ~1,000 | ~4,000 |
| RAM Usage | ~512MB | ~2GB |

---

## Security

-   **Authentication**: JWT (access + refresh tokens)
-   **Rate Limiting**: Per-IP and per-user limits
-   **Input Validation**: Joi schemas
-   **SQL Injection**: Parameterized queries only
-   **Headers**: Helmet.js security headers
-   **CORS**: Strict origin whitelist

---

## Deployment

### Production Checklist

- [ ] Generate new `JWT_SECRET`
- [ ] Set `NODE_ENV=production`
- [ ] Configure PostgreSQL backups
- [ ] Enable Redis persistence (AOF + RDB)
- [ ] Set up SSL/TLS via NGINX
- [ ] Configure monitoring (Prometheus + Grafana)
- [ ] Set up log aggregation

### Cloud Platforms

| AWS | GCP |
|-----|-----|
| ECS for containers | GKE for Kubernetes |
| RDS for PostgreSQL | Cloud SQL |
| ElastiCache for Redis | Memorystore |
| ALB for load balancing | Cloud Load Balancing |

---

## Contributing

1.  Fork the repository
2.  Create a feature branch (`git checkout -b feature/amazing-feature`)
3.  Commit your changes
4.  Push to the branch
5.  Open a Pull Request

---

## License

**No open-source licence is currently granted for Aether's original project materials.** The original source code, documentation, and designs are reserved to their rights holder unless a separate written licence says otherwise. See [LICENSE](./LICENSE) for the project rights notice. Third-party dependencies and external assets remain subject to their respective licences and terms.

---

<p align="center">
  <strong>Built for performance. Designed for peace.</strong>
</p>
