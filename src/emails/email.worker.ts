// src/email/email.worker.ts
import { parentPort, workerData } from 'worker_threads';
import * as sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception in Worker:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(
    '❌ Unhandled Rejection in Worker:',
    promise,
    'reason:',
    reason,
  );
});

async function sendBatchEmails(
  users: string[],
  subject: string,
  text: string,
  html: string,
) {
  const msg = {
    to: users,
    from: 'auctions@alletre.com',
    subject,
    text,
    html,
  };
  console.log('SENDGRID_API_KEY : ', process.env.SENDGRID_API_KEY);
  // ✅ 2. Log memory usage to check if it's consuming too much
  console.log('🛠 Memory Usage Before Sending Emails:', process.memoryUsage());

  try {
    console.log('test worker');

      await sgMail.sendMultiple(msg);
      parentPort?.postMessage({ success: true });
    
  } catch (error) {
    console.error('❌ Worker Error:', error);
    parentPort?.postMessage({ success: false, error });
  }
}

// workerData includes data passed from the main thread
sendBatchEmails(
  workerData.users,
  workerData.subject,
  workerData.text,
  workerData.html,
);
