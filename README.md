# Aether

<p align="center">
  <strong>A real-time chat platform built for scale, designed for calm.</strong>
</p>

<p align="center">
  <em>"Silent at rest. Alive on touch."</em>
</p>

---

## Overview

**Aether** is a high-performance, real-time communication platform built on Node.js, TypeScript, React, Socket.IO, Redis Pub/Sub, PostgreSQL, and NGINX.

The platform is engineered for verifiable scalability: stateful client connections are cleanly decoupled from transactional persistence using a distributed Redis Pub/Sub adapter, enabling seamless horizontal backend scaling.

> [!IMPORTANT]
> **Performance Transparency**: This repository provides empirical, reproducible benchmark harnesses with timestamped JSON evidence. The local stack has verified **100 concurrent WebSocket connections** (< 30ms p50 handshake latency) and **100% message fan-out delivery** (48.6ms p50 end-to-end latency). A 10,000+ concurrent connection capacity remains an architectural design target requiring a multi-node staging cluster (see [Performance Testing Guide](docs/PERFORMANCE_TESTING.md)).

The UI follows the **Obsidian Chrome** design system — a monochrome, performance-first aesthetic that prioritizes restraint over visual noise.

---

## Documentation Index

| Document | Purpose |
|---|---|
| [Architecture Guide](docs/ARCHITECTURE.md) | Component architecture, Mermaid diagrams, scaling strategy, and data model. |
| [Security Posture](docs/SECURITY.md) | Authentication, authorization, rate limiting, and supply-chain security. |
| [Performance Testing Guide](docs/PERFORMANCE_TESTING.md) | Verified local benchmarks, latency percentiles, and 10k cluster execution guide. |
| [Deployment Guide](docs/DEPLOYMENT.md) | Clean local setup, Docker Compose profiles, and Kubernetes manifests. |
| [Asset Provenance Audit](docs/ASSET_PROVENANCE.md) | Tracked media inventory, licenses, and external API terms. |
| [Git History Purge Runbook](docs/GIT_HISTORY_PURGE_PROCEDURE.md) | Protocol for credential rotation and historical commit rewriting. |
| [Known Limitations](docs/KNOWN_LIMITATIONS.md) | Technical boundaries, WebRTC Mesh limits, and storage considerations. |
| [Release Checklist](docs/RELEASE_CHECKLIST.md) | Production release gate checklist. |

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Testing & Quality Verification](#testing--quality-verification)
- [Verified Performance Evidence](#verified-performance-evidence)
- [Security & Compliance](#security--compliance)
- [Deployment](#deployment)
- [License](#license)

---

## Features

### Core Messaging
| Feature | Implementation | Evidence Status |
|---|---|---|
| **Real-Time Messaging** | Socket.IO + Redis Pub/Sub adapter | **VERIFIED**: 100% delivery receipt, 48.6ms p50 transit |
| **Delivery Receipts** | Sent → Delivered → Read timestamps | **VERIFIED**: Automated delivery receipt callbacks |
| **Offline Delivery** | Queued in Redis / PostgreSQL on reconnect | Implemented in `presenceHandler.ts` |
| **Typing Indicators** | Debounced with automatic Redis expiration | Implemented in `typingHandler.ts` |
| **Message Reactions** | Real-time emoji toggling and synchronization | Implemented in `reactionHandler.ts` |

### Voice & Video
| Feature | Implementation | Scope & Limits |
|---|---|---|
| **Mesh Calling** | WebRTC full-mesh peer topology | Up to 5 concurrent participants |
| **Audio & Video** | Native WebRTC media tracks | Hardware stop on mute |
| **Screen Sharing** | Renegotiated video track replacement | Supported on desktop browsers |
| **Call Audit Logs** | Persistent PostgreSQL logs | Missed, rejected, and completed call history |

### Security & Privacy
| Feature | Implementation | Audit Status |
|---|---|---|
| **End-to-End Encryption** | X3DH key exchange & double-ratchet model | Ciphertext stored; excluded from search index |
| **Per-User Chat Lock** | Client PIN / biometric unlock | Implemented with database flag |
| **Granular Rate Limiting** | Redis sliding window limiters | Auth, message, upload, and search limiters |
| **Secret Detection** | Automated Gitleaks CI scanning | Zero leaks detected across git history |

---

## Architecture

```mermaid
flowchart TD
    Client["Web / Mobile Client<br/>(React / Socket.IO Client)"]
    Nginx["NGINX Edge Load Balancer<br/>(SSL Termination & WebSocket Sticky Sessions)"]
    Backend["Aether Backend Replicas<br/>(Node 22 / Express / Socket.IO)"]
    Redis["Redis 7<br/>(Socket.IO Pub/Sub Adapter & Ephemeral State)"]
    Postgres[("PostgreSQL 15<br/>(Transactional Relational Datastore)")]
    ES[("Elasticsearch 8<br/>(Fuzzy Full-Text Search - Optional Profile)")]

    Client -->|TLS 1.2 / 1.3| Nginx
    Nginx -->|ip_hash / Proxy Pass| Backend
    Backend <-->|Cluster Pub/Sub| Redis
    Backend -->|Parameterized SQL| Postgres
    Backend -.->|Async Non-Blocking| ES
```

Full architecture specifications and sequence diagrams are detailed in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Project Structure

```
aether/
├── backend/
│   ├── migrations/          # PostgreSQL schema migrations (node-pg-migrate)
│   ├── src/
│   │   ├── config/          # Database, Redis, Elasticsearch clients
│   │   ├── middleware/      # JWT auth, rate limiting, file upload guards
│   │   ├── repositories/    # Database data access layer
│   │   ├── routes/          # Express REST API controllers
│   │   ├── socket/          # Socket.IO connection & event handlers
│   │   └── index.ts         # Application entrypoint & HTTP server
│   ├── tests/               # Unit and integration test suites
│   ├── Dockerfile           # Multi-stage unprivileged production image
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/      # UI components (Obsidian Chrome aesthetic)
│   │   ├── pages/           # Login, Register, Home chat view
│   │   ├── services/        # Socket.IO client, API services, WebRTC
│   │   └── App.tsx
│   ├── Dockerfile           # Multi-stage NGINX SPA container
│   └── package.json
│
├── database/
│   ├── schema.sql           # Base PostgreSQL schema
│   └── migrations/          # Supplemental SQL migration files
│
├── nginx/
│   ├── certs/               # Local development TLS certificates (git-ignored)
│   └── nginx.conf           # Reverse proxy, SSL, and load balancing config
│
├── k8s/                     # Production Kubernetes manifests & HPA
├── scripts/
│   ├── audit-assets.mjs     # Automated media and asset provenance auditor
│   ├── generate-dev-cert.sh # Reproducible local TLS certificate generator
│   ├── message-benchmark.cjs # Real-time message throughput benchmark harness
│   └── websocket-capacity-test.cjs # Socket.IO connection capacity harness
│
├── docs/                    # Technical architecture, security, and benchmark docs
├── docker-compose.yml       # Production-aligned local orchestration
└── package.json             # Root scripts and supply-chain lockfile
```

---

## Quick Start

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v22 LTS or newer
- [Docker Desktop](https://www.docker.com/) 4.28+ with Compose v2
- [OpenSSL](https://www.openssl.org/)

### 2. Setup & Execution from Clean Checkout

```bash
# 1. Clone the repository
git clone https://github.com/mahinigam/aether.git
cd aether

# 2. Install dependencies across workspace
npm ci
cd backend && npm ci && cd ..
cd frontend && npm ci && cd ..

# 3. Generate local development secrets and TLS certificates
cp .env.example .env
sed -i.bak "s/replace-with-a-random-64-character-hex-secret/$(openssl rand -hex 32)/" .env && rm .env.bak
./scripts/generate-dev-cert.sh

# 4. Start the stack
docker compose up -d

# 5. Run database migrations
cd backend
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/chat_platform" npm run migrate
cd ..

# 6. Seed default room
docker compose exec backend node seed_room.js
```

### 3. Verification & Access
- **Application Frontend**: `http://localhost:80`
- **Secure Reverse Proxy & WebSocket**: `https://localhost:443`
- **Health Endpoint**: `curl -k https://localhost:443/health`

To shut down cleanly without losing database volumes:
```bash
docker compose down
```

---

## Testing & Quality Verification

All tests run locally and in GitHub Actions CI:

```bash
# Run linting across backend and frontend (0 errors)
npm run lint

# Run TypeScript typechecks across backend and frontend (0 errors)
npm run typecheck

# Run automated tests
cd backend && npm test
cd ../frontend && npm test

# Audit asset provenance registry
npm run audit:assets

# Run local secret scan with Gitleaks
docker run --rm -v "$(pwd):/repo" zricethezav/gitleaks:latest detect --source="/repo" --verbose
```

---

## Verified Performance Evidence

All performance metrics below are direct outputs from reproducible test executions on an **Apple Silicon M4 MacBook Air (16 GB RAM)**:

### 1. WebSocket Connection Capacity (`scripts/websocket-capacity-test.cjs`)
- **10 Connections**: 10/10 successful (100%), 0 disconnects, **29.5ms** p50 latency. [Report](artifacts/websocket-capacity-report.json)
- **50 Connections**: 50/50 successful (100%), 0 disconnects, **29.8ms** p50 latency. [Report](artifacts/websocket-capacity-50.json)
- **100 Connections**: 100/100 successful (100%), 0 disconnects, **29.8ms** p50 latency. [Report](artifacts/websocket-capacity-100.json)

### 2. Message Throughput & Delivery Fan-Out (`scripts/message-benchmark.cjs`)
- **Sender Throughput**: **5.10 messages / sec** (stable pacing honoring per-user rate limit).
- **Room Fan-Out Rate**: **25.52 delivered events / sec** (5 active listeners in room).
- **Delivery Success Rate**: **100.0% (125 / 125 messages delivered)**.
- **Server ACK Latency**: min 47.1ms | **p50 49.0ms** | p95 76.6ms | max 100.9ms.
- **End-to-End Transit Latency**: min 46.5ms | **p50 48.6ms** | p95 76.4ms | max 100.7ms.
- **Message Integrity**: **0 out-of-order events**, **0 duplicate messages**. [Report](artifacts/message-benchmark-report.json)

To execute the benchmarks yourself:
```bash
# Run WebSocket connection capacity test (100 connections)
TARGET_URL="https://localhost:443" JWT_SECRET="<your-secret>" MAX_CONNECTIONS=100 npm run load:socketio

# Run real-time message throughput and fan-out benchmark
TARGET_URL="https://localhost:443" JWT_SECRET="<your-secret>" npm run benchmark:messages
```

For the 10,000-connection staging cluster runbook, refer to [docs/PERFORMANCE_TESTING.md](docs/PERFORMANCE_TESTING.md).

---

## Security & Compliance

- **Zero Committed Secrets**: Strict `.env` isolation; `.gitleaksignore` tracks historical commits documented in [docs/GIT_HISTORY_PURGE_PROCEDURE.md](docs/GIT_HISTORY_PURGE_PROCEDURE.md).
- **Least Privilege Execution**: Backend container runs as unprivileged user `node` with compiler tools purged from the runtime layer.
- **Parameterized SQL**: All database operations use bind parameters; zero SQL concatenation.
- **Supply Chain SBOM**: Automated CycloneDX SBOM generation on every commit with 90-day retention.
- **Strict Peer Dependencies**: Zero npm peer dependency conflicts across the workspace.

---

## Deployment

Aether includes production Kubernetes manifests under `k8s/` featuring:
- Rolling update deployments with zero downtime.
- HorizontalPodAutoscaler (HPA) scaling pods between 3 and 10 based on CPU/memory pressure.
- NGINX Ingress Controller with WebSocket timeout tuning (`proxy-read-timeout: 3600`).
- Persistent volume claims for user uploads.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for full instructions.

---

## License

**No open-source license is currently granted for Aether's original project materials.** The original source code, documentation, and designs are reserved to their rights holder unless a separate written license is provided. See [LICENSE](./LICENSE) for the project rights notice. Third-party dependencies and external assets remain subject to their respective licenses and terms.

---

<p align="center">
  <strong>Built for performance. Designed for peace.</strong>
</p>
