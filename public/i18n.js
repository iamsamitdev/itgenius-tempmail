const dictionary = {
  th: {
    title: 'อีเมลชั่วคราว', intro: 'รับอีเมลได้ทันที ไม่ต้องสมัครสมาชิก ใช้กันสแปม ทดสอบระบบ หรือรับรหัสยืนยัน',
    yourAddress: 'ที่อยู่อีเมลของคุณ', preparing: 'กำลังเตรียมที่อยู่อีเมล…', noAddress: 'ยังไม่มีที่อยู่อีเมล',
    copy: 'คัดลอก', copied: 'คัดลอกแล้ว', refresh: 'รีเฟรช', random: 'สุ่มอีเมลใหม่', custom: 'ตั้งชื่อเอง',
    delete: 'ลบ', password: 'รหัสผ่าน', show: 'แสดง', hide: 'ซ่อน', passwordHint: 'ใช้รหัสผ่านนี้เข้าสู่ระบบจากอุปกรณ์อื่น',
    usage: 'ใช้ไป {used} จาก {quota}', inbox: 'กล่องข้อความ', count: '{n} ข้อความ', unread: 'ยังไม่อ่าน {n}',
    live: 'เรียลไทม์', offline: 'ขาดการเชื่อมต่อ', polling: 'อัปเดตอัตโนมัติ',
    loadingTitle: 'กำลังเปิดกล่องข้อความ', loadingText: 'ระบบกำลังเตรียมอีเมลชั่วคราวให้คุณ',
    emptyTitle: 'ยังไม่มีข้อความ', emptyText: 'เมื่อมีอีเมลส่งมาที่ที่อยู่ด้านบน ข้อความจะแสดงที่นี่ทันที',
    noAccountTitle: 'ยังไม่มีกล่องเมล', noAccountText: 'กด “สุ่มอีเมลใหม่” หรือ “เข้าสู่ระบบ” เพื่อเริ่มรับข้อความ',
    loadMore: 'โหลดข้อความเพิ่ม', unknownSender: 'ไม่ระบุผู้ส่ง', noSubject: '(ไม่มีหัวเรื่อง)',
    help: 'วิธีใช้งาน', api: 'API', accounts: 'บัญชี', myAccounts: 'บัญชีในเบราว์เซอร์นี้',
    createAccount: 'สร้างบัญชี (ตั้งชื่อเอง)', login: 'เข้าสู่ระบบ', logout: 'ออกจากระบบ', deleteAccount: 'ลบบัญชี',
    username: 'ชื่อผู้ใช้', domain: 'โดเมน', address: 'อีเมล', generate: 'สุ่มรหัส', cancel: 'ยกเลิก', create: 'สร้างบัญชี',
    usernameHint: 'ตัวอักษร a-z ตัวเลข จุด ขีด หรือขีดล่าง 3–64 ตัว', passwordRule: 'อย่างน้อย 6 ตัวอักษร',
    loginText: 'ใช้อีเมลและรหัสผ่านเพื่อเปิดกล่องเมลเดิมจากอุปกรณ์ใดก็ได้',
    from: 'จาก', to: 'ถึง', back: 'กลับ', download: 'ดาวน์โหลด .eml', source: 'ดูต้นฉบับ', markUnread: 'ทำเป็นยังไม่อ่าน',
    deleteMessage: 'ลบข้อความ', attachments: 'ไฟล์แนบ', htmlTab: 'HTML', textTab: 'ข้อความ', showImages: 'แสดงรูปภาพภายนอก',
    imagesBlocked: 'ซ่อนรูปภาพภายนอกไว้เพื่อความเป็นส่วนตัว', loadingMessage: 'กำลังโหลดข้อความ…', noBody: 'ไม่มีเนื้อหา',
    sourceTitle: 'ต้นฉบับข้อความ', close: 'ปิด', copySource: 'คัดลอกต้นฉบับ',
    confirmDeleteTitle: 'ลบบัญชีนี้?', confirmDeleteText: 'ระบบจะลบ {address} และข้อความทั้งหมดอย่างถาวร กู้คืนไม่ได้',
    confirmLogoutTitle: 'ออกจากระบบ?', confirmLogoutText: 'บัญชียังอยู่บนเซิร์ฟเวอร์ คุณเข้าสู่ระบบใหม่ได้ด้วยอีเมลและรหัสผ่าน{extra}',
    logoutPasswordExtra: ' โปรดจดรหัสผ่านไว้ก่อน: {password}',
    confirmMessageTitle: 'ลบข้อความนี้?', confirmMessageText: 'ระบบจะลบข้อความและไฟล์แนบอย่างถาวร',
    newMail: 'มีอีเมลใหม่: {subject}', created: 'สร้างอีเมลใหม่แล้ว', loggedIn: 'เข้าสู่ระบบแล้ว', loggedOut: 'ออกจากระบบแล้ว',
    deleted: 'ลบบัญชีแล้ว', messageDeleted: 'ลบข้อความแล้ว', switched: 'สลับไปที่ {address}', refreshed: 'อัปเดตกล่องข้อความแล้ว',
    passwordCopied: 'คัดลอกรหัสผ่านแล้ว', sessionExpired: 'บัญชี {address} หมดอายุหรือถูกลบแล้ว',
    err_rate_limited: 'ทำรายการบ่อยเกินไป ลองใหม่ในอีกสักครู่', err_capacity: 'ระบบเต็มชั่วคราว ลองใหม่ภายหลัง',
    err_taken: 'ชื่อนี้มีผู้ใช้แล้ว ลองชื่ออื่น', err_invalid: 'ชื่อผู้ใช้ไม่ถูกต้อง ใช้ a-z 0-9 . _ - ยาว 3–64 ตัว',
    err_reserved: 'ชื่อนี้สงวนไว้ ลองชื่ออื่น', err_password: 'รหัสผ่านต้องยาว 6–128 ตัวอักษร',
    err_credentials: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', err_not_found: 'ไม่พบข้อความนี้', err_domain: 'ไม่รองรับโดเมนนี้',
    err_network: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองอีกครั้ง',
    helpTitle: 'วิธีใช้งาน', faqTitle: 'คำถามที่พบบ่อย',
    help1: 'ระบบสร้างอีเมลสุ่มให้อัตโนมัติ กด “คัดลอก” แล้วนำไปกรอกในเว็บที่ต้องการ',
    help2: 'อีเมลที่ส่งเข้ามาจะแสดงในกล่องข้อความทันทีแบบเรียลไทม์ ไม่ต้องรีเฟรช',
    help3: 'กด “ตั้งชื่อเอง” เพื่อเลือกชื่ออีเมลและรหัสผ่าน แล้วเข้าสู่ระบบจากอุปกรณ์อื่นได้',
    help4: 'มีหลายบัญชีได้ในเบราว์เซอร์เดียว สลับได้จากเมนู “บัญชี” มุมขวาบน',
    faq1q: 'ข้อความเก็บไว้นานเท่าไร?', faq1a: 'ข้อความถูกลบอัตโนมัติหลัง {messageDays} วัน และบัญชีที่ไม่ได้ใช้งาน {accountDays} วันจะถูกลบ',
    faq2q: 'ส่งอีเมลออกได้ไหม?', faq2a: 'ไม่ได้ ระบบนี้รับอีเมลอย่างเดียวเพื่อป้องกันการใช้ส่งสแปม',
    faq3q: 'ปลอดภัยไหม?', faq3a: 'ผู้ที่รู้รหัสผ่านเท่านั้นที่เปิดกล่องเมลได้ อย่าใช้รับข้อมูลสำคัญหรือบัญชีที่ต้องกู้คืนภายหลัง',
    faq4q: 'ใช้กับโปรแกรมอัตโนมัติได้ไหม?', faq4a: 'ได้ ระบบมี REST API สำหรับสร้างกล่องเมลและอ่านข้อความ ดูรายละเอียดที่หน้า API',
    footer: 'ระบบลบข้อความอัตโนมัติ · รับอย่างเดียว ไม่ส่งออก', received: 'รับเมื่อ',
    changePassword: 'เปลี่ยนรหัสผ่าน', currentPassword: 'รหัสผ่านปัจจุบัน', newPassword: 'รหัสผ่านใหม่',
    confirmPassword: 'ยืนยันรหัสผ่านใหม่', savePassword: 'บันทึกรหัสผ่าน',
    passwordWarning: 'ไม่มีระบบกู้คืนรหัสผ่าน หากลืมจะเปิดกล่องเมลนี้ไม่ได้อีก อุปกรณ์อื่นที่เข้าสู่ระบบไว้จะถูกออกจากระบบ',
    passwordChanged: 'เปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นถูกออกจากระบบ', err_mismatch: 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน',
    err_same_password: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม', err_current_password: 'รหัสผ่านปัจจุบันไม่ถูกต้อง',
  },
  en: {
    title: 'Temporary email', intro: 'Get a disposable inbox instantly. No sign-up. Avoid spam, test sign-ups, receive codes.',
    yourAddress: 'Your email address', preparing: 'Preparing your address…', noAddress: 'No address yet',
    copy: 'Copy', copied: 'Copied', refresh: 'Refresh', random: 'New random', custom: 'Custom address',
    delete: 'Delete', password: 'Password', show: 'Show', hide: 'Hide', passwordHint: 'Use this password to log in from another device',
    usage: '{used} of {quota} used', inbox: 'Inbox', count: '{n} messages', unread: '{n} unread',
    live: 'Live', offline: 'Offline', polling: 'Auto refresh',
    loadingTitle: 'Opening your inbox', loadingText: 'Preparing a temporary address for you',
    emptyTitle: 'Your inbox is empty', emptyText: 'Messages sent to the address above will appear here instantly',
    noAccountTitle: 'No inbox yet', noAccountText: 'Choose “New random” or “Log in” to start receiving mail',
    loadMore: 'Load more', unknownSender: 'Unknown sender', noSubject: '(no subject)',
    help: 'Help', api: 'API', accounts: 'Accounts', myAccounts: 'Accounts in this browser',
    createAccount: 'Create custom account', login: 'Log in', logout: 'Log out', deleteAccount: 'Delete account',
    username: 'Username', domain: 'Domain', address: 'Email', generate: 'Generate', cancel: 'Cancel', create: 'Create account',
    usernameHint: '3–64 letters a-z, digits, dots, dashes or underscores', passwordRule: 'At least 6 characters',
    loginText: 'Use the address and password to open the same inbox from any device',
    from: 'From', to: 'To', back: 'Back', download: 'Download .eml', source: 'View source', markUnread: 'Mark as unread',
    deleteMessage: 'Delete message', attachments: 'Attachments', htmlTab: 'HTML', textTab: 'Text', showImages: 'Show external images',
    imagesBlocked: 'External images are hidden for privacy', loadingMessage: 'Loading message…', noBody: 'No content',
    sourceTitle: 'Message source', close: 'Close', copySource: 'Copy source',
    confirmDeleteTitle: 'Delete this account?', confirmDeleteText: '{address} and all its messages will be deleted permanently.',
    confirmLogoutTitle: 'Log out?', confirmLogoutText: 'The account stays on the server and you can log in again with its password.{extra}',
    logoutPasswordExtra: ' Save the password first: {password}',
    confirmMessageTitle: 'Delete this message?', confirmMessageText: 'The message and its attachments will be deleted permanently.',
    newMail: 'New mail: {subject}', created: 'New address created', loggedIn: 'Logged in', loggedOut: 'Logged out',
    deleted: 'Account deleted', messageDeleted: 'Message deleted', switched: 'Switched to {address}', refreshed: 'Inbox updated',
    passwordCopied: 'Password copied', sessionExpired: 'Account {address} has expired or was deleted',
    err_rate_limited: 'Too many requests, try again shortly', err_capacity: 'Service is busy, try again later',
    err_taken: 'That address is taken, try another', err_invalid: 'Invalid username: use a-z 0-9 . _ - (3–64 chars)',
    err_reserved: 'That name is reserved, try another', err_password: 'Password must be 6–128 characters',
    err_credentials: 'Wrong email or password', err_not_found: 'Message not found', err_domain: 'Domain not available',
    err_network: 'Could not reach the server, try again',
    helpTitle: 'How it works', faqTitle: 'FAQ',
    help1: 'A random address is created for you. Copy it and use it anywhere.',
    help2: 'Incoming mail shows up in real time, no refresh needed.',
    help3: 'Use “Custom address” to choose a name and password, then log in from other devices.',
    help4: 'Keep several accounts in one browser and switch from the Accounts menu.',
    faq1q: 'How long are messages kept?', faq1a: 'Messages are deleted after {messageDays} days and accounts unused for {accountDays} days are removed.',
    faq2q: 'Can I send mail?', faq2a: 'No. The service only receives mail to prevent abuse.',
    faq3q: 'Is it private?', faq3a: 'Only people with the password can open an inbox. Do not use it for important accounts you may need to recover.',
    faq4q: 'Is there an API?', faq4a: 'Yes, a REST API for creating inboxes and reading messages. See the API page.',
    footer: 'Messages auto-delete · receive only', received: 'Received',
    changePassword: 'Change password', currentPassword: 'Current password', newPassword: 'New password',
    confirmPassword: 'Confirm new password', savePassword: 'Save password',
    passwordWarning: 'There is no password recovery. If you forget it, this inbox cannot be opened again. Other signed-in devices will be logged out.',
    passwordChanged: 'Password changed. Other devices were logged out.', err_mismatch: 'The new passwords do not match',
    err_same_password: 'The new password must differ from the current one', err_current_password: 'Current password is incorrect',
  },
};

const stored = (() => { try { return localStorage.getItem('itg-tm-lang'); } catch { return null; } })();
export let lang = stored === 'en' || stored === 'th' ? stored : (navigator.language?.startsWith('th') ? 'th' : 'en');

export function t(key, vars = {}) {
  const text = dictionary[lang][key] ?? dictionary.th[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
}

export function applyTranslations(root = document) {
  document.documentElement.lang = lang;
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of node.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':');
      node.setAttribute(attr, t(key));
    }
  }
}

export function setLang(next) {
  lang = next;
  try { localStorage.setItem('itg-tm-lang', next); } catch { /* storage unavailable */ }
  applyTranslations();
}
