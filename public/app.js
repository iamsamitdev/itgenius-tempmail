import { applyTranslations, lang, setLang, t } from '/i18n.js';

const $ = id => document.getElementById(id);
const els = {
  address: $('address'), copy: $('copy-button'), credentials: $('credentials'), password: $('password-value'),
  passwordToggle: $('password-toggle'), passwordCopy: $('password-copy'), refreshTop: $('refresh-top'),
  random: $('random-button'), custom: $('custom-button'), remove: $('delete-button'), usage: $('usage'),
  notice: $('notice'), list: $('message-list'), empty: $('empty-state'), count: $('message-count'),
  sync: $('sync-label'), syncText: $('sync-text'), refresh: $('refresh-button'), loadMore: $('load-more'),
  inbox: $('inbox-panel'), reader: $('reader'), frame: $('reader-frame'), text: $('reader-text'),
  menu: $('account-menu'), menuAccounts: $('menu-accounts'), avatar: $('account-avatar'),
};
const STORE_KEY = 'itg-tm-accounts';
const CURRENT_KEY = 'itg-tm-current';
const state = {
  accounts: [], current: null, me: null, messages: [], total: 0, page: 1, busy: false, ready: false,
  config: { domains: [], messageTtlDays: 7, accountTtlDays: 30 }, connection: 'offline', showPassword: false,
  open: null, images: false,
};
let stream;
let pollTimer;
let noticeTimer;
let confirmAction;

const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } },
};
const saveAccounts = () => {
  storage.set(STORE_KEY, state.accounts);
  storage.set(CURRENT_KEY, state.current?.id ?? null);
};

class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

async function api(path, { method = 'GET', body, token = state.current?.token, signal, accept = 'application/json' } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method, signal: signal ?? AbortSignal.timeout(15_000),
      headers: {
        Accept: accept,
        ...(body ? { 'Content-Type': method === 'PATCH' ? 'application/merge-patch+json' : 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(0, 'network', t('err_network'));
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data.error || data.violations?.[0]?.code || 'network';
    throw new ApiError(response.status, code, t(`err_${code}`) === `err_${code}` ? (data.message || t('err_network')) : t(`err_${code}`));
  }
  return data;
}

function flash(text, error = false) {
  clearTimeout(noticeTimer);
  els.notice.classList.toggle('error', error);
  els.notice.textContent = text === els.notice.textContent ? `${text} ` : text;
  noticeTimer = setTimeout(() => { els.notice.textContent = ''; }, error ? 7000 : 3500);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(name) {
  const node = el('i', `icon i-${name}`);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

const formatBytes = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
const locale = () => (lang === 'th' ? 'th-TH' : 'en-GB');
function formatTime(value, full = false) {
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat(locale(), full || !sameDay ? { dateStyle: 'medium', timeStyle: 'short' } : { timeStyle: 'short' }).format(date);
}
const initial = text => (text || '?').trim().charAt(0) || '?';

function randomString(length, alphabet) {
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, value => alphabet[value % alphabet.length]).join('');
}
const randomPassword = () => randomString(16, 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789');
const randomLocal = () => randomString(1, 'abcdefghijklmnopqrstuvwxyz') + randomString(9, 'abcdefghijklmnopqrstuvwxyz0123456789');

/* ---------- rendering ---------- */

function renderAccountMenu() {
  const items = state.accounts.map(account => {
    const button = el('button', `menu-item${account.id === state.current?.id ? ' active' : ''}`);
    button.type = 'button';
    const avatar = el('span', 'avatar', initial(account.address));
    avatar.setAttribute('aria-hidden', 'true');
    const address = el('span', 'menu-address', account.address);
    button.append(avatar, address);
    if (account.id === state.current?.id) button.append(icon('check'));
    button.addEventListener('click', () => { els.menu.hidePopover(); switchAccount(account.id); });
    const item = el('li');
    item.append(button);
    return item;
  });
  els.menuAccounts.replaceChildren(...items);
  els.menuAccounts.hidden = items.length === 0;
  $('menu-logout').hidden = !state.current;
  $('menu-password').hidden = !state.current;
  $('menu-delete').hidden = !state.current;
  els.avatar.textContent = initial(state.current?.address);
}

function renderAddress() {
  const account = state.current;
  els.address.value = account?.address ?? '';
  els.address.placeholder = state.ready ? t('noAddress') : t('preparing');
  const disabled = state.busy || !account;
  els.copy.disabled = disabled;
  els.remove.disabled = disabled;
  els.refreshTop.disabled = disabled;
  els.refresh.disabled = disabled;
  els.random.disabled = state.busy;
  els.credentials.hidden = !account?.password;
  if (account?.password) {
    els.password.textContent = state.showPassword ? account.password : '•'.repeat(12);
    els.passwordToggle.textContent = state.showPassword ? t('hide') : t('show');
  }
  els.usage.hidden = !state.me;
  if (state.me) {
    const ratio = Math.min(1, state.me.used / state.me.quota);
    $('usage-fill').style.width = `${Math.max(ratio * 100, state.me.used ? 2 : 0)}%`;
    $('usage-text').textContent = t('usage', { used: formatBytes(state.me.used), quota: formatBytes(state.me.quota) });
  }
  els.sync.hidden = !account;
  els.sync.toggleAttribute('data-offline', state.connection === 'offline');
  els.syncText.textContent = t(state.connection === 'live' ? 'live' : state.connection === 'polling' ? 'polling' : 'offline');
  renderAccountMenu();
}

function makeRow(message) {
  const row = el('button', `message-row${message.seen ? '' : ' unread'}`);
  row.type = 'button';
  row.dataset.messageId = message.id;
  const name = message.from?.name || message.from?.address || t('unknownSender');
  const avatar = el('span', 'avatar', initial(name));
  avatar.setAttribute('aria-hidden', 'true');
  const sender = el('span', 'row-sender');
  const senderName = el('b', '', name);
  senderName.dir = 'auto';
  sender.append(senderName);
  if (message.from?.name && message.from?.address) sender.append(el('small', '', message.from.address));
  const content = el('span', 'message-row-content');
  const subject = el('span', 'message-row-subject');
  if (message.hasAttachments) subject.append(icon('paperclip'));
  subject.append(message.subject || t('noSubject'));
  subject.dir = 'auto';
  const preview = el('span', 'message-row-preview', message.intro);
  preview.dir = 'auto';
  content.append(subject, preview);
  const end = el('span', 'row-end');
  const time = el('time', '', formatTime(message.createdAt));
  time.dateTime = message.createdAt;
  end.append(time);
  if (!message.seen) end.append(el('span', 'unread-dot'));
  row.append(avatar, sender, content, end);
  row.addEventListener('click', () => openMessage(message.id));
  const item = el('li');
  item.append(row);
  return item;
}

function renderMessages(freshId) {
  const { messages } = state;
  const unread = messages.filter(message => !message.seen).length;
  els.count.textContent = t('count', { n: state.total }) + (unread ? ` · ${t('unread', { n: unread })}` : '');
  els.list.hidden = messages.length === 0;
  els.empty.hidden = messages.length > 0;
  const [title, text] = !state.ready ? ['loadingTitle', 'loadingText'] : state.current ? ['emptyTitle', 'emptyText'] : ['noAccountTitle', 'noAccountText'];
  $('empty-title').textContent = t(title);
  $('empty-text').textContent = t(text);
  const focusId = document.activeElement?.dataset?.messageId;
  els.list.replaceChildren(...messages.map(makeRow));
  if (freshId) els.list.querySelector(`[data-message-id="${freshId}"]`)?.parentElement.classList.add('fresh');
  if (focusId) els.list.querySelector(`[data-message-id="${focusId}"]`)?.focus({ preventScroll: true });
  els.loadMore.hidden = messages.length >= state.total;
  document.title = `${unread ? `(${unread}) ` : ''}ITGenius Temp Mail`;
}

function render() {
  renderAddress();
  renderMessages();
}

/* ---------- accounts ---------- */

async function loadInbox({ manual = false } = {}) {
  const account = state.current;
  if (!account) return;
  const token = account.token;
  try {
    const [me, page] = await Promise.all([
      api('/me', { token }),
      api('/messages?page=1', { token, accept: 'application/ld+json' }),
    ]);
    if (state.current?.id !== account.id) return;
    state.me = me;
    const list = page['hydra:member'];
    const known = new Set(state.messages.map(message => message.id));
    const fresh = list.find(message => !known.has(message.id));
    state.messages = list;
    state.page = 1;
    state.total = page['hydra:totalItems'];
    renderAddress();
    renderMessages(fresh?.id);
    if (manual) flash(t('refreshed'));
    else if (fresh && known.size) flash(t('newMail', { subject: fresh.subject || t('noSubject') }));
  } catch (error) {
    if (error.status === 401) return account.token === token && state.current === account ? expireCurrent() : undefined;
    if (manual) flash(error.message, true);
  }
}

async function loadMore() {
  const account = state.current;
  try {
    const next = await api(`/messages?page=${state.page + 1}`);
    if (state.current?.id !== account.id) return;
    state.page += 1;
    const known = new Set(state.messages.map(message => message.id));
    state.messages.push(...next.filter(message => !known.has(message.id)));
    renderMessages();
  } catch (error) { flash(error.message, true); }
}

function expireCurrent() {
  const gone = state.current;
  state.accounts = state.accounts.filter(account => account.id !== gone.id);
  flash(t('sessionExpired', { address: gone.address }), true);
  selectAccount(state.accounts[0] ?? null);
  if (!state.current) createRandom();
}

function selectAccount(account) {
  stopStream();
  closeReader();
  state.current = account;
  state.me = null;
  state.messages = [];
  state.total = 0;
  state.showPassword = false;
  saveAccounts();
  render();
  if (account) {
    loadInbox();
    startStream();
  }
}

function switchAccount(id) {
  const account = state.accounts.find(item => item.id === id);
  if (!account || account.id === state.current?.id) return;
  selectAccount(account);
  flash(t('switched', { address: account.address }));
}

async function addAccount(address, password, { remember, create }) {
  if (create) await api('/accounts', { method: 'POST', body: { address, password }, token: null });
  const session = await api('/token', { method: 'POST', body: { address, password }, token: null });
  const account = { id: session.id, address, token: session.token, ...(remember ? { password } : {}) };
  state.accounts = [account, ...state.accounts.filter(item => item.id !== account.id)];
  selectAccount(account);
  return account;
}

async function createRandom() {
  if (state.busy) return;
  state.busy = true;
  renderAddress();
  try {
    const domain = state.config.domains[0];
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await addAccount(`${randomLocal()}@${domain}`, randomPassword(), { remember: true, create: true });
        flash(t('created'));
        return;
      } catch (error) {
        lastError = error;
        if (error.code !== 'taken') break;
      }
    }
    throw lastError;
  } catch (error) {
    flash(error.message, true);
  } finally {
    state.busy = false;
    state.ready = true;
    render();
  }
}

function ask(title, text, label, action) {
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  $('confirm-action').textContent = label;
  $('confirm-dialog').returnValue = '';
  confirmAction = action;
  $('confirm-dialog').showModal();
}

function logout() {
  const account = state.current;
  if (!account) return;
  const extra = account.password ? t('logoutPasswordExtra', { password: account.password }) : '';
  ask(t('confirmLogoutTitle'), t('confirmLogoutText', { extra }), t('logout'), () => {
    state.accounts = state.accounts.filter(item => item.id !== account.id);
    selectAccount(state.accounts[0] ?? null);
    flash(t('loggedOut'));
  });
}

function deleteAccount() {
  const account = state.current;
  if (!account) return;
  ask(t('confirmDeleteTitle'), t('confirmDeleteText', { address: account.address }), t('deleteAccount'), async () => {
    try {
      await api(`/accounts/${account.id}`, { method: 'DELETE', token: account.token });
    } catch (error) {
      if (error.status !== 401 && error.status !== 404) return flash(error.message, true);
    }
    state.accounts = state.accounts.filter(item => item.id !== account.id);
    selectAccount(state.accounts[0] ?? null);
    flash(t('deleted'));
  });
}

/* ---------- realtime ---------- */

function stopStream() {
  stream?.abort();
  stream = null;
  clearInterval(pollTimer);
  pollTimer = null;
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => { if (!document.hidden) loadInbox(); }, 10_000);
}

async function startStream(attempt = 0) {
  const account = state.current;
  if (!account) return;
  const controller = new AbortController();
  stream = controller;
  const token = account.token;
  try {
    const response = await fetch('/api/events', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
    if (response.status === 401) {
      if (stream === controller && account.token === token && state.current === account) expireCurrent();
      return;
    }
    if (!response.ok || !response.body) throw new Error('stream');
    state.connection = 'live';
    clearInterval(pollTimer);
    pollTimer = null;
    renderAddress();
    attempt = 0;
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let index;
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        handleEvent(buffer.slice(0, index));
        buffer = buffer.slice(index + 2);
      }
    }
    throw new Error('closed');
  } catch {
    if (controller.signal.aborted || stream !== controller) return;
    state.connection = 'polling';
    renderAddress();
    startPolling();
    setTimeout(() => { if (stream === controller) startStream(attempt + 1); }, Math.min(30_000, 2000 * 2 ** attempt));
  }
}

function handleEvent(block) {
  let type = 'message';
  const data = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) type = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return;
  let payload;
  try { payload = JSON.parse(data.join('\n')); } catch { return; }
  if (type === 'message') {
    if (state.messages.some(message => message.id === payload.id)) return;
    state.messages.unshift(payload);
    state.total += 1;
    renderMessages(payload.id);
    flash(t('newMail', { subject: payload.subject || t('noSubject') }));
    notify(payload);
  } else if (type === 'account') {
    state.me = payload;
    renderAddress();
  } else if (type === 'deleted') {
    const before = state.messages.length;
    state.messages = state.messages.filter(message => message.id !== payload.id);
    if (state.messages.length < before) state.total -= 1;
    if (state.open?.id === payload.id) closeReader();
    renderMessages();
  } else if (type === 'seen') {
    state.messages = state.messages.map(message => message.id === payload.id ? { ...message, seen: payload.seen } : message);
    renderMessages();
  }
}

function notify(message) {
  if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(message.from?.name || message.from?.address || 'Temp Mail', { body: message.subject || '', icon: '/favicon.svg' }); }
  catch { /* notifications unavailable */ }
}

/* ---------- reader ---------- */

function frameUrl() {
  return `${state.open.viewUrl}${state.images ? '&images=1' : ''}`;
}

function showTab(kind) {
  const html = kind === 'html';
  $('tab-html').setAttribute('aria-selected', String(html));
  $('tab-text').setAttribute('aria-selected', String(!html));
  els.frame.hidden = !html;
  els.text.hidden = html;
  $('images-bar').hidden = !html || state.images;
}

async function openMessage(id) {
  const account = state.current;
  if (!account) return;
  state.open = { id };
  state.images = false;
  els.inbox.hidden = true;
  els.reader.hidden = false;
  $('reader-subject').textContent = t('loadingMessage');
  for (const key of ['reader-from', 'reader-to', 'reader-time', 'reader-avatar']) $(key).textContent = '';
  els.frame.hidden = true;
  els.frame.removeAttribute('src');
  els.text.hidden = false;
  els.text.textContent = '';
  $('reader-tabs').hidden = true;
  $('reader-attachments').hidden = true;
  els.reader.scrollIntoView({ block: 'start', behavior: 'smooth' });
  try {
    const message = await api(`/messages/${id}`);
    if (state.open?.id !== id || state.current?.id !== account.id) return;
    state.open = message;
    const fromName = message.from?.name ? `${message.from.name} <${message.from.address}>` : message.from?.address;
    $('reader-subject').textContent = message.subject || t('noSubject');
    $('reader-from').textContent = fromName || t('unknownSender');
    $('reader-to').textContent = message.to.map(item => item.address).join(', ') || account.address;
    $('reader-avatar').textContent = initial(message.from?.name || message.from?.address);
    const time = $('reader-time');
    time.dateTime = message.createdAt;
    time.textContent = formatTime(message.createdAt, true);
    els.text.textContent = message.text || t('noBody');
    $('reader-download').href = `/api/messages/${id}/download?t=${encodeURIComponent(message.ticket)}`;
    $('reader-download').setAttribute('download', `${id}.eml`);
    if (message.viewUrl) {
      $('reader-tabs').hidden = false;
      els.frame.src = frameUrl();
      showTab('html');
    } else {
      showTab('text');
    }
    const files = message.attachments.filter(file => !file.related || !message.viewUrl).map(file => {
      const link = el('a');
      link.href = `/api${file.downloadUrl}?t=${encodeURIComponent(message.ticket)}`;
      link.download = file.filename;
      link.append(icon('download'), el('span', '', file.filename), el('small', '', formatBytes(file.size)));
      const item = el('li');
      item.append(link);
      return item;
    });
    $('attachment-list').replaceChildren(...files);
    $('reader-attachments').hidden = files.length === 0;
    if (!message.seen) {
      api(`/messages/${id}`, { method: 'PATCH', body: { seen: true } }).catch(() => {});
      state.messages = state.messages.map(item => item.id === id ? { ...item, seen: true } : item);
      renderMessages();
    }
  } catch (error) {
    if (error.status === 401) return expireCurrent();
    els.text.textContent = error.message;
  }
}

function closeReader() {
  if (els.reader.hidden) return;
  const id = state.open?.id;
  state.open = null;
  els.reader.hidden = true;
  els.inbox.hidden = false;
  els.frame.removeAttribute('src');
  els.list.querySelector(`[data-message-id="${id}"]`)?.focus({ preventScroll: true });
}

async function showSource() {
  const id = state.open?.id;
  if (!id) return;
  const view = $('source-view');
  view.textContent = t('loadingMessage');
  $('source-download').href = $('reader-download').href;
  $('source-download').setAttribute('download', `${id}.eml`);
  $('source-dialog').showModal();
  try {
    const source = await api(`/sources/${id}`);
    view.textContent = source.data;
  } catch (error) { view.textContent = error.message; }
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    flash(message);
    return true;
  } catch {
    flash(t('err_network'), true);
    return false;
  }
}

/* ---------- dialogs ---------- */

function openCreate() {
  els.menu.hidePopover?.();
  const select = $('create-domain');
  select.replaceChildren(...state.config.domains.map(domain => Object.assign(el('option', '', domain), { value: domain })));
  $('create-username').value = '';
  $('create-password').value = randomPassword();
  $('create-error').textContent = '';
  $('create-dialog').showModal();
  $('create-username').focus();
}

function openLogin() {
  els.menu.hidePopover?.();
  $('login-form').reset();
  $('login-error').textContent = '';
  $('login-dialog').showModal();
}

function openPassword() {
  els.menu.hidePopover?.();
  const account = state.current;
  if (!account) return;
  $('password-form').reset();
  $('password-account').textContent = account.address;
  $('password-username').value = account.address;
  $('password-current').value = account.password ?? '';
  $('password-error').textContent = '';
  $('password-dialog').showModal();
  (account.password ? $('password-new') : $('password-current')).focus();
}

async function changePassword(data) {
  const account = state.current;
  const currentPassword = String(data.get('currentPassword'));
  const password = String(data.get('password'));
  if (password !== String(data.get('confirm'))) throw new ApiError(0, 'mismatch', t('err_mismatch'));
  if (password === currentPassword) throw new ApiError(0, 'same_password', t('err_same_password'));
  const session = await api(`/accounts/${account.id}`, {
    method: 'PATCH', body: { currentPassword, password }, token: account.token,
  });
  account.token = session.token;
  if (account.password) account.password = password;
  saveAccounts();
  stopStream();
  startStream();
  renderAddress();
  flash(t('passwordChanged'));
}

async function submitForm(event, work, errorId) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  $(errorId).textContent = '';
  try {
    await work(new FormData(form));
    form.closest('dialog').close();
  } catch (error) {
    $(errorId).textContent = error.message;
  } finally {
    submit.disabled = false;
  }
}

$('create-form').addEventListener('submit', event => submitForm(event, async data => {
  const address = `${String(data.get('username')).trim().toLowerCase()}@${data.get('domain')}`;
  await addAccount(address, String(data.get('password')), { remember: true, create: true });
  flash(t('created'));
}, 'create-error'));

$('login-form').addEventListener('submit', event => submitForm(event, async data => {
  await addAccount(String(data.get('address')).trim().toLowerCase(), String(data.get('password')), { remember: false, create: false });
  flash(t('loggedIn'));
}, 'login-error'));

$('password-form').addEventListener('submit', event => submitForm(event, changePassword, 'password-error'));
$('password-generate').addEventListener('click', () => {
  const value = randomPassword();
  $('password-new').value = value;
  $('password-confirm').value = value;
});

function setPasswordVisible(button, visible) {
  $(button.dataset.togglePassword).type = visible ? 'text' : 'password';
  button.setAttribute('aria-pressed', String(visible));
  button.dataset.i18n = visible ? 'hide' : 'show';
  button.textContent = t(button.dataset.i18n);
}
for (const button of document.querySelectorAll('[data-toggle-password]')) {
  button.addEventListener('click', () => {
    setPasswordVisible(button, button.getAttribute('aria-pressed') !== 'true');
    $(button.dataset.togglePassword).focus();
  });
  button.closest('dialog').addEventListener('close', () => setPasswordVisible(button, false));
}

for (const button of document.querySelectorAll('[data-close]')) {
  button.addEventListener('click', () => button.closest('dialog').close());
}
$('generate-password').addEventListener('click', () => { $('create-password').value = randomPassword(); });
$('confirm-dialog').addEventListener('close', () => {
  if ($('confirm-dialog').returnValue === 'confirm') confirmAction?.();
  confirmAction = null;
});

/* ---------- wiring ---------- */

els.copy.addEventListener('click', async () => {
  if (!state.current) return;
  if (await copyText(state.current.address, t('copied'))) {
    els.copy.querySelector('.icon').className = 'icon i-check';
    setTimeout(() => { els.copy.querySelector('.icon').className = 'icon i-copy'; }, 2000);
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  } else {
    els.address.select();
  }
});
els.passwordToggle.addEventListener('click', () => { state.showPassword = !state.showPassword; renderAddress(); });
els.passwordCopy.addEventListener('click', () => state.current?.password && copyText(state.current.password, t('passwordCopied')));
els.refresh.addEventListener('click', () => loadInbox({ manual: true }));
els.refreshTop.addEventListener('click', () => loadInbox({ manual: true }));
els.random.addEventListener('click', createRandom);
els.custom.addEventListener('click', openCreate);
els.remove.addEventListener('click', deleteAccount);
$('load-more-button').addEventListener('click', loadMore);
$('menu-create').addEventListener('click', openCreate);
$('menu-login').addEventListener('click', openLogin);
$('menu-password').addEventListener('click', openPassword);
$('menu-logout').addEventListener('click',() => { els.menu.hidePopover(); logout(); });
$('menu-delete').addEventListener('click', () => { els.menu.hidePopover(); deleteAccount(); });
$('menu-help').addEventListener('click', () => { els.menu.hidePopover(); $('help-dialog').showModal(); });
$('help-button').addEventListener('click', () => $('help-dialog').showModal());
$('reader-back').addEventListener('click', closeReader);
$('reader-source').addEventListener('click', showSource);
$('reader-unread').addEventListener('click', async () => {
  const id = state.open?.id;
  if (!id) return;
  await api(`/messages/${id}`, { method: 'PATCH', body: { seen: false } }).catch(() => {});
  state.messages = state.messages.map(item => item.id === id ? { ...item, seen: false } : item);
  closeReader();
  renderMessages();
});
$('reader-delete').addEventListener('click', () => {
  const id = state.open?.id;
  if (!id) return;
  ask(t('confirmMessageTitle'), t('confirmMessageText'), t('deleteMessage'), async () => {
    try {
      await api(`/messages/${id}`, { method: 'DELETE' });
      const before = state.messages.length;
      state.messages = state.messages.filter(message => message.id !== id);
      if (state.messages.length < before) state.total -= 1;
      closeReader();
      renderMessages();
      flash(t('messageDeleted'));
    } catch (error) { flash(error.message, true); }
  });
});
$('tab-html').addEventListener('click', () => showTab('html'));
$('tab-text').addEventListener('click', () => showTab('text'));
$('show-images').addEventListener('click', () => {
  state.images = true;
  els.frame.src = frameUrl();
  $('images-bar').hidden = true;
});
$('source-copy').addEventListener('click', () => copyText($('source-view').textContent, t('copied')));
$('lang-button').addEventListener('click', () => {
  setLang(lang === 'th' ? 'en' : 'th');
  localize();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !els.reader.hidden && !document.querySelector('dialog[open]')) closeReader();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.current && state.connection !== 'live') loadInbox();
});

function localize() {
  applyTranslations();
  $('lang-button').textContent = lang === 'th' ? 'EN' : 'TH';
  $('faq1a').textContent = t('faq1a', { messageDays: state.config.messageTtlDays, accountDays: state.config.accountTtlDays });
  render();
}

async function initialize() {
  localize();
  try {
    state.config = await api('/config', { token: null });
  } catch {
    state.config.domains = [location.hostname];
  }
  localize();
  state.accounts = storage.get(STORE_KEY, []).filter(item => item && item.id && item.token && item.address);
  const currentId = storage.get(CURRENT_KEY, null);
  const current = state.accounts.find(item => item.id === currentId) ?? state.accounts[0];
  state.ready = true;
  if (current) selectAccount(current);
  else await createRandom();
}

initialize();
