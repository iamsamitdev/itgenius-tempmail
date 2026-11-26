import { readFileSync } from 'node:fs';
import { compile } from 'html-to-text';
import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';

export const MAX_MAIL_BYTES = 10 * 1024 * 1024;
const htmlToText = compile({
  limits: { maxInputLength: MAX_MAIL_BYTES, maxDepth: 32, maxChildNodes: 8000 },
  wordwrap: false,
  selectors: [
    { selector: 'img', format: 'skip' },
    { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
  ],
});

function smtpError(responseCode, message) {
  return Object.assign(new Error(message), { responseCode });
}

function clean(value, limit) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit).toWellFormed()
    : '';
}

function addresses(field) {
  const list = [];
  const walk = items => {
    for (const item of items ?? []) {
      if (item.group) walk(item.group);
      else if (item.address || item.name) list.push({ address: clean(item.address, 320), name: clean(item.name, 160) });
    }
  };
  for (const entry of [field].flat()) walk(entry?.value);
  return list.slice(0, 50);
}

async function collect(stream) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    bytes += chunk.length;
    if (bytes <= MAX_MAIL_BYTES) chunks.push(chunk);
  }
  if (stream.sizeExceeded || bytes > MAX_MAIL_BYTES) throw smtpError(552, 'Message exceeds 10 MiB');
  return Buffer.concat(chunks, bytes);
}

export async function parseMail(raw, envelopeFrom = '') {
  const message = await simpleParser(raw, { skipImageLinks: true, skipTextToHtml: true, skipHtmlToText: true });
  let text = message.text || '';
  const html = typeof message.html === 'string' ? message.html.slice(0, 2_000_000) : '';
  if (!text.trim() && html) {
    try { text = htmlToText(html); }
    catch { text = ''; }
  }
  text = text.replaceAll('\u0000', '').slice(0, 512_000).toWellFormed();
  const from = addresses(message.from)[0] ?? { address: clean(envelopeFrom, 320), name: '' };
  return {
    message,
    mail: {
      msgid: clean(message.messageId, 300) || `<${Date.now()}@local>`,
      from,
      to: addresses(message.to),
      cc: addresses(message.cc),
      bcc: addresses(message.bcc),
      subject: clean(message.subject, 300),
      intro: text.replace(/\s+/g, ' ').trim().slice(0, 160),
      text,
      html: html.toWellFormed(),
      attachments: message.attachments.slice(0, 32).map((file, index) => ({
        id: `ATTACH${String(index + 1).padStart(6, '0')}`,
        filename: clean(file.filename, 180).replace(/[/\\]/g, '_') || `attachment-${index + 1}`,
        contentType: clean(file.contentType, 120) || 'application/octet-stream',
        disposition: file.contentDisposition === 'inline' ? 'inline' : 'attachment',
        transferEncoding: 'base64',
        related: Boolean(file.related),
        contentId: clean(file.contentId, 200).replace(/^<|>$/g, ''),
        size: file.size ?? file.content.length,
      })),
    },
  };
}

async function receive(stream, session, store) {
  const raw = await collect(stream);
  const parsed = await parseMail(raw, session.envelope.mailFrom?.address).catch(() => {
    throw smtpError(554, 'Unable to decode message');
  });
  const recipients = [...new Set(session.envelope.rcptTo.map(item => item.address.toLowerCase()))];
  const result = store.deliver(recipients, raw, parsed.mail);
  if (result === 'unknown') throw smtpError(550, 'Unknown recipient');
  if (result === 'full') throw smtpError(552, 'Mailbox quota exceeded');
  if (result === 'busy') throw smtpError(452, 'Storage temporarily full');
}

export function createInbound({ smtpName, tlsKey, tlsCert }, store) {
  const tls = tlsKey && tlsCert ? { key: readFileSync(tlsKey), cert: readFileSync(tlsCert) } : null;
  return new SMTPServer({
    ...tls,
    name: smtpName,
    banner: 'ITGenius Temp Mail',
    size: MAX_MAIL_BYTES,
    maxClients: 32,
    socketTimeout: 60_000,
    disableReverseLookup: true,
    authOptional: true,
    disabledCommands: tls ? ['AUTH'] : ['AUTH', 'STARTTLS'],
    onRcptTo(address, session, callback) {
      if (session.envelope.rcptTo.length >= 20) return callback(smtpError(452, 'Too many recipients'));
      try {
        return store.hasRecipient(address.address.toLowerCase())
          ? callback()
          : callback(smtpError(550, 'Unknown recipient'));
      } catch {
        return callback(smtpError(451, 'Unable to check recipient'));
      }
    },
    onData(stream, session, callback) {
      receive(stream, session, store).then(
        () => callback(null, 'Message accepted'),
        error => {
          if (error.responseCode) return callback(error);
          console.error('SMTP storage or stream error', error.code || error.name, error.message);
          return callback(smtpError(451, 'Unable to store message'));
        },
      );
    },
  });
}
