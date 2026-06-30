import { spawnSync } from 'node:child_process';

const maildevUrl = process.env.MAILDEV_URL ?? 'http://127.0.0.1:1080';
const healthUrl = new URL('/healthz', maildevUrl);
const startupTimeoutMs = 30_000;
const pollIntervalMs = 1_000;

async function isMaildevHealthy() {
  try {
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(1_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function startMaildev() {
  const result = spawnSync('docker', ['compose', 'up', '-d', 'maildev'], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function waitForMaildev() {
  const deadline = Date.now() + startupTimeoutMs;

  while (Date.now() < deadline) {
    if (await isMaildevHealthy()) return;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  console.error(`Maildev did not become healthy at ${healthUrl.href}.`);
  process.exit(1);
}

if (await isMaildevHealthy()) {
  console.log(`Maildev is already healthy at ${healthUrl.href}.`);
  process.exit(0);
}

console.log('Starting local Maildev with Docker Compose...');
startMaildev();
await waitForMaildev();
console.log(`Maildev is healthy at ${healthUrl.href}.`);
