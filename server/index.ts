import { configurePhoenix } from './telemetry';
import { createRealtimeServer, readBrokerConfig } from './realtime';

const config = readBrokerConfig(process.env);
const port = Number(process.env.VOICE_BROKER_PORT ?? 8787);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('VOICE_BROKER_PORT must be between 1024 and 65535.');
const telemetry = configurePhoenix(process.env);
const server = createRealtimeServer(config, fetch, telemetry);
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  server.close(); server.closeAllConnections();
  await telemetry.shutdown();
}
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
server.listen(port, '127.0.0.1', () => {
  console.log(`Phoenix tracing ${telemetry.enabled ? 'enabled' : 'disabled'}; content capture disabled.`);
  console.log(`Local voice broker listening on loopback port ${port}; real voice ${config.enabled && config.apiKey ? 'enabled' : 'disabled'}.`);
});
