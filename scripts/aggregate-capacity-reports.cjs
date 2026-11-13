#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const artifactsDir = process.env.ARTIFACTS_DIR || path.join(process.cwd(), 'artifacts');
const summaryPath = process.env.SUMMARY_REPORT_PATH || path.join(artifactsDir, 'high-scale-capacity-summary.json');

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function round(val, digits = 2) {
  if (val === null || val === undefined || Number.isNaN(val)) return null;
  return Number(val.toFixed(digits));
}

function main() {
  if (!fs.existsSync(artifactsDir)) {
    console.error(`Artifacts directory not found: ${artifactsDir}`);
    process.exit(1);
  }

  const allFiles = fs.readdirSync(artifactsDir);
  const workerFiles = allFiles.filter((file) => /^capacity-worker-.*\.json$/.test(file));
  const candidateFiles = workerFiles.length > 0
    ? workerFiles
    : allFiles.filter((file) => file === 'websocket-capacity-report.json');
  const files = candidateFiles.map((file) => path.join(artifactsDir, file));

  if (files.length === 0) {
    console.error(`No worker report JSON files found in ${artifactsDir}`);
    process.exit(1);
  }

  console.log(`Found ${files.length} capacity test worker report(s):`);
  const workerReports = [];
  const allLatencySamples = [];
  let totalRequested = 0;
  let totalSuccessful = 0;
  let totalActive = 0;
  let totalErrors = 0;
  let totalUnexpectedDisconnects = 0;
  let anyDegraded = false;
  let earliestStart = null;
  let latestFinish = null;

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      workerReports.push(data);
      totalRequested += data.requestedMaxConnections || 0;
      totalSuccessful += data.successfulConnections || 0;
      totalActive += data.activeAtEndOfHold || 0;
      totalErrors += data.connectErrors || 0;
      totalUnexpectedDisconnects += data.unexpectedDisconnects || 0;

      if (data.result !== 'pass') {
        anyDegraded = true;
      }

      if (Array.isArray(data.latencySamples)) {
        allLatencySamples.push(...data.latencySamples);
      }

      const start = new Date(data.startedAt);
      const finish = new Date(data.finishedAt);
      if (!earliestStart || start < earliestStart) earliestStart = start;
      if (!latestFinish || finish > latestFinish) latestFinish = finish;

      console.log(`  - ${path.basename(file)}: worker=${data.workerId || 'default'} requested=${data.requestedMaxConnections} successful=${data.successfulConnections} p50=${data.connectionLatencyMs?.p50?.toFixed(1)}ms result=${data.result}`);
    } catch (err) {
      console.warn(`  - Skipped invalid report ${file}: ${err.message}`);
    }
  }

  if (workerReports.length === 0) {
    console.error('No valid worker reports parsed.');
    process.exit(1);
  }

  const durationMs = earliestStart && latestFinish ? Math.max(0, latestFinish - earliestStart) : null;
  const successRate = totalRequested > 0 ? (totalSuccessful / totalRequested) * 100 : 0;
  const overallResult = (!anyDegraded && totalErrors === 0 && totalUnexpectedDisconnects === 0 && totalSuccessful === totalRequested)
    ? 'pass'
    : 'degraded';

  const sumLatency = allLatencySamples.reduce((acc, v) => acc + v, 0);
  const meanLatency = allLatencySamples.length ? sumLatency / allLatencySamples.length : null;

  // Fallback to mean of worker percentiles if raw samples not collected
  const fallbackP50 = workerReports.map((r) => r.connectionLatencyMs?.p50).filter((v) => typeof v === 'number');
  const fallbackP95 = workerReports.map((r) => r.connectionLatencyMs?.p95).filter((v) => typeof v === 'number');
  const fallbackP99 = workerReports.map((r) => r.connectionLatencyMs?.p99).filter((v) => typeof v === 'number');
  const fallbackMax = workerReports.map((r) => r.connectionLatencyMs?.max).filter((v) => typeof v === 'number');

  const p50Val = allLatencySamples.length ? percentile(allLatencySamples, 50) : (fallbackP50.length ? fallbackP50.reduce((a, b) => a + b, 0) / fallbackP50.length : null);
  const p95Val = allLatencySamples.length ? percentile(allLatencySamples, 95) : (fallbackP95.length ? fallbackP95.reduce((a, b) => a + b, 0) / fallbackP95.length : null);
  const p99Val = allLatencySamples.length ? percentile(allLatencySamples, 99) : (fallbackP99.length ? fallbackP99.reduce((a, b) => a + b, 0) / fallbackP99.length : null);
  const maxVal = allLatencySamples.length ? Math.max(...allLatencySamples) : (fallbackMax.length ? Math.max(...fallbackMax) : null);

  const summary = {
    schemaVersion: 1,
    testType: 'High-Scale Multi-Worker Socket.IO Connection Capacity Benchmark',
    result: overallResult,
    timestamp: new Date().toISOString(),
    workersCount: workerReports.length,
    totalRequestedConnections: totalRequested,
    totalSuccessfulConnections: totalSuccessful,
    totalActiveAtEndOfHold: totalActive,
    totalConnectErrors: totalErrors,
    totalUnexpectedDisconnects: totalUnexpectedDisconnects,
    connectionSuccessRatePercent: round(successRate, 2),
    durationMs,
    globalConnectionLatencyMs: {
      min: allLatencySamples.length ? round(Math.min(...allLatencySamples)) : null,
      mean: round(meanLatency),
      p50: round(p50Val),
      p90: round(percentile(allLatencySamples, 90)),
      p95: round(p95Val),
      p99: round(p99Val),
      max: round(maxVal),
    },
    workers: workerReports.map((r) => ({
      workerId: r.workerId,
      target: r.target,
      requested: r.requestedMaxConnections,
      successful: r.successfulConnections,
      activeAtEndOfHold: r.activeAtEndOfHold,
      connectErrors: r.connectErrors,
      unexpectedDisconnects: r.unexpectedDisconnects,
      latencyP50Ms: round(r.connectionLatencyMs?.p50),
      latencyP95Ms: round(r.connectionLatencyMs?.p95),
      result: r.result,
    })),
  };

  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');
  console.log(`\n========================================================`);
  console.log(`   HIGH-SCALE MULTI-WORKER CAPACITY BENCHMARK RESULTS   `);
  console.log(`========================================================`);
  console.log(`Result:                       ${summary.result.toUpperCase()}`);
  console.log(`Worker Containers:            ${summary.workersCount}`);
  console.log(`Total Requested Connections:  ${summary.totalRequestedConnections}`);
  console.log(`Total Successful Connections: ${summary.totalSuccessfulConnections} (${summary.connectionSuccessRatePercent}%)`);
  console.log(`Active Connections at Hold:   ${summary.totalActiveAtEndOfHold}`);
  console.log(`Connection Errors:            ${summary.totalConnectErrors}`);
  console.log(`Unexpected Disconnects:       ${summary.totalUnexpectedDisconnects}`);
  console.log(`Handshake Latency p50:        ${summary.globalConnectionLatencyMs.p50} ms`);
  console.log(`Handshake Latency p95:        ${summary.globalConnectionLatencyMs.p95} ms`);
  console.log(`Handshake Latency p99:        ${summary.globalConnectionLatencyMs.p99} ms`);
  console.log(`Summary Report Saved:         ${path.resolve(summaryPath)}`);
  console.log(`========================================================\n`);

  if (overallResult !== 'pass') {
    process.exit(1);
  }
}

main();
