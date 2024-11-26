// src/email/email.service.ts
import { Injectable } from '@nestjs/common';
import * as sgMail from '@sendgrid/mail';

@Injectable()
export class SendGridEmailService {
  constructor() {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  }

  async sendEmail(to: string[], subject: string, text: string, html: string) {
    const msg = {
      to,
      from: 'info@alletre.com', // Use your verified SendGrid email
      subject,
      text,
      html,
    };

    try {
      await sgMail.sendMultiple(msg); // sendMultiple for bulk emails
    } catch (error) {
      console.error('Error sending email:', error);
    }
  }
}
