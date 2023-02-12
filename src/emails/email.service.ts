import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailSerivce {
  constructor() {
    /* TODO document why this constructor is empty */
  }

  private transporter = nodemailer.createTransport({
    host: 'smtp.zoho.com',
    secure: true,
    port: 465,
    auth: {
      user: process.env.EMAIL_FROM,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  async sendEmail(email: string, token: string) {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: `Allatre Email Verification`,
      html: `<h1>Please use the activation link to activate your account </h1>
      <p>${process.env.CLIENT_URL}/auth/activate?token=${token}</p>`,
    };
    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.log(error);
    }
  }
}
