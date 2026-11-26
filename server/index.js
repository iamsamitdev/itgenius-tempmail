import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openStore } from './store.js';
import { createHttp } from './http.js';
import { createInbound } from './inbound.js';

function numberSetting(key, fallback, min, max) {
  const value = Number(process.env[key] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}`);
  return value;
}

const httpPort = numberSetting('HTTP_PORT', 3000, 1, 65535);
const smtpPort = numberSetting('SMTP_PORT', 2525, 1, 65535);
const httpHost = process.env.HTTP_HOST || '127.0.0.1';
const smtpHost = process.env.SMTP_HOST || '127.0.0.1';
const publicOrigin = new URL(process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${httpPort}`).origin;
const domains = (process.env.MAIL_DOMAINS || process.env.MAIL_DOMAIN || 'tm.itgenius.co.th')
  .split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
const smtpName = (process.env.SMTP_NAME || domains[0]).toLowerCase();
const tlsKey = process.env.SMTP_TLS_KEY;
const tlsCert = process.env.SMTP_TLS_CERT;
const validDomain = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/;
if (!domains.length || !domains.every(item => validDomain.test(item)) || !validDomain.test(smtpName)) {
  throw new Error('Invalid MAIL_DOMAINS or SMTP_NAME');
}
if (!/^https?:/.test(publicOrigin)) throw new Error('Invalid PUBLIC_ORIGIN');
if (Boolean(tlsKey) !== Boolean(tlsCert)) throw new Error('Set both SMTP_TLS_KEY and SMTP_TLS_CERT');

const database = process.env.DATABASE_PATH || 'data/tempmail.sqlite';
function loadSecret() {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  const file = join(dirname(database), 'secret.key');
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, randomBytes(32).toString('base64url'), { mode: 0o600 });
  }
  return readFileSync(file, 'utf8').trim();
}

const day = 86_400_000;
const config = {
  publicOrigin, domains, smtpName, tlsKey, tlsCert, database,
  secret: database === ':memory:' ? randomBytes(32).toString('base64url') : loadSecret(),
  quotaBytes: numberSetting('ACCOUNT_QUOTA_MB', 40, 1, 1024) * 1024 * 1024,
  maxStoredBytes: numberSetting('MAX_STORAGE_MB', 2048, 16, 102_400) * 1024 * 1024,
  maxAccounts: numberSetting('MAX_ACCOUNTS', 100_000, 10, 10_000_000),
  messageTtlMs: numberSetting('MESSAGE_TTL_DAYS', 7, 1, 365) * day,
  accountTtlMs: numberSetting('ACCOUNT_TTL_DAYS', 30, 1, 3650) * day,
  trustProxy: process.env.TRUST_PROXY === '1',
  rateLimits: {
    request: numberSetting('RATE_REQUESTS_PER_5S', 40, 5, 100_000),
    create: numberSetting('RATE_ACCOUNTS_PER_10MIN', 20, 1, 100_000),
    token: numberSetting('RATE_LOGINS_PER_10MIN', 30, 1, 100_000),
  },
  startedAt: Date.parse('2026-11-19T00:00:00Z'),
};
const store = openStore(config);
store.cleanup();
const http = createHttp(config, store);
const smtp = createInbound(config, store);

http.on('error', error => {
  console.error('HTTP listener error', error.code || error.name);
  process.exit(1);
});
smtp.server.on('error', error => {
  console.error('SMTP listener error', error.code || error.name);
  process.exit(1);
});
smtp.on('error', error => console.error('SMTP connection error', error.code || error.name));

const cleanupTimer = setInterval(() => {
  try { store.cleanup(); }
  catch (error) { console.error('Cleanup failed', error.code || error.name); }
}, 10 * 60_000).unref();

http.listen(httpPort, httpHost, () => console.log(`Web ${publicOrigin} (listening ${httpHost}:${httpPort})`));
smtp.listen(smtpPort, smtpHost, () => console.log(`SMTP ${smtpHost}:${smtpPort} for @${domains.join(', @')}`));

function stop() {
  clearInterval(cleanupTimer);
  http.closeAllConnections?.();
  http.close(() => smtp.close(() => store.close()));
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
