#!/usr/bin/env node
'use strict';

/**
 * Aether Real-Time Message Throughput & Delivery Benchmark Harness
 *
 * Measures:
 * - Direct & Room Fan-Out Message Throughput (messages/sec)
 * - End-to-End Delivery Latency percentiles (min, p50, p90, p95, p99, max)
 * - Server Send Acknowledgment Latency
 * - Message Delivery Integrity (100% receipt, sequence order, zero drops, zero duplicates)
 *
 * Usage:
 *   node scripts/message-benchmark.cjs
 *
 * Environment variables:
 *   TARGET_URL          Target Socket.IO server (default: http://127.0.0.1:3000)
 *   JWT_SECRET          Secret to mint test tokens (default: dev-jwt-secret-for-testing-only-replace-in-production)
 *   ROOM_ID             Room ID to test messaging (default: 1)
 *   RECEIVERS           Number of listening clients in room (default: 5)
 *   MESSAGE_COUNT       Total messages to publish (default: 50)
 *   INTERVAL_MS         Interval between messages in ms (default: 150ms -> ~6.6 msg/s, respects 10 msg/s limit)
 *   REPORT_PATH         Output JSON path (default: artifacts/message-benchmark-report.json)
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { io } = require('socket.io-client');

const target = (process.env.TARGET_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const jwtSecret = process.env.JWT_SECRET || 'dev-jwt-secret-for-testing-only-replace-in-production';
const roomId = Number(process.env.ROOM_ID || 1);
const receiverCount = Math.max(1, Number(process.env.RECEIVERS || 5));
const messageCount = Math.max(1, Number(process.env.MESSAGE_COUNT || 50));
const intervalMs = Math.max(105, Number(process.env.INTERVAL_MS || 150)); // >=105ms to stay under 10 msg/s limit
const reportPath = process.env.REPORT_PATH || path.join('artifacts', 'message-benchmark-report.json');

function mintToken(userId, username) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ userId, username, iat: Math.floor(Date.now() / 1000) })).toString('base64url');
  const signature = crypto.createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

async function createClient(userId, username) {
  return new Promise((resolve, reject) => {
    const token = mintToken(userId, username);
    const socket = io(target, {
      transports: ['websocket'],
      upgrade: false,
      reconnection: false,
      timeout: 10000,
      auth: { token },
      rejectUnauthorized: false,
      forceNew: true,
    });

    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`Connection timeout for user ${username} (${userId})`));
    }, 12000);

    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(err);
    });
  });
}

async function main() {
  console.log('=== Aether Real-Time Message Throughput & Delivery Benchmark ===');
  console.log(JSON.stringify({
    target,
    roomId,
    receiverCount,
    messageCount,
    intervalMs,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpus: os.cpus().length,
  }, null, 2));

  const startedAt = new Date();
  const startTime = performance.now();

  // 1. Establish Sender
  console.log('\n[1/4] Connecting sender client (User 900)...');
  let senderSocket;
  try {
    senderSocket = await createClient(900, 'bench_sender');
    console.log('✓ Sender connected (socket id:', senderSocket.id, ')');
  } catch (err) {
    console.error('Failed to connect sender:', err.message);
    process.exit(1);
  }

  // 2. Establish Receivers
  console.log(`\n[2/4] Connecting ${receiverCount} receiver clients (Users 901-${900 + receiverCount})...`);
  const receiverSockets = [];
  for (let i = 1; i <= receiverCount; i++) {
    const userId = 900 + i;
    const username = `bench_receiver_${i}`;
    try {
      const socket = await createClient(userId, username);
      receiverSockets.push({ userId, username, socket, receivedCount: 0, receivedSeqs: [] });
    } catch (err) {
      console.error(`Failed to connect receiver ${username}:`, err.message);
      senderSocket.disconnect();
      receiverSockets.forEach((r) => r.socket.disconnect());
      process.exit(1);
    }
  }
  console.log(`✓ All ${receiverCount} receivers connected.`);

  // 3. Join Room
  console.log(`\n[3/4] Joining room:${roomId}...`);
  senderSocket.emit('room:join', { roomId });
  for (const r of receiverSockets) {
    r.socket.emit('room:join', { roomId });
  }
  await sleep(500); // Allow server room joins to propagate

  // 4. Setup message listeners
  const deliveryLatencies = [];
  const ackLatencies = [];
  const receivedMessages = new Map(); // id -> count
  let outOfOrderDetections = 0;
  let senderAcksReceived = 0;
  let senderAcksFailed = 0;

  receiverSockets.forEach((r) => {
    let lastSeq = 0;
    r.socket.on('message:receive', (msg) => {
      const now = performance.now();
      r.receivedCount++;
      const seq = msg.metadata?.seq ?? null;
      if (seq !== null) {
        r.receivedSeqs.push(seq);
        if (seq <= lastSeq) {
          outOfOrderDetections++;
        }
        lastSeq = seq;
      }

      if (msg.id) {
        receivedMessages.set(msg.id, (receivedMessages.get(msg.id) || 0) + 1);
      }

      if (msg.metadata?.sendTimestamp) {
        const transitMs = now - msg.metadata.sendTimestamp;
        deliveryLatencies.push(transitMs);
      }

      // Send delivery acknowledgment receipt back to server
      if (msg.id) {
        r.socket.emit('message:delivered', {
          messageId: msg.id,
          roomId,
          userId: r.userId,
        });
      }
    });
  });

  // 5. Send message workload
  console.log(`\n[4/4] Sending ${messageCount} messages (interval: ${intervalMs}ms)...`);
  const workloadStart = performance.now();

  for (let seq = 1; seq <= messageCount; seq++) {
    const sendTimestamp = performance.now();
    const messageContent = `Benchmark workload message #${seq} [${crypto.randomBytes(8).toString('hex')}]`;

    senderSocket.emit('message:send', {
      roomId,
      content: messageContent,
      messageType: 'text',
      metadata: {
        seq,
        sendTimestamp,
      },
    }, (response) => {
      const ackTime = performance.now() - sendTimestamp;
      ackLatencies.push(ackTime);
      if (response && response.success !== false) {
        senderAcksReceived++;
      } else {
        senderAcksFailed++;
      }
    });

    if (seq % 10 === 0 || seq === messageCount) {
      process.stdout.write(`  Transmitted ${seq}/${messageCount} messages...\r`);
    }

    if (seq < messageCount) {
      await sleep(intervalMs);
    }
  }
  console.log(`\n✓ All ${messageCount} messages transmitted.`);

  // 6. Hold for in-flight deliveries and receipts
  const holdForDeliveriesMs = Math.max(2000, receiverCount * 200);
  console.log(`Waiting ${holdForDeliveriesMs}ms for final message fan-out and delivery receipts...`);
  await sleep(holdForDeliveriesMs);

  const finishedAt = new Date();
  const totalDurationMs = Math.round(performance.now() - startTime);
  const workloadDurationMs = Math.round(performance.now() - workloadStart);

  // Clean up
  senderSocket.disconnect();
  receiverSockets.forEach((r) => r.socket.disconnect());

  // 7. Calculate results
  const expectedTotalDeliveries = messageCount * receiverCount;
  const actualTotalDeliveries = receiverSockets.reduce((sum, r) => sum + r.receivedCount, 0);
  const deliverySuccessRatePct = expectedTotalDeliveries > 0
    ? Math.round((actualTotalDeliveries / expectedTotalDeliveries) * 10000) / 100
    : 0;

  const messagesPerSecond = workloadDurationMs > 0
    ? Math.round((messageCount / (workloadDurationMs / 1000)) * 100) / 100
    : 0;

  const deliveredEventsPerSecond = workloadDurationMs > 0
    ? Math.round((actualTotalDeliveries / (workloadDurationMs / 1000)) * 100) / 100
    : 0;

  const duplicateDetections = Array.from(receivedMessages.values()).filter((c) => c > receiverCount).length;

  const report = {
    schemaVersion: 1,
    testType: 'Aether Socket.IO Real-Time Messaging & Fan-Out Benchmark',
    target,
    roomId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    totalDurationMs,
    workloadDurationMs,
    parameters: {
      messageCount,
      receiverCount,
      intervalMs,
      expectedTotalDeliveries,
    },
    throughput: {
      messagesTransmittedPerSecond: messagesPerSecond,
      deliveredEventsPerSecond,
    },
    delivery: {
      messagesTransmitted: messageCount,
      serverAcksReceived,
      serverAcksFailed,
      expectedTotalDeliveries,
      actualTotalDeliveries,
      deliverySuccessRatePct,
      outOfOrderDetections,
      duplicateDetections,
    },
    latencyMs: {
      serverAck: {
        min: ackLatencies.length ? Math.round(Math.min(...ackLatencies) * 100) / 100 : null,
        p50: percentile(ackLatencies, 50),
        p90: percentile(ackLatencies, 90),
        p95: percentile(ackLatencies, 95),
        p99: percentile(ackLatencies, 99),
        max: ackLatencies.length ? Math.round(Math.max(...ackLatencies) * 100) / 100 : null,
      },
      endToEndDelivery: {
        min: deliveryLatencies.length ? Math.round(Math.min(...deliveryLatencies) * 100) / 100 : null,
        p50: percentile(deliveryLatencies, 50),
        p90: percentile(deliveryLatencies, 90),
        p95: percentile(deliveryLatencies, 95),
        p99: percentile(deliveryLatencies, 99),
        max: deliveryLatencies.length ? Math.round(Math.max(...deliveryLatencies) * 100) / 100 : null,
      },
    },
    receivers: receiverSockets.map((r) => ({
      userId: r.userId,
      username: r.username,
      receivedCount: r.receivedCount,
      missingCount: messageCount - r.receivedCount,
    })),
    host: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      cpuCount: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || null,
      totalMemoryBytes: os.totalmem(),
    },
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

  console.log('\n=== Benchmark Summary ===');
  console.log(`Report saved to: ${path.resolve(reportPath)}`);
  console.log(JSON.stringify({
    throughput: `${messagesPerSecond} msg/s (sender) | ${deliveredEventsPerSecond} events/s (fan-out)`,
    deliverySuccessRate: `${deliverySuccessRatePct}% (${actualTotalDeliveries}/${expectedTotalDeliveries})`,
    serverAckLatency: report.latencyMs.serverAck,
    endToEndLatency: report.latencyMs.endToEndDelivery,
    outOfOrder: outOfOrderDetections,
    duplicates: duplicateDetections,
  }, null, 2));

  if (deliverySuccessRatePct < 95 || outOfOrderDetections > 0) {
    console.warn('\n⚠️ Delivery degraded below acceptable threshold.');
    process.exitCode = 1;
  } else {
    console.log('\n✅ Message throughput and delivery benchmark passed.');
  }
}

main().catch((err) => {
  console.error('\n❌ Fatal benchmark error:', err);
  process.exit(1);
});
