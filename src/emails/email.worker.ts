// src/email/email.worker.ts
import { parentPort, workerData } from 'worker_threads';
import * as sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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

  try {
    console.log('test worker');
    await sgMail.sendMultiple(msg);
    parentPort?.postMessage({ success: true });
  } catch (error) {
    console.log('worker error : ', error);
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
