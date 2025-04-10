// src/email/email.child.ts
import * as sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function cleanup() {
  try {
    // Cleanup any pending operations
    // Note: SendGrid client doesn't require explicit cleanup
    console.log('Cleaning up email child process');
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

process.on('uncaughtException', async (err) => {
  console.error(' Uncaught Exception in Child Process:', err);
  await cleanup();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error(
    ' Unhandled Rejection in Child Process:',
    promise,
    'reason:',
    reason,
  );
  await cleanup();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM signal');
  await cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT signal');
  await cleanup();
  process.exit(0);
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

  console.log(' Memory Usage Before Sending Emails:', process.memoryUsage());

  try {
    await sgMail.sendMultiple(msg);
    process.send?.({ success: true });
  } catch (error) {
    console.error(' Child Process Error:', error);
    process.send?.({ success: false, error: error.message });
  } finally {
    await cleanup();
    // Allow time for message sending before exit
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  }
}

// Listen for messages from the parent process
process.on('message', (data: any) => {
  sendBatchEmails(data.users, data.subject, data.text, data.html);
});
