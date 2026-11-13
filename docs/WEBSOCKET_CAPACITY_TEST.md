# Reproducible WebSocket capacity test

This test measures **concurrent Socket.IO WebSocket connections**, not message throughput, end-to-end message latency, or multi-node resilience. Run only against an environment you own or are explicitly authorised to test.

## 1. Prepare a controlled environment

1. Deploy the exact commit you intend to measure.
2. Provision PostgreSQL and Redis using the same topology and limits as the deployment being evaluated.
3. Confirm the Socket.IO Redis adapter is enabled if testing multiple backend instances.
4. Configure the reverse proxy, file descriptors, kernel socket limits, memory, CPU, network and database pool limits as intended for the test.
5. Create a dedicated disposable account through the normal registration endpoint. Do not use a personal account or production user.
6. Obtain its access token from the registration response. Never commit the token.

The registration endpoint returns \`accessToken\`. The load runner uses that token for every virtual socket, avoiding thousands of password hashes and login rate-limit side effects. This isolates connection capacity from account provisioning and authentication throughput.

## 2. Run the staged test

From the repository root, install root dependencies and export the token:

\`\`\`sh
npm ci
export ACCESS_TOKEN='REDACTED_TEST_ACCOUNT_ACCESS_TOKEN'
export TARGET_URL='https://staging.example.com'
export MAX_CONNECTIONS=10000
export RAMP_SECONDS=300
export STEP_CONNECTIONS=500
export STEP_SECONDS=30
export HOLD_SECONDS=300
export REPORT_PATH='artifacts/websocket-capacity-report.json'
node scripts/websocket-capacity-test.cjs
\`\`\`

The test creates sockets in staged batches and paces connection attempts to remain below Aether's default production per-IP connection limiter (20 attempts/second). The effective rate is capped by `CONNECTS_PER_SECOND` (default 15) and the requested ramp target. It records successful connection latency, checks for unexpected disconnects, holds the requested population, then closes all clients. A successful result requires all requested connections to establish and remain active through the hold interval with no observed connection errors or unexpected disconnects.

For a safe smoke run, use \`MAX_CONNECTIONS=50\`, \`STEP_CONNECTIONS=10\`, \`RAMP_SECONDS=10\`, \`STEP_SECONDS=2\`, and \`HOLD_SECONDS=15\` first.

## 3. Interpret the report

The JSON report records target, timestamp, requested and successful connection counts, active connections at the end of the hold, connection-latency p50/p95/p99, stage results, errors, Node version, OS, CPU model/count and host memory.

Also retain deployment-side telemetry for CPU, RSS/heap, event-loop lag, file descriptors, network throughput, Redis clients/latency, PostgreSQL pool wait/active connections, Nginx active connections and backend restarts. The client report alone cannot identify the bottleneck.

## 4. Limits and evidence policy

- A single-host test does not establish multi-node capacity. The default rate limiter allows 20 new socket connections per source IP per second and 100 per server instance per second; use a paced ramp or a coordinated set of authorised generators rather than disabling the production limiter.
- Reusing one test account means it is not a test of unique-user registration, login, or per-user message throughput.
- This script does not send messages; message throughput and delivery fan-out require a separate workload.
- Do not extrapolate from 50, 500, or 1,000 connections to 10,000.
- Record the exact application commit SHA, deployment config, runner size, test command and raw report alongside every result.
- A design target is not a measured result. Only publish the tested value and conditions supported by retained evidence.
