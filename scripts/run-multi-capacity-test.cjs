#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const artifactsDir = path.join(rootDir, 'artifacts');

// Configuration
const workersCount = Number(process.env.WORKERS || 5);
const totalConnections = Number(process.env.TOTAL_CONNECTIONS || 1000);
const connsPerWorker = Math.ceil(totalConnections / workersCount);
const rampSeconds = Number(process.env.RAMP_SECONDS || 20);
const holdSeconds = Number(process.env.HOLD_SECONDS || 15);
const stepConnections = Number(process.env.STEP_CONNECTIONS || Math.max(10, Math.floor(connsPerWorker / 4)));
const stepSeconds = Number(process.env.STEP_SECONDS || 5);
const connectsPerSecond = Number(process.env.CONNECTS_PER_SECOND || 15);
const targetUrl = process.env.TARGET_URL || 'https://nginx:443';

// Load JWT_SECRET from .env if present
let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret && fs.existsSync(path.join(rootDir, '.env'))) {
  const envContent = fs.readFileSync(path.join(rootDir, '.env'), 'utf8');
  const match = envContent.match(/JWT_SECRET=([^\r\n]+)/);
  if (match) jwtSecret = match[1].trim();
}
jwtSecret = jwtSecret || 'dev-jwt-secret-for-testing-only-replace-in-production';

// Detect active Docker network
function getDockerNetwork() {
  const res = spawnSync('docker', ['network', 'ls', '--format', '{{.Name}}'], { encoding: 'utf8' });
  const lines = (res.stdout || '').split('\n').map((s) => s.trim());
  const match = lines.find((n) => n.endsWith('chat_network'));
  return match || 'aether-donny_chat_network';
}

async function main() {
  fs.mkdirSync(artifactsDir, { recursive: true });

  // Clean prior worker reports
  const priorReports = fs.readdirSync(artifactsDir).filter((f) => /^capacity-worker-.*\.json$/.test(f));
  for (const f of priorReports) {
    fs.unlinkSync(path.join(artifactsDir, f));
  }

  const networkName = getDockerNetwork();
  console.log(`\n========================================================`);
  console.log(` Starting Multi-Container Capacity Benchmark ($0.00) `);
  console.log(`========================================================`);
  console.log(`Docker Network:       ${networkName}`);
  console.log(`Target URL:           ${targetUrl}`);
  console.log(`Worker Containers:    ${workersCount}`);
  console.log(`Total Connections:    ${totalConnections} (${connsPerWorker} per worker)`);
  console.log(`Pacing per Worker:    ${connectsPerSecond} conns/sec (< 20/sec per-IP limit)`);
  console.log(`Aggregate Ramp Rate:  ${connectsPerSecond * workersCount} conns/sec`);
  console.log(`Ramp Seconds:         ${rampSeconds}s (Hold: ${holdSeconds}s)`);
  console.log(`========================================================\n`);

  // Ensure image exists
  console.log('[setup] Ensuring aether-loadtest:latest image is built...');
  const buildResult = spawnSync('docker', ['build', '-t', 'aether-loadtest:latest', '-f', 'Dockerfile.loadtest', '.'], {
    cwd: rootDir,
    stdio: 'inherit',
  });
  if (buildResult.status !== 0) {
    console.error('Failed to build aether-loadtest:latest image');
    process.exit(1);
  }

  const containerNames = [];
  const workerPromises = [];

  for (let i = 1; i <= workersCount; i++) {
    const containerName = `aether-capacity-worker-${i}-${Date.now()}`;
    containerNames.push(containerName);

    const envArgs = [
      '-e', `WORKER_ID=${i}`,
      '-e', `BASE_USER_ID=${i * 10000}`,
      '-e', `TARGET_URL=${targetUrl}`,
      '-e', `JWT_SECRET=${jwtSecret}`,
      '-e', `MAX_CONNECTIONS=${connsPerWorker}`,
      '-e', `RAMP_SECONDS=${rampSeconds}`,
      '-e', `HOLD_SECONDS=${holdSeconds}`,
      '-e', `STEP_CONNECTIONS=${stepConnections}`,
      '-e', `STEP_SECONDS=${stepSeconds}`,
      '-e', `CONNECTS_PER_SECOND=${connectsPerSecond}`,
      '-e', `REPORT_PATH=/app/artifacts/capacity-worker-${i}.json`,
    ];

    const args = [
      'run',
      '--name', containerName,
      '--network', networkName,
      '-v', `${artifactsDir}:/app/artifacts`,
      ...envArgs,
      'aether-loadtest:latest',
    ];

    console.log(`[launch] Starting worker container ${i}/${workersCount} (${containerName})...`);
    const promise = new Promise((resolve) => {
      const proc = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => {
        stdout += d.toString();
        // Log stage progress
        const lines = d.toString().split('\n');
        for (const l of lines) {
          if (l.startsWith('[stage]') || l.startsWith('[report]') || l.startsWith('[hold]')) {
            console.log(`[worker-${i}] ${l}`);
          }
        }
      });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        resolve({ workerId: i, code, stdout, stderr, containerName });
      });
    });
    workerPromises.push(promise);
  }

  console.log(`\n[benchmark] All ${workersCount} worker containers running concurrently...`);
  const results = await Promise.all(workerPromises);

  // Clean up containers
  console.log('\n[cleanup] Removing finished worker containers...');
  for (const name of containerNames) {
    spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
  }

  const failedWorkers = results.filter((r) => r.code !== 0);
  if (failedWorkers.length > 0) {
    console.error(`\n[error] ${failedWorkers.length} worker container(s) exited with non-zero status:`);
    for (const f of failedWorkers) {
      console.error(`  - Worker ${f.workerId} exited with code ${f.code}: ${f.stderr || f.stdout}`);
    }
  }

  // Aggregate results
  console.log('\n[aggregate] Compiling unified benchmark summary report...');
  const aggResult = spawnSync('node', ['scripts/aggregate-capacity-reports.cjs'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...process.env, ARTIFACTS_DIR: artifactsDir },
  });

  if (aggResult.status !== 0 || failedWorkers.length > 0) {
    console.error('[fail] Capacity benchmark failed or degraded.');
    process.exit(1);
  }

  console.log('[pass] Capacity benchmark completed successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
