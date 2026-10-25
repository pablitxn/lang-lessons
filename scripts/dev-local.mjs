import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/dev-local.mjs [--voice | --no-voice]\nStarts the app and loopback voice broker using the saved server configuration. Optional flags override voice availability; calls still require Start tutor.');
  process.exit(0);
}
if (args.some(arg => !['--voice', '--no-voice'].includes(arg)) || args.length > 1) {
  console.error('Unknown arguments. Use --help for local development options.');
  process.exit(1);
}
const voiceOverride = args.includes('--voice') ? '1' : args.includes('--no-voice') ? '0' : undefined;
if (!existsSync(new URL('../node_modules/vite/bin/vite.js', import.meta.url))) {
  console.error('Dependencies are missing. Run npm ci first.');
  process.exit(1);
}

async function checkPort(port) {
  const probe = createServer();
  try {
    await new Promise((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(port, '127.0.0.1', resolve);
    });
    await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  } catch {
    throw new Error(`Cannot bind 127.0.0.1:${port}. Stop the existing listener or resolve local permissions before restarting.`);
  }
}

try {
  await checkPort(5174);
  await checkPort(8787);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const children = new Set();
let stopping = false;
let shutdownTimer;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
  shutdownTimer = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
  }, 3000);
  shutdownTimer.unref();
}
function start(label, arguments_, environment) {
  const child = spawn(process.execPath, arguments_, { cwd: root, env: environment, stdio: 'inherit' });
  children.add(child);
  child.once('error', () => {
    console.error(`Could not start ${label}.`);
    stop(1);
  });
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(`${label} stopped (${signal ?? code}); stopping local development.`);
      stop(code || 1);
    }
    if (!children.size) clearTimeout(shutdownTimer);
  });
}
process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));

// Load server credentials in the broker without reading them into this launcher.
const brokerEnvironment = { ...process.env, VOICE_BROKER_PORT: '8787' };
if (voiceOverride !== undefined) brokerEnvironment.ALLOW_PAID_VOICE = voiceOverride;
start('voice broker', ['--env-file-if-exists=accounts.local/app.env', '--env-file-if-exists=.env.local', '--import', 'tsx', 'server/index.ts'], brokerEnvironment);
const frontendEnvironment = { ...process.env };
delete frontendEnvironment.OPENAI_API_KEY;
start('frontend', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], frontendEnvironment);
console.log(`Local app: http://127.0.0.1:5174/ | voice ${voiceOverride === '1' ? 'enabled by --voice' : voiceOverride === '0' ? 'disabled by --no-voice' : 'uses saved server configuration'}. Start tutor initiates a call. Ctrl-C stops both processes.`);
