import nodemailer from 'nodemailer';

const to = process.argv[2];
const html = '<h2 style="color:#5435bc">ITGenius Temp Mail</h2><p>ระบบรับอีเมลทดสอบสำเร็จ รหัสยืนยันของคุณคือ <b>482913</b></p><p><a href="https://www.itgenius.co.th">itgenius.co.th</a></p>';
if (!to || !/^[a-z0-9._-]+@[a-z0-9.-]+$/i.test(to)) {
  console.error('Usage: npm run demo:mail -- <temporary-email-address>');
  process.exit(1);
}

const client = nodemailer.createTransport({
  host: '127.0.0.1',
  port: Number(process.env.SMTP_PORT || 2525),
  ignoreTLS: true,
  connectionTimeout: 5000,
  socketTimeout: 10000,
});
try {
  await client.sendMail({
    from: 'ITGenius Demo <demo@example.test>',
    to,
    subject: 'ทดสอบกล่องอีเมลชั่วคราว',
    text: 'ระบบรับอีเมลทดสอบสำเร็จ รหัสยืนยันของคุณคือ 482913',
    html,
    attachments: [{ filename: 'ทดสอบ.txt', content: 'ITGenius Temp Mail\n' }],
  });
  console.log(`Delivered to ${to}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
