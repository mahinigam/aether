# Aether Deployment & Local Environment Guide

## 1. Local Development Environment

Aether is configured for reproducible local execution using Docker Compose. A developer can bring up the entire stack from a clean checkout in under 3 minutes.

### 1.1 Prerequisites
- **Node.js**: v22 LTS or newer
- **Docker & Docker Compose**: Docker Desktop 4.28+ (or Docker Engine with Compose plugin v2)
- **OpenSSL**: For TLS certificate and secret generation

---

### 1.2 Step-by-Step Clean Setup

#### Step 1: Install Dependencies
```bash
# Root tooling (Husky, commitlint, benchmark harness)
npm ci

# Backend dependencies
cd backend && npm ci && cd ..

# Frontend dependencies
cd frontend && npm ci && cd ..
```

#### Step 2: Generate Environment Secrets
```bash
# Copy example configuration
cp .env.example .env

# Generate a strong 64-character JWT secret
JWT_SECRET=$(openssl rand -hex 32)
sed -i.bak "s/replace-with-a-random-64-character-hex-secret/$JWT_SECRET/" .env && rm .env.bak
```

#### Step 3: Generate Local Development TLS Certificates
```bash
# Generates self-signed dev certificates in nginx/certs/ (git-ignored)
./scripts/generate-dev-cert.sh
```

#### Step 4: Start Core Services
```bash
# Starts PostgreSQL, Redis, Backend, Frontend, and NGINX
docker compose up -d
```

#### Step 5: Run Database Migrations
```bash
# Run PostgreSQL migrations
cd backend
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/chat_platform" npm run migrate
cd ..
```

#### Step 6: Verify Service Health
```bash
# Verify health endpoint through NGINX reverse proxy
curl -k https://localhost:443/health
```
Expected output:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "checks": {
    "database": { "status": "up", "latencyMs": 2 },
    "redis": { "status": "up", "latencyMs": 1 }
  }
}
```

#### Step 7: Safe Local Shutdown
```bash
# Stop containers without destroying data volumes
docker compose down
```
> [!CAUTION]
> Never run `docker compose down -v` unless you intentionally wish to purge all user accounts, messages, and uploaded files.

---

## 2. Docker Compose Profiles

To keep local development lightweight while supporting specialized testing, Compose uses profiles:

| Profile | Included Services | Use Case | Command |
|---|---|---|---|
| **Default** (No flag) | `postgres`, `redis`, `backend`, `frontend`, `nginx` | Day-to-day UI & API development, messaging benchmarks | `docker compose up -d` |
| **`search`** | Default + `elasticsearch` | Full-text message search testing | `docker compose --profile search up -d` |
| **`webrtc`** | Default + `coturn` | NAT traversal testing for voice & video | `docker compose --profile webrtc up -d` |
| **`full`** | All services | Complete end-to-end integration | `docker compose --profile full up -d` |

---

## 3. Production Deployment (Kubernetes)

Production manifests reside in `k8s/`:

### 3.1 Architecture Components
- **Deployment (`k8s/deployment.yaml`)**:
  - 3 initial replicas running `aether-backend`.
  - Rolling updates (`maxSurge: 1`, `maxUnavailable: 0`).
  - Liveness & Readiness probes pointing to `/health`.
  - Resource requests: `250m CPU`, `512Mi Memory`; limits: `1000m CPU`, `1Gi Memory`.
- **HorizontalPodAutoscaler (`k8s/deployment.yaml`)**:
  - Autoscales between 3 and 10 pods based on 70% CPU / 80% Memory targets.
- **Ingress (`k8s/config.yaml`)**:
  - NGINX Ingress Controller annotations for WebSocket timeout (`proxy-read-timeout: "3600"`).
  - TLS termination via `cert-manager` with Let's Encrypt.
- **Secrets Template (`k8s/config.yaml`)**:
  - Base template for Kubernetes secrets. In production, configure secrets using ExternalSecrets operator (e.g. HashiCorp Vault or AWS Secrets Manager) or apply out-of-band:
    ```bash
    kubectl create secret generic chat-secrets \
      --from-literal=database-url="$PROD_DATABASE_URL" \
      --from-literal=redis-url="$PROD_REDIS_URL" \
      --from-literal=jwt-secret="$(openssl rand -hex 32)"
    ```
