import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { simpleParser } from 'mailparser';
import { domainId, PAGE_SIZE } from './store.js';

const files = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/docs', ['public/docs.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['public/styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/i18n.js', ['public/i18n.js', 'text/javascript; charset=utf-8']],
  ['/favicon.svg', ['public/favicon.svg', 'image/svg+xml']],
  ['/fonts/lucide.woff2', ['node_modules/lucide-static/font/lucide.woff2', 'font/woff2']],
  ['/fonts/inter-latin.woff2', ['node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'font/woff2']],
  ['/fonts/inter-latin-ext.woff2', ['node_modules/@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2', 'font/woff2']],
  ['/fonts/anuphan-thai.woff2', ['node_modules/@fontsource-variable/anuphan/files/anuphan-thai-wght-normal.woff2', 'font/woff2']],
]);
const pageCsp = "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
const ticketTtl = 30 * 60_000;
const idPattern = '[0-9a-f]{24}';
const routes = [
  ['GET', /^\/domains$/, 'domains'],
  ['GET', new RegExp(`^/domains/(${idPattern})$`), 'domain'],
  ['POST', /^\/accounts$/, 'createAccount'],
  ['POST', /^\/token$/, 'token'],
  ['GET', /^\/me$/, 'me'],
  ['GET', new RegExp(`^/accounts/(${idPattern})$`), 'account'],
  ['DELETE', new RegExp(`^/accounts/(${idPattern})$`), 'deleteAccount'],
  ['PATCH', new RegExp(`^/accounts/(${idPattern})$`), 'changePassword'],
  ['GET', /^\/messages$/, 'messages'],
  ['GET', new RegExp(`^/messages/(${idPattern})$`), 'message'],
  ['PATCH', new RegExp(`^/messages/(${idPattern})$`), 'patchMessage'],
  ['DELETE', new RegExp(`^/messages/(${idPattern})$`), 'deleteMessage'],
  ['GET', new RegExp(`^/messages/(${idPattern})/download$`), 'download'],
  ['GET', new RegExp(`^/messages/(${idPattern})/attachment/(ATTACH\\d{6})$`), 'attachment'],
  ['GET', new RegExp(`^/sources/(${idPattern})$`), 'source'],
  ['GET', /^\/events$/, 'events'],
  ['GET', /^\/config$/, 'config'],
  ['GET', /^\/\.well-known\/mercure$/, 'events'],
];

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const iso = ms => new Date(ms).toISOString();

function attachmentHeader(kind, filename) {
  const fallback = filename.replace(/[^a-zA-Z0-9._ -]/g, '_') || 'download';
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16)}`);
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function rateLimiter(limit, windowMs, maxKeys = 20_000) {
  const hits = new Map();
  return key => {
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.until <= now) {
      if (hits.size >= maxKeys) {
        for (const [name, value] of hits) if (value.until <= now) hits.delete(name);
        if (hits.size >= maxKeys) return false;
      }
      entry = { count: 0, until: now + windowMs };
      hits.set(key, entry);
    }
    return ++entry.count <= limit;
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
}

export function createHttp(config, store) {
  const { publicOrigin, trustProxy, secret, messageTtlMs } = config;
  const secure = publicOrigin.startsWith('https:');
  const assets = new Map([...files].map(([url, [file, type]]) => [
    url, { data: readFileSync(new URL(`../${file}`, import.meta.url)), type },
  ]));
  const rate = config.rateLimits ?? {};
  const limits = {
    request: rateLimiter(rate.request ?? 40, 5_000),
    create: rateLimiter(rate.create ?? 20, 10 * 60_000),
    token: rateLimiter(rate.token ?? 30, 10 * 60_000),
    address: rateLimiter(10, 10 * 60_000),
  };
  const streams = new Map();
  let streamCount = 0;

  const sign = value => createHmac('sha256', secret).update(value).digest('base64url');
  function ticket(accountId, messageId) {
    const expires = Date.now() + ticketTtl;
    return `${expires}.${sign(`${accountId}.${messageId}.${expires}`)}`;
  }
  function checkTicket(value, messageId) {
    const [expires, signature] = String(value ?? '').split('.');
    if (!/^\d{13}$/.test(expires) || !signature || Number(expires) < Date.now()) return null;
    const accountId = store.owner(messageId);
    if (!accountId) return null;
    const expected = Buffer.from(sign(`${accountId}.${messageId}.${expires}`));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given) ? accountId : null;
  }

  function clientIp(req) {
    const forwarded = req.headers['x-tempmail-client'];
    return trustProxy && typeof forwarded === 'string' && isIP(forwarded) ? forwarded : req.socket.remoteAddress;
  }

  function wantsLd(req) {
    const accept = String(req.headers.accept ?? '');
    return !(accept.includes('application/json') && !accept.includes('ld+json'));
  }

  function send(res, status, data, headers = {}) {
    const body = data === undefined ? '' : JSON.stringify(data);
    res.writeHead(status, {
      ...(body ? { 'Content-Type': `application/${headers.ld === false ? 'json' : 'ld+json'}; charset=utf-8` } : {}),
      ...Object.fromEntries(Object.entries(headers).filter(([key]) => key !== 'ld')),
    });
    res.end(body);
  }

  async function body(req) {
    const type = String(req.headers['content-type'] ?? '');
    if (!/json/.test(type)) throw new HttpError(415, 'Use a JSON request body');
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 8192) throw new HttpError(413, 'Request body is too large');
      chunks.push(chunk);
    }
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape');
      return value;
    } catch {
      throw new HttpError(400, 'Invalid JSON body');
    }
  }

  function auth(req) {
    const header = String(req.headers.authorization ?? '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new HttpError(401, 'JWT Token not found', { error: 'token_missing' });
    const account = store.authenticate(token);
    if (!account) throw new HttpError(401, 'Invalid JWT Token', { error: 'token_invalid' });
    return account;
  }

  function violation(propertyPath, message, error) {
    return new HttpError(422, `${propertyPath}: ${message}`, {
      error, '@type': 'ConstraintViolationList', 'hydra:title': 'An error occurred',
      violations: [{ propertyPath, message, code: error }],
    });
  }

  const domainView = domain => ({
    '@id': `/domains/${domainId(domain)}`, '@type': 'Domain', id: domainId(domain), domain,
    isActive: true, isPrivate: false, createdAt: iso(config.startedAt), updatedAt: iso(config.startedAt),
  });
  const accountView = account => ({
    '@context': '/contexts/Account', '@id': `/accounts/${account.id}`, '@type': 'Account',
    id: account.id, address: account.address, quota: account.quota, used: account.used,
    isDisabled: false, isDeleted: false, createdAt: iso(account.createdAt), updatedAt: iso(account.updatedAt),
  });
  const summaryView = message => ({
    '@id': `/messages/${message.id}`, '@type': 'Message', id: message.id, accountId: `/accounts/${message.accountId}`,
    msgid: message.msgid, from: message.from, to: message.to, subject: message.subject, intro: message.intro,
    seen: message.seen, isDeleted: false, hasAttachments: message.hasAttachments, size: message.size,
    downloadUrl: `/messages/${message.id}/download`, createdAt: iso(message.createdAt), updatedAt: iso(message.updatedAt),
  });

  function collection(req, path, items, total, page) {
    if (!wantsLd(req)) return items.map(({ '@id': _, '@type': __, '@context': ___, ...item }) => item);
    const last = Math.max(1, Math.ceil(total / PAGE_SIZE));
    return {
      '@context': `/contexts/${path === '/domains' ? 'Domain' : 'Message'}`, '@id': path, '@type': 'hydra:Collection',
      'hydra:member': items, 'hydra:totalItems': total,
      ...(total > PAGE_SIZE ? { 'hydra:view': {
        '@id': `${path}?page=${page}`, '@type': 'hydra:PartialCollectionView',
        'hydra:first': `${path}?page=1`, 'hydra:last': `${path}?page=${last}`,
        ...(page < last ? { 'hydra:next': `${path}?page=${page + 1}` } : {}),
        ...(page > 1 ? { 'hydra:previous': `${path}?page=${page - 1}` } : {}),
      } } : {}),
    };
  }

  async function attachmentContent(raw, attachmentId) {
    const parsed = await simpleParser(raw, { skipImageLinks: true, skipTextToHtml: true, skipHtmlToText: true });
    const index = Number(attachmentId.slice(6)) - 1;
    return parsed.attachments[index] ?? null;
  }

  function openStream(req, res, account, url) {
    const topic = url.searchParams.get('topic');
    if (topic && topic !== `/accounts/${account.id}` && topic !== '*') throw new HttpError(403, 'Topic not allowed');
    const set = streams.get(account.id) ?? new Set();
    if (set.size >= 6 || streamCount >= 3000) throw new HttpError(429, 'Too many open event streams', { error: 'rate_limited' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    });
    res.write(`retry: 5000\n: connected\n\n`);
    set.add(res);
    streams.set(account.id, set);
    streamCount++;
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.socket.setTimeout(0);
    const close = () => {
      clearInterval(heartbeat);
      if (set.delete(res)) streamCount--;
      if (set.size === 0) streams.delete(account.id);
    };
    req.on('close', close);
    res.on('error', close);
  }

  store.subscribe((accountId, event) => {
    const set = streams.get(accountId);
    if (!set) return;
    let payload;
    if (event.type === 'message') payload = summaryView(event.message);
    else if (event.type === 'account') payload = accountView(event.account);
    else payload = { '@type': 'Event', type: event.type, id: event.id, seen: event.seen };
    const data = `event: ${event.type}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of set) res.write(data);
  });

  const handlers = {
    domains(req, res, url) {
      const domains = store.domains.map(domainView);
      return send(res, 200, collection(req, '/domains', domains, domains.length, 1), { ld: wantsLd(req) });
    },
    domain(req, res, url, [id]) {
      const domain = store.domains.find(name => domainId(name) === id);
      if (!domain) throw new HttpError(404, 'Not Found');
      return send(res, 200, domainView(domain));
    },
    async createAccount(req, res) {
      const ip = clientIp(req);
      if (!limits.create(ip)) throw new HttpError(429, 'Too many accounts created, try again later', { error: 'rate_limited' });
      const { address, password } = await body(req);
      if (typeof address !== 'string' || address.length > 254) throw violation('address', 'This value is not a valid email address.', 'invalid');
      if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
        throw violation('password', 'Password must be 6 to 128 characters.', 'password');
      }
      const result = await store.createAccount(address.trim().toLowerCase(), password);
      if (result.error === 'domain') throw violation('address', 'This domain is not available.', 'domain');
      if (result.error === 'invalid') throw violation('address', 'Use 3-64 letters, digits, dots, dashes or underscores.', 'invalid');
      if (result.error === 'reserved') throw violation('address', 'This address is reserved.', 'reserved');
      if (result.error === 'taken') throw violation('address', 'This value is already used.', 'taken');
      if (result.error === 'capacity') throw new HttpError(503, 'Service is at capacity', { error: 'capacity' });
      return send(res, 201, accountView(result.account), { Location: `/accounts/${result.account.id}` });
    },
    async token(req, res) {
      const { address, password } = await body(req);
      if (typeof address !== 'string' || typeof password !== 'string' || address.length > 254 || password.length > 128) {
        throw new HttpError(400, 'Send address and password', { error: 'invalid' });
      }
      const normalized = address.trim().toLowerCase();
      if (!limits.token(clientIp(req)) || !limits.address(normalized)) {
        throw new HttpError(429, 'Too many login attempts, try again later', { error: 'rate_limited' });
      }
      const session = await store.login(normalized, password);
      if (!session) throw new HttpError(401, 'Invalid credentials.', { error: 'credentials' });
      return send(res, 200, session, { ld: false });
    },
    me(req, res) {
      return send(res, 200, accountView(store.account(auth(req).id)));
    },
    account(req, res, url, [id]) {
      const account = auth(req);
      if (account.id !== id) throw new HttpError(403, 'Access Denied.');
      return send(res, 200, accountView(store.account(id)));
    },
    deleteAccount(req, res, url, [id]) {
      const account = auth(req);
      if (account.id !== id) throw new HttpError(403, 'Access Denied.');
      store.deleteAccount(id);
      for (const stream of streams.get(id) ?? []) stream.end();
      return send(res, 204);
    },
    async changePassword(req, res, url, [id]) {
      const account = auth(req);
      if (account.id !== id) throw new HttpError(403, 'Access Denied.');
      const { currentPassword, password } = await body(req);
      if (typeof currentPassword !== 'string' || currentPassword.length > 128) {
        throw violation('currentPassword', 'Send the current password.', 'current_password');
      }
      if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
        throw violation('password', 'Password must be 6 to 128 characters.', 'password');
      }
      if (!limits.token(clientIp(req)) || !limits.address(account.address)) {
        throw new HttpError(429, 'Too many attempts, try again later', { error: 'rate_limited' });
      }
      const session = await store.changePassword(id, currentPassword, password);
      if (!session) throw new HttpError(401, 'Current password is incorrect.', { error: 'current_password' });
      for (const stream of streams.get(id) ?? []) stream.end();
      return send(res, 200, session, { ld: false });
    },
    messages(req, res, url) {
      const account = auth(req);
      const page = Number(url.searchParams.get('page') ?? 1);
      if (!Number.isInteger(page) || page < 1 || page > 10_000) throw new HttpError(400, 'Invalid page');
      const { total, items } = store.list(account.id, page);
      return send(res, 200, collection(req, '/messages', items.map(summaryView), total, page), { ld: wantsLd(req) });
    },
    message(req, res, url, [id]) {
      const account = auth(req);
      const message = store.message(account.id, id);
      if (!message) throw new HttpError(404, 'Not Found', { error: 'not_found' });
      const viewTicket = ticket(account.id, id);
      return send(res, 200, {
        '@context': '/contexts/Message', ...summaryView(message), cc: message.cc, bcc: message.bcc,
        flagged: message.flagged, verifications: [], retention: true,
        retentionDate: iso(message.createdAt + messageTtlMs), text: message.text, html: message.html ? [message.html] : [],
        attachments: message.attachments.map(({ contentId, ...file }) => ({
          ...file, downloadUrl: `/messages/${id}/attachment/${file.id}`,
        })),
        viewUrl: message.html ? `/view/${id}?t=${viewTicket}` : null,
        ticket: viewTicket,
      });
    },
    async patchMessage(req, res, url, [id]) {
      const account = auth(req);
      const { seen } = await body(req);
      if (typeof seen !== 'boolean') throw violation('seen', 'This value should be of type bool.', 'invalid');
      if (!store.setSeen(account.id, id, seen)) throw new HttpError(404, 'Not Found', { error: 'not_found' });
      return send(res, 200, { seen });
    },
    deleteMessage(req, res, url, [id]) {
      const account = auth(req);
      if (!store.deleteMessage(account.id, id)) throw new HttpError(404, 'Not Found', { error: 'not_found' });
      return send(res, 204);
    },
    download(req, res, url, [id]) {
      const accountId = url.searchParams.has('t') ? checkTicket(url.searchParams.get('t'), id) : auth(req).id;
      const raw = accountId && store.raw(accountId, id);
      if (!raw) throw new HttpError(404, 'Not Found', { error: 'not_found' });
      res.writeHead(200, {
        'Content-Type': 'message/rfc822', 'Content-Length': raw.length,
        'Content-Disposition': attachmentHeader('attachment', `${id}.eml`),
      });
      return res.end(raw);
    },
    async attachment(req, res, url, [id, attachmentId]) {
      const accountId = url.searchParams.has('t') ? checkTicket(url.searchParams.get('t'), id) : auth(req).id;
      const raw = accountId && store.raw(accountId, id);
      const file = raw && await attachmentContent(raw, attachmentId);
      if (!file) throw new HttpError(404, 'Not Found', { error: 'not_found' });
      const filename = (file.filename || `${attachmentId}`).replace(/[/\\]/g, '_');
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream', 'Content-Length': file.content.length,
        'Content-Disposition': attachmentHeader('attachment', filename),
      });
      return res.end(file.content);
    },
    source(req, res, url, [id]) {
      const account = auth(req);
      const raw = store.raw(account.id, id);
      if (!raw) throw new HttpError(404, 'Not Found', { error: 'not_found' });
      return send(res, 200, {
        '@context': '/contexts/Source', '@id': `/sources/${id}`, '@type': 'Source', id,
        downloadUrl: `/messages/${id}/download`, data: raw.toString('utf8'),
      });
    },
    events(req, res, url) {
      return openStream(req, res, auth(req), url);
    },
    config(req, res) {
      return send(res, 200, {
        domains: store.domains, quota: config.quotaBytes,
        messageTtlDays: Math.round(messageTtlMs / 86_400_000), accountTtlDays: Math.round(config.accountTtlMs / 86_400_000),
      }, { ld: false });
    },
  };

  async function view(req, res, url, id) {
    const accountId = checkTicket(url.searchParams.get('t'), id);
    const message = accountId && store.message(accountId, id);
    if (!message) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Link expired');
    }
    const images = url.searchParams.get('images') === '1';
    let html = message.html || `<pre>${escapeHtml(message.text)}</pre>`;
    if (/cid:/i.test(html) && message.attachments.some(file => file.contentId)) {
      const parsed = await simpleParser(store.raw(accountId, id), { skipImageLinks: true, skipTextToHtml: true, skipHtmlToText: true });
      const inline = new Map(parsed.attachments.filter(file => file.contentId && file.size < 3_000_000).map(file => [
        file.contentId.replace(/^<|>$/g, '').toLowerCase(),
        `data:${(file.contentType || 'application/octet-stream').replace(/[^\w/+.-]/g, '')};base64,${file.content.toString('base64')}`,
      ]));
      html = html.replace(/cid:([^"'\s)>]+)/gi, (match, cid) => inline.get(decodeURIComponent(cid).toLowerCase()) ?? match);
    }
    const document = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><meta name="referrer" content="no-referrer">
<style>html{color-scheme:light}body{margin:0;padding:16px;font:15px/1.5 Inter,system-ui,sans-serif;color:#20203c;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}pre{white-space:pre-wrap;font:inherit}</style></head><body>${html}</body></html>`;
    const remote = images ? ' https: http:' : '';
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': `default-src 'none'; img-src data:${remote}; style-src 'unsafe-inline'${remote}; font-src data:${remote}; media-src data:${remote}; frame-ancestors ${publicOrigin}; form-action 'none'; base-uri 'none'; sandbox allow-popups allow-popups-to-escape-sandbox`,
    });
    return res.end(document);
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://local');
    const method = req.method;
    if (url.pathname === '/healthz' && method === 'GET') {
      store.check();
      return send(res, 200, { status: 'ok' }, { ld: false });
    }
    const asset = assets.get(url.pathname);
    if (asset && (method === 'GET' || method === 'HEAD')) {
      res.setHeader('Content-Security-Policy', pageCsp);
      res.writeHead(200, {
        'Content-Type': asset.type, 'Content-Length': asset.data.length,
        'Cache-Control': url.pathname.startsWith('/fonts/') ? 'public, max-age=604800, immutable' : 'no-cache',
      });
      return res.end(method === 'HEAD' ? undefined : asset.data);
    }
    const viewMatch = new RegExp(`^/view/(${idPattern})$`).exec(url.pathname);
    if (viewMatch && method === 'GET') return view(req, res, url, viewMatch[1]);

    const path = url.pathname.startsWith('/api/') ? url.pathname.slice(4) : url.pathname;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Location');
    if (method === 'OPTIONS') {
      return send(res, 204, undefined, {
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
        'Access-Control-Max-Age': '86400',
      });
    }
    const route = routes.find(([verb, pattern]) => verb === method && pattern.test(path));
    if (!route) {
      const known = routes.some(([, pattern]) => pattern.test(path));
      throw new HttpError(known ? 405 : 404, known ? 'Method Not Allowed' : 'Not Found', { error: 'not_found' });
    }
    if (!limits.request(clientIp(req))) throw new HttpError(429, 'Too many requests, slow down', { error: 'rate_limited' });
    const params = route[1].exec(path).slice(1);
    return handlers[route[2]](req, res, url, params);
  }

  return createServer({ requestTimeout: 30_000, headersTimeout: 15_000, maxHeaderSize: 8192 }, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    Promise.resolve().then(() => handle(req, res)).catch(error => {
      if (res.headersSent) return res.destroy();
      if (error instanceof HttpError) {
        return send(res, error.status, { code: error.status, message: error.message, 'hydra:description': error.message, ...error.extra }, { ld: false });
      }
      console.error('HTTP request failed', error.code || error.name, error.message);
      return send(res, 500, { code: 500, message: 'Internal server error', error: 'server_error' }, { ld: false });
    });
  });
}
