import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EmailsType } from '../auth/enums/emails-type.enum';

@Injectable()
export class EmailSerivce {
  constructor() {
    /* TODO document why this constructor is empty */
  }

  private transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    secure: true,
    port: 465,
    auth: {
      user: process.env.EMAIL_FROM,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  private mailOptionsGenerator(
    email: string,
    token: string,
    emailType: string,
  ) {
    switch (emailType) {
      case EmailsType.VERIFICATION:
        return {
          from: {
            name: 'Allatre Team',
            address: process.env.EMAIL_FROM,
          },
          to: email,
          subject: `Allatre Email Verification`,
          html: `<h1>Please use the activation link to activate your account </h1>
          <p>${process.env.CLIENT_URL}/auth/activate?token=${token}</p>`,
        };

      case EmailsType.RESET_PASSWORD:
        return {
          from: {
            name: 'Allatre Team',
            address: process.env.EMAIL_FROM,
          },
          to: email,
          subject: `Allatre Reset Password`,
          html: `<h1>Please use the link to reset your password </h1>
          <p>${process.env.FRONT_URL}/auth/credentials-update?token=${token}</p>`,
        };
    }
  }
  async sendEmail(email: string, token: string, emailType: EmailsType) {
    const mailOptions = this.mailOptionsGenerator(email, token, emailType);
    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.log(error);
    }
  }
}
