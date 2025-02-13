// src/email/email.child.ts
import * as sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception in Child Process:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection in Child Process:', promise, 'reason:', reason);
});

async function sendBatchEmails(users: string[], subject: string, text: string, html: string) {
  const msg = {
    to: users,
    from: 'auctions@alletre.com',
    subject,
    text,
    html,
  };
  
  console.log('SENDGRID_API_KEY : ', process.env.SENDGRID_API_KEY);
  console.log('🛠 Memory Usage Before Sending Emails:', process.memoryUsage());

  try {
    console.log('test child process 1');
    await sgMail.sendMultiple(msg);
    console.log('test child process 2');
    process.send?.({ success: true });
    console.log('test child process 3');
    process.exit(0); 

  } catch (error) {
    console.error('❌ Child Process Error:', error);
    process.send?.({ success: false, error });
  }finally {
    process.exit(0)
  }
}

// Listen for messages from the parent process
process.on('message', (data:any) => {
  sendBatchEmails(data.users, data.subject, data.text, data.html);
});
