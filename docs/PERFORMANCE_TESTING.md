# Aether Performance & Capacity Testing Guide

## 1. Overview & Testing Philosophy

Aether evaluates performance through empirical, reproducible test harnesses rather than aspirational claims. We distinguish sharply between **demonstrated local benchmark results** and **high-scale cluster design targets**.

This document outlines:
1. The test harnesses and metrics measured.
2. Verified benchmark evidence collected on an Apple Silicon M4 development workstation.
3. The cluster testing runbook required to validate 10,000+ concurrent connections in staging.

---

## 2. Test Harnesses

### 2.1 Connection Capacity Harness (`scripts/websocket-capacity-test.cjs`)
Tests concurrent WebSocket connection establishment, staged ramp-up, connection hold periods, unexpected disconnects, and connection handshake latency percentiles.

**Execution:**
```bash
TARGET_URL="https://localhost:443" \
JWT_SECRET="<your-jwt-secret>" \
MAX_CONNECTIONS=100 \
RAMP_SECONDS=10 \
HOLD_SECONDS=15 \
STEP_CONNECTIONS=20 \
STEP_SECONDS=2 \
CONNECTS_PER_SECOND=10 \
node scripts/websocket-capacity-test.cjs
```

### 2.2 Message Throughput & Fan-Out Benchmark (`scripts/message-benchmark.cjs`)
Measures end-to-end message transmission, Redis Pub/Sub room fan-out, server acknowledgment latency, message sequencing integrity, and delivery receipts.

**Execution:**
```bash
TARGET_URL="https://localhost:443" \
JWT_SECRET="<your-jwt-secret>" \
ROOM_ID=1 \
RECEIVERS=5 \
MESSAGE_COUNT=25 \
INTERVAL_MS=120 \
node scripts/message-benchmark.cjs
```

---

## 3. Verified Benchmark Evidence

> [!NOTE]
> All metrics below reflect physical benchmark runs executed on **2026-11-13** against a local Docker Compose stack running PostgreSQL 15, Redis 7, Aether Backend (Node 22), and NGINX with SSL termination on an **Apple MacBook Air M4 (10 cores, 16 GB RAM)**.

### 3.1 WebSocket Connection Capacity Progression

| Metric | 10 Connections | 50 Connections | 100 Connections |
|---|---|---|---|
| **Requested Connections** | 10 | 50 | 100 |
| **Successful Connections** | 10 (100%) | 50 (100%) | 100 (100%) |
| **Active at End of Hold** | 10 | 50 | 100 |
| **Unexpected Disconnects** | 0 | 0 | 0 |
| **Connection Errors** | 0 | 0 | 0 |
| **Handshake Latency (p50)** | **29.5 ms** | **29.8 ms** | **29.8 ms** |
| **Handshake Latency (p95)** | **45.0 ms** | **53.4 ms** | **40.4 ms** |
| **Handshake Latency (p99)** | 45.0 ms | 57.5 ms | 43.7 ms |
| **Max Handshake Latency** | 45.0 ms | 57.5 ms | 44.4 ms |
| **Test Verdict** | **PASS** | **PASS** | **PASS** |
| **Report Artifact** | `websocket-capacity-report.json` | `websocket-capacity-50.json` | `websocket-capacity-100.json` |

### 3.2 Real-Time Message Throughput & Delivery Fan-Out (Room 1)

| Parameter / Metric | Measured Value | Threshold / Target | Verdict |
|---|---|---|---|
| **Sender Workload** | 25 messages @ 120ms interval | Capped at 10 msg/s rate limit | **PASS** |
| **Receiver Sockets in Room** | 5 active listeners | N-way fan-out verification | **PASS** |
| **Expected Total Deliveries** | 125 deliveries | 25 messages × 5 receivers | **PASS** |
| **Actual Total Deliveries** | **125 deliveries** | 100% receipt | **PASS** |
| **Delivery Success Rate** | **100.0%** | ≥ 95.0% | **PASS** |
| **Transmitted Throughput** | **5.10 messages / sec** | Stable paced rate | **PASS** |
| **Delivered Fan-Out Rate** | **25.52 events / sec** | 5x fan-out | **PASS** |
| **Server ACK Latency (min)** | 47.08 ms | < 100 ms | **PASS** |
| **Server ACK Latency (p50)** | **48.97 ms** | < 100 ms | **PASS** |
| **Server ACK Latency (p90)** | 74.28 ms | < 200 ms | **PASS** |
| **Server ACK Latency (p95)** | 76.57 ms | < 250 ms | **PASS** |
| **Server ACK Latency (max)** | 100.93 ms | < 500 ms | **PASS** |
| **End-to-End Transit (p50)** | **48.59 ms** | < 100 ms | **PASS** |
| **End-to-End Transit (p90)** | 73.91 ms | < 200 ms | **PASS** |
| **End-to-End Transit (p95)** | 76.42 ms | < 250 ms | **PASS** |
| **End-to-End Transit (max)** | 100.70 ms | < 500 ms | **PASS** |
| **Out-of-Order Deliveries** | **0** | Strict Monotonic Ordering (0) | **PASS** |
| **Duplicate Messages** | **0** | Exact-once Delivery (0) | **PASS** |

---

## 4. 10,000 Concurrent Connection Staging Guide

> [!IMPORTANT]
> **Status**: **NOT RUN (Requires Staging Cluster)**.
> Running 10,000 persistent TLS WebSocket connections from a single developer laptop causes local ephemeral port exhaustion (`bind: address already in use`), Docker desktop VM memory saturation, and loopback TCP queue starvation.
> A 10,000-connection test must only be run against a distributed multi-node staging cluster.

### 4.1 Recommended Staging Topology
- **Load Balancer**: AWS ALB / GCP HTTPS Load Balancer with HTTP/2 and WebSocket support.
- **Application Nodes**: 3x Kubernetes backend pods (each: 2 vCPU, 4 GB RAM, Node 22).
- **Pub/Sub Bus**: Redis 7 (AWS ElastiCache / GCP Memorystore, cache.m6g.large).
- **Database**: PostgreSQL 15 (AWS RDS / Cloud SQL, db.m6g.large, 100 max connections).
- **Client Load Generators**: 2x dedicated client VMs (AWS c6g.2xlarge) distributed across availability zones, each generating 5,000 connections.

### 4.2 Linux Kernel & File Descriptor Tuning (Load Generators & Servers)
Apply these `sysctl` and `limits.conf` parameters on all host instances:
```bash
# Increase file descriptor limit
sudo sysctl -w fs.file-max=2097152

# Increase connection backlog
sudo sysctl -w net.core.somaxconn=65535
sudo sysctl -w net.ipv4.tcp_max_syn_backlog=65535

# Expand ephemeral port range
sudo sysctl -w net.ipv4.ip_local_port_range="1024 65535"

# Enable fast recycling of closed sockets
sudo sysctl -w net.ipv4.tcp_tw_reuse=1
sudo sysctl -w net.ipv4.tcp_fin_timeout=15

# Set process file limits in /etc/security/limits.conf
# * soft nofile 65535
# * hard nofile 65535
ulimit -n 65535
```

### 4.3 Cluster Test Execution Commands
From Load Generator Node 1 (connections 1 to 5,000):
```bash
TARGET_URL="https://staging.chat.example.com" \
JWT_SECRET="<staging-jwt-secret>" \
BASE_USER_ID=1000 \
MAX_CONNECTIONS=5000 \
RAMP_SECONDS=300 \
HOLD_SECONDS=600 \
STEP_CONNECTIONS=500 \
STEP_SECONDS=30 \
CONNECTS_PER_SECOND=20 \
REPORT_PATH="artifacts/staging-10k-node1.json" \
node scripts/websocket-capacity-test.cjs
```

From Load Generator Node 2 (connections 5,001 to 10,000):
```bash
TARGET_URL="https://staging.chat.example.com" \
JWT_SECRET="<staging-jwt-secret>" \
BASE_USER_ID=6000 \
MAX_CONNECTIONS=5000 \
RAMP_SECONDS=300 \
HOLD_SECONDS=600 \
STEP_CONNECTIONS=500 \
STEP_SECONDS=30 \
CONNECTS_PER_SECOND=20 \
REPORT_PATH="artifacts/staging-10k-node2.json" \
node scripts/websocket-capacity-test.cjs
```
