#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { io } = require('socket.io-client');

const target = (process.env.TARGET_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const maxConnections = Number(process.env.MAX_CONNECTIONS || 1000);
const rampSeconds = Number(process.env.RAMP_SECONDS || 120);
const holdSeconds = Number(process.env.HOLD_SECONDS || 180);
const stepConnections = Number(process.env.STEP_CONNECTIONS || 250);
const stepSeconds = Number(process.env.STEP_SECONDS || 30);
const connectsPerSecond = Number(process.env.CONNECTS_PER_SECOND || 15);
const connectTimeoutMs = Number(process.env.CONNECT_TIMEOUT_MS || 15000);
const effectiveConnectsPerSecond = Math.min(connectsPerSecond, Math.max(1, Math.ceil(maxConnections / rampSeconds)));
const explicitToken = process.env.ACCESS_TOKEN;
const jwtSecret = process.env.JWT_SECRET || (explicitToken ? null : 'dev-jwt-secret-for-testing-only-replace-in-production');
const multiUser = process.env.MULTI_USER !== 'false';
const workerId = process.env.WORKER_ID || (process.env.HOSTNAME ? process.env.HOSTNAME.replace(/[^a-zA-Z0-9_-]/g, '') : null);
const defaultReportPath = workerId
  ? path.join('artifacts', `capacity-worker-${workerId}.json`)
  : path.join('artifacts', 'websocket-capacity-report.json');
const output = process.env.REPORT_PATH || defaultReportPath;

if (!explicitToken && !jwtSecret) {
  console.error('Either ACCESS_TOKEN or JWT_SECRET is required.');
  process.exit(2);
}

const defaultBaseUserId = workerId && !isNaN(Number(workerId))
  ? 100 + (Number(workerId) - 1) * maxConnections
  : 100;
const baseUserId = Number(process.env.BASE_USER_ID || defaultBaseUserId);

function getToken(index) {
  if (explicitToken) return explicitToken;
  const userId = multiUser ? 100 + ((baseUserId - 100 + index) % 10000) : baseUserId;
  const username = multiUser ? `loaduser_${userId}` : `loaduser_${baseUserId}`;
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ userId, username, iat: Math.floor(Date.now() / 1000) })).toString('base64url');
  const signature = crypto.createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}
if (!Number.isInteger(maxConnections) || maxConnections < 1 || maxConnections > 10000) {
  console.error('MAX_CONNECTIONS must be an integer from 1 to 10000.');
  process.exit(2);
}
if (![rampSeconds, holdSeconds, stepConnections, stepSeconds, connectTimeoutMs, connectsPerSecond].every(Number.isFinite) ||
    rampSeconds < 1 || holdSeconds < 1 || stepConnections < 1 || stepSeconds < 1 ||
    connectsPerSecond < 1 || connectsPerSecond > 20) {
  console.error('Ramp, hold, step and timeout values must be positive; CONNECTS_PER_SECOND must be 1-20 to stay below the default production per-IP limiter.');
  process.exit(2);
}

const sockets = [];
const samples = [];
const errors = [];
const startedAt = new Date();
const startedMono = performance.now();
let connected = 0;
let disconnected = 0;
let connectErrors = 0;
let peakConnected = 0;
let stopping = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

async function connectOne(index) {
  return new Promise((resolve) => {
    const socket = io(target, {
      transports: ['websocket'],
      upgrade: false,
      reconnection: false,
      timeout: connectTimeoutMs,
      auth: { token: getToken(index) },
      forceNew: true,
      rejectUnauthorized: false,
    });
    sockets.push(socket);
    const start = performance.now();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      connectErrors++;
      errors.push({ index, type: 'connect-timeout' });
      socket.disconnect();
      resolve(false);
    }, connectTimeoutMs + 1000);

    socket.once('connect', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      connected++;
      peakConnected = Math.max(peakConnected, connected);
      samples.push(performance.now() - start);
      socket.once('disconnect', (reason) => {
        disconnected++;
        if (!stopping) errors.push({ index, type: 'unexpected-disconnect', reason });
      });
      resolve(true);
    });
    socket.once('connect_error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      connectErrors++;
      errors.push({ index, type: 'connect-error', message: error.message });
      socket.disconnect();
      resolve(false);
    });
  });
}

async function main() {
  console.log(JSON.stringify({
    target, maxConnections, rampSeconds, holdSeconds, stepConnections, stepSeconds, connectsPerSecond: effectiveConnectsPerSecond,
    node: process.version, platform: process.platform, arch: process.arch,
    cpus: os.cpus().length, totalMemoryBytes: os.totalmem(),
  }, null, 2));

  const stages = [];
  const started = performance.now();
  let attempted = 0;
  const stageCount = Math.ceil(maxConnections / stepConnections);
  for (let stage = 1; stage <= stageCount; stage++) {
    const desired = Math.min(stage * stepConnections, maxConnections);
    const batch = desired - attempted;
    const batchStarted = performance.now();
    let successCount = 0;
    let stageAttempted = 0;
    while (stageAttempted < batch) {
      const groupSize = Math.min(effectiveConnectsPerSecond, batch - stageAttempted);
      const groupStart = performance.now();
      const outcomes = await Promise.all(
        Array.from({ length: groupSize }, (_, offset) =>
          connectOne(attempted + stageAttempted + offset)
        )
      );
      successCount += outcomes.filter(Boolean).length;
      stageAttempted += groupSize;
      if (stageAttempted < batch) {
        const elapsedGroup = performance.now() - groupStart;
        await sleep(Math.max(0, 1000 - elapsedGroup));
      }
    }
    attempted = desired;
    const elapsed = performance.now() - batchStarted;
    stages.push({
      stage, attempted, connectedAtStage: connected,
      newlyConnected: successCount, newlyFailed: batch - successCount,
      batchDurationMs: Math.round(elapsed),
    });
    console.log('[stage]', JSON.stringify(stages[stages.length - 1]));
    if (attempted < maxConnections && elapsed < stepSeconds * 1000) {
      await sleep(stepSeconds * 1000 - elapsed);
    }
  }

  const reachedAt = performance.now();
  const actualHoldMs = holdSeconds * 1000;
  const holdStarted = performance.now();
  while (performance.now() - holdStarted < actualHoldMs) {
    await sleep(Math.min(1000, actualHoldMs - (performance.now() - holdStarted)));
    const active = sockets.reduce((n, socket) => n + (socket.connected ? 1 : 0), 0);
    console.log('[hold]', JSON.stringify({
      elapsedSeconds: Math.round((performance.now() - holdStarted) / 1000),
      activeConnections: active,
      connectErrors,
      unexpectedDisconnects: errors.filter((error) => error.type === 'unexpected-disconnect').length,
    }));
  }

  stopping = true;
  const activeBeforeClose = sockets.reduce((n, socket) => n + (socket.connected ? 1 : 0), 0);
  sockets.forEach((socket) => socket.disconnect());
  await sleep(250);

  const finishedAt = new Date();
  const report = {
    schemaVersion: 1,
    testType: 'Socket.IO WebSocket connection-capacity test',
    workerId: workerId || 'default',
    result: errors.length === 0 && activeBeforeClose === connected ? 'pass' : 'degraded',
    warning: 'This result applies only to this target, commit, host, topology and test profile. It is not a general capacity guarantee.',
    target,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Math.round(performance.now() - started),
    rampDurationMs: Math.round(reachedAt - started),
    holdDurationMs: actualHoldMs,
    requestedMaxConnections: maxConnections,
    attemptedConnections: attempted,
    successfulConnections: connected,
    activeAtEndOfHold: activeBeforeClose,
    unexpectedDisconnects: errors.filter((error) => error.type === 'unexpected-disconnect').length,
    connectErrors,
    gracefulDisconnects: disconnected,
    connectionLatencyMs: {
      p50: percentile(samples, 50),
      p95: percentile(samples, 95),
      p99: percentile(samples, 99),
      max: samples.length ? Math.max(...samples) : null,
    },
    host: {
      platform: process.platform,
      release: os.release(),
      arch: process.arch,
      node: process.version,
      cpuCount: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || null,
      totalMemoryBytes: os.totalmem(),
    },
    stages,
    errors: errors.slice(0, 200),
    latencySamples: samples,
  };

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log('[report]', path.resolve(output));
  console.log(JSON.stringify({
    result: report.result,
    requested: maxConnections,
    successful: connected,
    activeAtEndOfHold: activeBeforeClose,
    connectErrors,
    unexpectedDisconnects: report.unexpectedDisconnects,
    connectionLatencyMs: report.connectionLatencyMs,
  }, null, 2));

  if (connected !== maxConnections || activeBeforeClose !== connected || connectErrors || report.unexpectedDisconnects) {
    process.exitCode = 1;
  }
}

process.on('SIGINT', () => {
  stopping = true;
  sockets.forEach((socket) => socket.disconnect());
  process.exit(130);
});
main().catch((error) => {
  console.error(error);
  stopping = true;
  sockets.forEach((socket) => socket.disconnect());
  process.exitCode = 1;
});
