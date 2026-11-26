# ITGenius Temp Mail

ระบบอีเมลชั่วคราว (Temporary / Disposable Email) ที่ให้บริการอยู่ที่ https://tm.itgenius.co.th

- **Backend:** Node.js (>= 24.14) — HTTP API + SMTP server ในตัว (`smtp-server`, `mailparser`), เก็บข้อมูลใน SQLite (`node:sqlite`)
- **Frontend:** HTML/CSS/JS ล้วนในโฟลเดอร์ `public/` (ภาษาไทย/อังกฤษ)
- **API docs:** `public/docs.html` (เปิดที่ `/docs.html`)

## โครงสร้าง

```
server/     index.js (entry + config), http.js (REST API + SSE), inbound.js (SMTP), store.js (SQLite)
public/     หน้าเว็บ
scripts/    demo-mail.js — ส่งอีเมลทดสอบเข้า SMTP ในเครื่อง
deploy/     ตัวอย่าง systemd unit และ nginx reverse proxy ที่ใช้บน production
```

## รันในเครื่อง

```bash
npm install
npm run dev          # HTTP: http://127.0.0.1:3000 (ค่าเริ่มต้น), SMTP: 127.0.0.1:2525
npm run demo:mail    # ส่งเมลทดสอบ
```

## Environment variables

| ตัวแปร | ความหมาย |
|---|---|
| `PUBLIC_ORIGIN` | URL สาธารณะของเว็บ |
| `MAIL_DOMAINS` | โดเมนที่รับเมล (คั่นด้วย comma) |
| `SMTP_NAME` | ชื่อเซิร์ฟเวอร์ SMTP |
| `HTTP_HOST` / `HTTP_PORT` | ที่อยู่ HTTP server |
| `SMTP_HOST` / `SMTP_PORT` | ที่อยู่ SMTP server |
| `SMTP_TLS_KEY` / `SMTP_TLS_CERT` | ไฟล์ TLS สำหรับ STARTTLS (ไม่บังคับ) |
| `DATABASE_PATH` | ไฟล์ SQLite (ค่าเริ่มต้น `data/tempmail.sqlite`) |
| `APP_SECRET` | secret สำหรับ sign ข้อมูล — ถ้าไม่ตั้ง จะสร้าง `secret.key` ไว้ข้างไฟล์ฐานข้อมูล |
| `TRUST_PROXY` | ตั้งเป็น `1` เมื่ออยู่หลัง reverse proxy |
| `RATE_*` | ค่า rate limit (ดู `server/index.js`) |

> อย่า commit ไฟล์ฐานข้อมูลหรือ `secret.key` ขึ้น repo
