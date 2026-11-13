# Aether Production Release & Verification Checklist

This checklist must be fully verified prior to any production release or version cut.

---

## 1. Automated Verification & Code Quality

- [ ] **Linting**: Root `npm run lint` passes across backend and frontend with zero errors.
- [ ] **Type Safety**: Root `npm run typecheck` (`tsc --noEmit`) passes across backend and frontend with zero errors.
- [ ] **Automated Tests**:
  - [ ] Backend test suite: 100% pass (22/22 suites, 124+ unit/integration tests).
  - [ ] Frontend test suite: 100% pass.
- [ ] **Secret Detection**: Gitleaks scan passes with zero leaks across the repository.
- [ ] **Supply Chain & Asset Provenance**:
  - [ ] `npm run audit:assets` succeeds with zero unregistered assets.
  - [ ] CycloneDX SBOMs generated for root, backend, and frontend.
  - [ ] Dependency tree has zero peer dependency conflicts (`npm ls` returns exit code 0).

---

## 2. Docker & Container Security

- [ ] **Multi-stage Builds**: Production backend and frontend Dockerfiles build from a clean context.
- [ ] **Unprivileged Runtime**: Containers execute under non-root users (`USER node`).
- [ ] **Build Tools Purged**: Compilers (`g++`, `make`, `python3`) and `devDependencies` removed from production runtime image.
- [ ] **Healthchecks**: Verified healthcheck endpoints return HTTP 200 with database and Redis statuses.

---

## 3. Database & Migrations

- [ ] **Schema Migrations**: All PostgreSQL migrations applied cleanly via `npm run migrate`.
- [ ] **Foreign Keys & Constraints**: Unique constraints and cascade rules verified.
- [ ] **Index Coverage**: Critical indexes present on `messages(room_id, created_at)`, `room_members(room_id, user_id)`, and `users(email)`.

---

## 4. Configuration & Secrets

- [ ] **No Hardcoded Secrets**: Zero production credentials committed to version control.
- [ ] **Strong JWT Secret**: Operators have generated an isolated 256-bit secret (`openssl rand -hex 32`).
- [ ] **Network Exposure**: Database, Redis, and internal service ports bound strictly to `127.0.0.1` or internal cluster networks.
- [ ] **TLS Enforcement**: Production ingress configured with valid CA certificates via cert-manager or Cloud Load Balancer.

---

## 5. Performance & Capacity Smoke Tests

- [ ] **WebSocket Capacity**: `scripts/websocket-capacity-test.cjs` executed against target environment with zero unexpected disconnects.
- [ ] **Message Delivery & Ordering**: `scripts/message-benchmark.cjs` executed with 100% message delivery receipt and strict monotonic sequence order.
