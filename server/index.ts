import { createProviderCapture, providerSidebandConnector } from './provider-capture';
import { Pool } from 'pg';
import { createApplicationServices } from './application-services';
import { readApplicationConfiguration, createApplicationLimiter } from './application-config';
import { learningNodeBridge } from './learning-http';
import { configurePhoenix } from './telemetry';
import { createRealtimeServer, readBrokerConfig } from './realtime';

const config = readBrokerConfig(process.env);
const port = Number(process.env.VOICE_BROKER_PORT ?? 8787);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('VOICE_BROKER_PORT must be between 1024 and 65535.');
const telemetry = configurePhoenix(process.env);
const application = await readApplicationConfiguration(process.env);
if (application && !config.allowedOrigins.includes(application.origin)) throw new Error('Learning origin must match an explicitly allowed frontend origin.');
const pool = application ? new Pool({ connectionString: application.databaseUrl }) : null;
const feedbackTelemetry = telemetry.feedback();
const services = application && pool ? createApplicationServices({ pool, origin: application.origin, secret: application.secret,
  ...(feedbackTelemetry ? { feedbackTelemetry } : {}),
  terminateProviderCall: async callId => {
    if (!config.enabled || !config.apiKey || !/^[A-Za-z0-9_-]{1,200}$/.test(callId)) return false;
    try { return (await fetch(`https://api.openai.com/v1/realtime/calls/${callId}/hangup`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}` }, signal: AbortSignal.timeout(10000),
    })).ok; } catch { return false; }
  },
  login: application.login, ...(application.grouping ? { grouping: application.grouping } : {}),
  allowRequest: createApplicationLimiter(application.requestLimit) }) : null;
const learning = learningNodeBridge(services, `http://127.0.0.1:${port}`);
// Transcript capture is approved but never enabled merely by configuring metadata tracing.
const captureEnabled = process.env.PHOENIX_CAPTURE_TRANSCRIPTS === 'true';
const debugSink = captureEnabled ? telemetry.debugSink() : undefined;
const capture = services && config.enabled && config.apiKey && debugSink ? createProviderCapture({
  policy: { version: 'oct18-authorized-transcripts-v1', maxTextCharacters: 16000, route: 'phoenix', evidence: 'authorized-transcripts' },
  sink: debugSink, synthetic: false, gap: segment => telemetry.captureGap(segment), connect: providerSidebandConnector(config.apiKey),
}) : undefined;
const server = createRealtimeServer(config, fetch, telemetry, learning, services?.brokerAuthority, capture);
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  server.close(); server.closeAllConnections();
  await capture?.shutdown();
  await telemetry.shutdown(); await pool?.end();
}
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
server.listen(port, '127.0.0.1', () => {
  console.log(`Phoenix tracing ${telemetry.enabled ? 'enabled' : 'disabled'}; content capture ${capture ? 'enabled' : 'disabled'}.`);
  console.log(`Local voice broker listening on loopback port ${port}; real voice ${config.enabled && config.apiKey ? 'enabled' : 'disabled'}.`);
});
