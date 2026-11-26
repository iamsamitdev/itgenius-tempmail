import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export const PAGE_SIZE = 30;
const reserved = new Set([
  'abuse', 'admin', 'administrator', 'hostmaster', 'mailer-daemon', 'noc', 'postmaster',
  'root', 'security', 'webmaster', 'support', 'info',
]);

export const newId = () => randomBytes(12).toString('hex');
export const hash = value => createHash('sha256').update(value).digest('hex');
export const domainId = domain => hash(`domain:${domain}`).slice(0, 24);
const localPartPattern = /^[a-z0-9](?:[a-z0-9._-]{1,62}[a-z0-9])$/;

export function validateLocalPart(localPart) {
  if (!localPartPattern.test(localPart) || localPart.includes('..')) return 'invalid';
  if (reserved.has(localPart)) return 'reserved';
  return null;
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize('NFKC'), salt, 32);
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const [kind, salt, expected] = String(stored).split('$');
  if (kind !== 'scrypt' || !salt || !expected) return false;
  const derived = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), 32);
  const want = Buffer.from(expected, 'base64');
  return want.length === derived.length && timingSafeEqual(want, derived);
}

const statements = {
  accountById: `SELECT id, address, created_at AS createdAt, updated_at AS updatedAt FROM accounts WHERE id = ?`,
  accountByAddress: `SELECT id, address, password, created_at AS createdAt, updated_at AS updatedAt FROM accounts WHERE address = ?`,
  accountIdByAddress: `SELECT id FROM accounts WHERE address = ?`,
  passwordById: `SELECT password FROM accounts WHERE id = ?`,
  updatePassword: `UPDATE accounts SET password = ?, updated_at = ? WHERE id = ?`,
  deleteTokens: `DELETE FROM tokens WHERE account_id = ?`,
  accountCount: `SELECT count(*) AS count FROM accounts`,
  insertAccount: `INSERT INTO accounts (id, address, password, created_at, updated_at, seen_at) VALUES (?, ?, ?, ?, ?, ?)`,
  touchAccount: `UPDATE accounts SET seen_at = ? WHERE id = ? AND seen_at < ?`,
  deleteAccount: `DELETE FROM accounts WHERE id = ?`,
  insertToken: `INSERT INTO tokens (hash, account_id, created_at, used_at) VALUES (?, ?, ?, ?)`,
  tokenAccount: `SELECT a.id, a.address, a.created_at AS createdAt, a.updated_at AS updatedAt, t.used_at AS usedAt
                 FROM tokens t JOIN accounts a ON a.id = t.account_id WHERE t.hash = ?`,
  touchToken: `UPDATE tokens SET used_at = ? WHERE hash = ?`,
  usage: `SELECT count(*) AS count, coalesce(sum(size), 0) AS bytes FROM messages WHERE account_id = ?`,
  totalBytes: `SELECT coalesce(sum(size), 0) AS bytes FROM messages`,
  duplicate: `SELECT 1 FROM messages WHERE account_id = ? AND digest = ?`,
  insertMessage: `INSERT INTO messages (id, account_id, msgid, sender, recipients, cc, bcc, subject, intro, text, html,
                  attachments, size, digest, created_at, updated_at, raw)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  list: `SELECT id, account_id AS accountId, msgid, sender, recipients, subject, intro, seen, flagged, attachments,
                size, created_at AS createdAt, updated_at AS updatedAt
         FROM messages WHERE account_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`,
  summary: `SELECT id, account_id AS accountId, msgid, sender, recipients, subject, intro, seen, flagged, attachments,
                   size, created_at AS createdAt, updated_at AS updatedAt FROM messages WHERE id = ?`,
  message: `SELECT id, account_id AS accountId, msgid, sender, recipients, cc, bcc, subject, intro, text, html, seen, flagged,
                   attachments, size, created_at AS createdAt, updated_at AS updatedAt
            FROM messages WHERE account_id = ? AND id = ?`,
  messageOwner: `SELECT account_id AS accountId FROM messages WHERE id = ?`,
  raw: `SELECT raw FROM messages WHERE account_id = ? AND id = ?`,
  setSeen: `UPDATE messages SET seen = ?, updated_at = ? WHERE account_id = ? AND id = ?`,
  deleteMessage: `DELETE FROM messages WHERE account_id = ? AND id = ?`,
  expireMessages: `DELETE FROM messages WHERE created_at <= ?`,
  expireAccounts: `DELETE FROM accounts WHERE seen_at <= ?`,
  expireTokens: `DELETE FROM tokens WHERE used_at <= ?`,
};

export function openStore({ database, domains, quotaBytes, maxStoredBytes, maxAccounts, messageTtlMs, accountTtlMs }) {
  if (database !== ':memory:') mkdirSync(dirname(database), { recursive: true });
  const db = new DatabaseSync(database, { timeout: 5000 });
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA secure_delete = ON;
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, address TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, seen_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS account_seen ON accounts(seen_at);
    CREATE TABLE IF NOT EXISTS tokens (
      hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL, used_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS token_account ON tokens(account_id);
    CREATE INDEX IF NOT EXISTS token_used ON tokens(used_at);
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      msgid TEXT NOT NULL, sender TEXT NOT NULL, recipients TEXT NOT NULL, cc TEXT NOT NULL, bcc TEXT NOT NULL,
      subject TEXT NOT NULL, intro TEXT NOT NULL, text TEXT NOT NULL, html TEXT NOT NULL, attachments TEXT NOT NULL,
      seen INTEGER NOT NULL DEFAULT 0, flagged INTEGER NOT NULL DEFAULT 0, size INTEGER NOT NULL, digest TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, raw BLOB NOT NULL, UNIQUE(account_id, digest)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS message_order ON messages(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS message_age ON messages(created_at);
  `);
  const query = Object.fromEntries(Object.entries(statements).map(([name, sql]) => [name, db.prepare(sql)]));
  const ping = db.prepare('SELECT 1');
  const listeners = new Set();
  const domainSet = new Set(domains);

  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function account(row) {
    if (!row) return null;
    const usage = query.usage.get(row.id);
    return { id: row.id, address: row.address, quota: quotaBytes, used: usage.bytes, messages: usage.count,
      createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  function parseSummary(row) {
    const attachments = JSON.parse(row.attachments);
    return {
      id: row.id, accountId: row.accountId, msgid: row.msgid, from: JSON.parse(row.sender),
      to: JSON.parse(row.recipients), subject: row.subject, intro: row.intro, seen: Boolean(row.seen),
      flagged: Boolean(row.flagged), hasAttachments: attachments.some(file => !file.related), size: row.size,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
    };
  }

  async function createAccount(address, password) {
    const [localPart, domain] = address.split('@');
    if (!domainSet.has(domain)) return { error: 'domain' };
    const invalid = validateLocalPart(localPart);
    if (invalid) return { error: invalid };
    if (query.accountIdByAddress.get(address)) return { error: 'taken' };
    const passwordHash = await hashPassword(password);
    return transaction(() => {
      if (query.accountIdByAddress.get(address)) return { error: 'taken' };
      if (query.accountCount.get().count >= maxAccounts) return { error: 'capacity' };
      const now = Date.now();
      const id = newId();
      query.insertAccount.run(id, address, passwordHash, now, now, now);
      return { account: account(query.accountById.get(id)) };
    });
  }

  async function login(address, password) {
    const row = query.accountByAddress.get(address);
    if (!row) {
      await verifyPassword(password, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
      return null;
    }
    if (!await verifyPassword(password, row.password)) return null;
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    query.insertToken.run(hash(token), row.id, now, now);
    query.touchAccount.run(now, row.id, now);
    return { id: row.id, token };
  }

  async function changePassword(accountId, currentPassword, nextPassword) {
    const row = query.passwordById.get(accountId);
    if (!row || !await verifyPassword(currentPassword, row.password)) return null;
    const passwordHash = await hashPassword(nextPassword);
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    transaction(() => {
      query.updatePassword.run(passwordHash, now, accountId);
      query.deleteTokens.run(accountId);
      query.insertToken.run(hash(token), accountId, now, now);
    });
    return { id: accountId, token };
  }

  function authenticate(token) {
    if (!token || token.length > 200) return null;
    const key = hash(token);
    const row = query.tokenAccount.get(key);
    if (!row) return null;
    const now = Date.now();
    if (now - row.usedAt > 60_000) {
      query.touchToken.run(now, key);
      query.touchAccount.run(now, row.id, now - 60_000);
    }
    return { id: row.id, address: row.address, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  function acceptMail(recipients, raw, mail) {
    const digest = hash(raw);
    const now = Date.now();
    return transaction(() => {
      const owners = recipients.map(address => query.accountIdByAddress.get(address));
      if (owners.some(owner => !owner)) return { status: 'unknown' };
      const pending = owners.filter(({ id }) => !query.duplicate.get(id, digest));
      if (pending.length === 0) return { status: 'accepted', delivered: [] };
      if (query.totalBytes.get().bytes + raw.length * pending.length > maxStoredBytes) return { status: 'busy' };
      for (const { id } of pending) {
        if (query.usage.get(id).bytes + raw.length > quotaBytes) return { status: 'full' };
      }
      const delivered = [];
      for (const { id } of pending) {
        const messageId = newId();
        query.insertMessage.run(messageId, id, mail.msgid, JSON.stringify(mail.from), JSON.stringify(mail.to),
          JSON.stringify(mail.cc), JSON.stringify(mail.bcc), mail.subject, mail.intro, mail.text, mail.html,
          JSON.stringify(mail.attachments), raw.length, digest, now, now, raw);
        delivered.push(messageId);
      }
      return { status: 'accepted', delivered };
    });
  }

  function emit(accountId, event) {
    for (const listener of listeners) {
      try { listener(accountId, event); }
      catch (error) { console.error('Event listener failed', error.name); }
    }
  }

  return {
    domains: [...domainSet],
    createAccount,
    login,
    changePassword,
    authenticate,
    account: id => account(query.accountById.get(id)),
    deleteAccount: id => query.deleteAccount.run(id).changes > 0,
    hasRecipient: address => Boolean(query.accountIdByAddress.get(address)),
    deliver(recipients, raw, mail) {
      const result = acceptMail(recipients, raw, mail);
      for (const messageId of result.delivered ?? []) {
        const summary = parseSummary(query.summary.get(messageId));
        emit(summary.accountId, { type: 'message', message: summary });
        emit(summary.accountId, { type: 'account', account: account(query.accountById.get(summary.accountId)) });
      }
      return result.status;
    },
    list(accountId, page) {
      const total = query.usage.get(accountId).count;
      const rows = query.list.all(accountId, PAGE_SIZE, (page - 1) * PAGE_SIZE);
      return { total, items: rows.map(parseSummary) };
    },
    message(accountId, messageId) {
      const row = query.message.get(accountId, messageId);
      if (!row) return null;
      return { ...parseSummary(row), cc: JSON.parse(row.cc), bcc: JSON.parse(row.bcc), text: row.text, html: row.html,
        attachments: JSON.parse(row.attachments) };
    },
    owner: messageId => query.messageOwner.get(messageId)?.accountId ?? null,
    raw(accountId, messageId) {
      const row = query.raw.get(accountId, messageId);
      return row ? Buffer.from(row.raw.buffer, row.raw.byteOffset, row.raw.byteLength) : null;
    },
    setSeen(accountId, messageId, seen) {
      const changed = query.setSeen.run(seen ? 1 : 0, Date.now(), accountId, messageId).changes > 0;
      if (changed) emit(accountId, { type: 'seen', id: messageId, seen });
      return changed;
    },
    deleteMessage(accountId, messageId) {
      const deleted = query.deleteMessage.run(accountId, messageId).changes > 0;
      if (deleted) emit(accountId, { type: 'deleted', id: messageId });
      return deleted;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    cleanup() {
      const now = Date.now();
      query.expireMessages.run(now - messageTtlMs);
      query.expireAccounts.run(now - accountTtlMs);
      query.expireTokens.run(now - accountTtlMs);
    },
    check: () => ping.get(),
    close: () => db.close(),
  };
}
