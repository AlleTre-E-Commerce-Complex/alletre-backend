import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EmailsType } from '../auth/enums/emails-type.enum';

@Injectable()
export class EmailSerivce {
  constructor() {
    /* TODO document why this constructor is empty */
  }

  private transporter = nodemailer.createTransport({
    // host: process.env.NODEMAILER_HOST,
    // port: process.env.NODEMAILER_PORT,
    service:'gmail', 
    auth: {
      user: process.env.NODEMAILER_EMAIL,
      pass: process.env.NODEMAILER_PASS,
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
            name: 'Alletre Team',
            address: process.env.EMAIL_FROM,
          },
          to: email,
          subject: `Alletre Email Verification`,
          html: `
          <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Email Verification </title>
    <style>
      /* Set background color and font styles */
      body {
        background-color: #F7F7F7;
        font-family: Arial, sans-serif;
      }
      
      /* Center the email content */
      .container {
        width: 600px;
        margin: 0 auto;
      }
      
      /* Add padding and borders to the email content */
      .content {
        padding: 40px;
        background-color: #FFFFFF;
        border-radius: 10px;
        border: 1px solid #4CAF50;
      }
      
      /* Style the heading */
      h1 {
        font-size: 32px;
        margin-top: 0;
        text-align: center;
      }
      
      /* Style the text content */
      p {
        font-size: 18px;
        margin-top: 0;
      }
      
      /* Style the button */
      .button {
        display: inline-block;
        background-color: #4CAF50;
        color: #FFFFFF;
        padding: 10px 20px;
        text-decoration: none;
        border-radius: 5px;
        margin-top: 20px;
        /* Add transition and transform properties */
        transition: transform 0.2s ease-in-out;
        transform: translateY(0);
      }

      /* Change the color of the text inside the button */
      .button span {
        color: #FFFFFF;
      }

      .button:hover {
        transform: translateY(-10px);
      } 

    </style>
  </head>
  <body>
    <div class="container">
      <div class="content">
        <h1>Verify Your Email Address</h1>
        <p>Thank you for signing up. To complete your registration, please click the button below to verify your email address:</p>
        <a class="button" href="${process.env.CLIENT_URL}/auth/activate?token=${token}" title="Click to verify your email" ><span>Verify Email</span></a>
      </div>
    </div>
  </body>
</html>

      `,
        };

      case EmailsType.RESET_PASSWORD:
        return {
          from: {
            name: 'Alletre Team',
            address: process.env.EMAIL_FROM,
          },
          to: email,
          subject: `Alletre Reset Password`,
          html: `
          <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Password Reset </title>
    <style>
      /* Set background color and font styles */
      body {
        background-color: #F7F7F7;
        font-family: Arial, sans-serif;
      }
      
      /* Center the email content */
      .container {
        width: 600px;
        margin: 0 auto;
      }
      
      /* Add padding and borders to the email content */
      .content {
        padding: 40px;
        background-color: #FFFFFF;
        border-radius: 10px;
        border: 1px solid #4CAF50;
      }
      
      /* Style the heading */
      h1 {
        font-size: 32px;
        margin-top: 0;
        text-align: center;
      }
      
      /* Style the text content */
      p {
        font-size: 18px;
        margin-top: 0;
      }
      
      /* Style the button */
      .button {
        display: inline-block;
        background-color: #4CAF50;
        color: #FFFFFF;
        padding: 10px 20px;
        text-decoration: none;
        border-radius: 5px;
        margin-top: 20px;
        /* Add transition and transform properties */
        transition: transform 0.2s ease-in-out;
        transform: translateY(0);
      }

      /* Change the color of the text inside the button */
      .button span {
        color: #FFFFFF;
      }

      .button:hover {
        transform: translateY(-10px);
      }

    </style>
  </head>
  <body>
    <div class="container">
      <div class="content">
        <h1>Reset Your Credentials</h1>
        <p>Please click the button below to reset your password:</p>
        <a class="button" href="${process.env.FRONT_URL}/credentials-update/change-password?token=${token}"><span>Reset Password</span></a>
      </div>
    </div>
  </body>
</html>
          `,
        };
    }
  }
  async sendEmail(email: string, token: string, emailType: EmailsType) {
    // console.log('token ==================**********>',token)
    const mailOptions = this.mailOptionsGenerator(email, token, emailType);
    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.log(error);
    }
  }
}
