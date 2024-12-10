import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EmailsType } from '../auth/enums/emails-type.enum';
import { EmailBody } from './EmailBody';

@Injectable()
export class EmailSerivce extends EmailBody {
  constructor() {
    super();
    /* TODO document why this constructor is empty */
  }

  private transporter = nodemailer.createTransport({
    // host: process.env.NODEMAILER_HOST,
    // port: process.env.NODEMAILER_PORT,
    service: 'gmail',
    auth: {
      user: process.env.NODEMAILER_EMAIL,
      pass: process.env.NODEMAILER_PASS,
    },
  });

  private mailOptionsGenerator(
    email: string,
    token: string,
    emailType: string,
    body?: any,
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
  </head>
 <body style="margin: auto; padding: 0; background-color: #ffffff; max-width: 600px; font-family: Arial, sans-serif; line-height: 1.6; color: #333; ">
    <div style="padding: 20px; text-align: center; ">
      <div
        style="
          background-color: #a91d3a;
          padding: 20px;
          color: white;
          margin: 20px auto;
          text-align: center;
          position: relative;
          max-width: 100%;
           border-radius: 15px;
        "
      >
        <img
          src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/10.png?alt=media&token=38270fdb-8c83-4fb1-b51b-4ba4682ae827"
          alt="Alletre Logo"
          style="
            max-width: 80px;
            position: absolute;
            top: 30px;
            left: 50%;
            transform: translateX(-50%);
          "
        />
        <h2 style="margin: 30px 0 20px; font-size: 24px; font-weight: bold;">Verify Your Email Address</h2>
      
     
          <div style="max-width: 600px; margin: 0 auto;">
      <p style="margin: 0;margin-top: 40px; padding: 0; font-size: 16px; font-size: min(18px, 3.5vw); line-height: 1.6;">
    Thank you for signing up. To complete your registration, please click the button below to verify your email address:
     
    </div>
    <a
          href="${process.env.CLIENT_URL}/auth/activate?token=${token}"
          title="Click to verify your email"
          style="
            display: inline-block;
            padding: 12px 20px;
            background-color: #6F6F6F;
            color: white;
            text-decoration: none;
            border-radius: 10px;
            font-weight: bold;
            margin: 60px 0;
            text-align: center;
            font-size: 18px;
             letter-spacing: 4px
          "
        >
      Verify Email
        </a>
      </div>
      
      <h3
        style="
          margin-top: 30px;
          font-size: min(24px, 5vw);
          font-weight: bold;
          color: #a91d3a;
        "
      >
     Ecommerce and Online Auctions: Revolutionizing the Digital 
Marketplace
      </h3>
      <p
        style="
          margin: 20px auto;
          font-size: 16px;
          line-height: 1.5;
          max-width: 80%;
        "
      >
    The world of ecommerce and online auctions has 
significantly transformed the way people buy and sell goods 
and services. As technology continues to evolve, both of these 
models have shaped the digital economy, offering convenience, 
access, and new opportunities for both consumers and sellers 
alike. Let's dive deeper into how ecommerce and online 
auctions work, their benefits, challenges, and how they continue 
to shape the future of retail.
      </p>

      <div style="margin: 20px 0;">
        <!-- Instagram Icon -->
        <a href="https://www.instagram.com/alletre.ae/" target="_blank" style="margin: 0 5px; display: inline-block;">
          <img
            src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/instagram%20Icon.png?alt=media&token=4ca91fcd-2e6f-476c-a0e6-fb6c81c0ac47"
            alt="Instagram"
            style="width: 30px; height: 30px;"
          />
        </a>

        <!-- Facebook Icon -->
        <a href="https://www.facebook.com/alletr.ae" target="_blank" style="margin: 0 5px; display: inline-block;">
          <img
            src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/Facebook%20Icon.png?alt=media&token=15e160e4-1bfb-4e81-9a12-1c41f83edabb"
            alt="Facebook"
            style="width: 30px; height: 30px;"
          />
        </a>

        <!-- Snapchat Icon -->
        <a href="https://www.snapchat.com/add/alletre" target="_blank" style="margin: 0 5px; display: inline-block;">
          <img
            src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/Snapchat%20Icon.png?alt=media&token=1a20756e-84f5-4e33-bf1a-f935e626e9b7"
            alt="Snapchat"
            style="width: 30px; height: 30px;"
          />
        </a>

        <!-- TikTok Icon -->
        <a href="https://www.tiktok.com/@alletre.ae" target="_blank" style="margin: 0 5px; display: inline-block;">
          <img
            src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/Tick%20Tok%20Icon.png?alt=media&token=6bb9d534-2031-4bf2-870d-a867be937d83"
            alt="TikTok"
            style="width: 30px; height: 30px;"
          />
        </a>

        <!-- YouTube Icon -->
        <a href="https://www.youtube.com/@Alletre_ae" target="_blank" style="margin: 0 5px; display: inline-block;">
          <img
            src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/Youtube%20Icon.png?alt=media&token=ccb87278-f063-4838-9b02-7ceffae7c710"
            alt="YouTube"
            style="width: 30px; height: 30px;"
          />
        </a>
      </div>

      <p
        style="
          font-size: 16px;
          margin-top: 20px;
          color: #333;
          letter-spacing: 5px
        "
      >
        www.alletre.com
      </p>
        <a
      href="https://www.alletre.com"
      style="
        display: inline-block;
        padding: 2px 8px;
        background-color: #a91d3a;
        color: white;
        text-decoration: none;
        border-radius: 5px;
        font-size: 12px;
        margin-top: 10px;
      "
    >
      Unsubscribe
    </a>
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
    <title>Reset Password </title>
  </head>
 <body style="margin: auto; padding: 0; background-color: #ffffff; max-width: 600px; font-family: Arial, sans-serif; line-height: 1.6; color: #333; ">
    <div style="padding: 20px; text-align: center; ">
      <div
        style="
          background-color: #a91d3a;
          padding: 20px;
          color: white;
          margin: 20px auto;
          text-align: center;
          position: relative;
          max-width: 100%;
           border-radius: 15px;
        "
      >
        <img
          src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/10.png?alt=media&token=38270fdb-8c83-4fb1-b51b-4ba4682ae827"
          alt="Alletre Logo"
          style="
            max-width: 80px;
            position: absolute;
            top: 30px;
            left: 50%;
            transform: translateX(-50%);
          "
        />
        <h2 style="margin: 30px 0 20px; font-size: 24px; font-weight: bold;">Reset Your Password</h2>
      
     
          <div style="max-width: 600px; margin: 0 auto;">
      <p style="margin: 0;margin-top: 40px; padding: 0; font-size: 16px; font-size: min(18px, 3.5vw); line-height: 1.6;">
  Please click the button below to reset your password:
     
    </div>
    <a
          href="${process.env.FRONT_URL}/credentials-update/change-password?token=${token}"
          title="Click to reset your password"
          style="
            display: inline-block;
            padding: 12px 20px;
            background-color: #6F6F6F;
            color: white;
            text-decoration: none;
            border-radius: 10px;
            font-weight: bold;
            margin: 60px 0;
            text-align: center;
            font-size: 18px;
             letter-spacing: 2px
          "
        >
    Reset Password
        </a>
      </div>
      
      <h3
        style="
          margin-top: 30px;
          font-size: min(24px, 5vw);
          font-weight: bold;
          color: #a91d3a;
        "
      >
     Ecommerce and Online Auctions: Revolutionizing the Digital 
Marketplace
      </h3>
      <p
        style="
          margin: 20px auto;
          font-size: 16px;
          line-height: 1.5;
          max-width: 80%;
        "
      >
    The world of ecommerce and online auctions has 
significantly transformed the way people buy and sell goods 
and services. As technology continues to evolve, both of these 
models have shaped the digital economy, offering convenience, 
access, and new opportunities for both consumers and sellers 
alike. Let's dive deeper into how ecommerce and online 
auctions work, their benefits, challenges, and how they continue 
to shape the future of retail.
      </p>

      <div style="margin: 20px 0;">
        <!-- Instagram Icon -->
        <a href="https://www.instagram.com/alletre.ae/" target="_blank" style="margin: 0 5px; display: inline-block;">
          <img
            src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/instagram%20Icon.png?alt=media&token=4ca91fcd-2e6f-476c-a0e6-fb6c81c0ac47"
            alt="Instagram"
            style="width: 30px; height: 30px;"
          />
        </a>

        <!-- Facebook Icon -->
        <a href="https://www.facebook.com/alletr.ae" target="_blank" style="margin: 0 5px; display: inline-block;">
          <img
            src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/Facebook%20Icon.png?alt=media&token=15e160e4-1bfb-4e81-9a12-1c41f83edabb"
            alt="Facebook"
            style="width: 30px; height: 30px;"
          />
        </a>

        <!-- Snapchat Icon -->
        <a href="https://www.snapchat.com/add/alletre" target="_blank" style="margin: 0 5px; display: inline-block;">
          <img
            src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/Snapchat%20Icon.png?alt=media&token=1a20756e-84f5-4e33-bf1a-f935e626e9b7"
            alt="Snapchat"
            style="width: 30px; height: 30px;"
          />
        </a>

        <!-- TikTok Icon -->
        <a href="https://www.tiktok.com/@alletre.ae" target="_blank" style="margin: 0 5px; display: inline-block;">
          <img
            src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/Tick%20Tok%20Icon.png?alt=media&token=6bb9d534-2031-4bf2-870d-a867be937d83"
            alt="TikTok"
            style="width: 30px; height: 30px;"
          />
        </a>

        <!-- YouTube Icon -->
        <a href="https://www.youtube.com/@Alletre_ae" target="_blank" style="margin: 0 5px; display: inline-block;">
          <img
            src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/Youtube%20Icon.png?alt=media&token=ccb87278-f063-4838-9b02-7ceffae7c710"
            alt="YouTube"
            style="width: 30px; height: 30px;"
          />
        </a>
      </div>

      <p
        style="
          font-size: 16px;
          margin-top: 20px;
          color: #333;
          letter-spacing: 5px
        "
      >
        www.alletre.com
      </p>
        <a
      href="https://www.alletre.com"
      style="
        display: inline-block;
        padding: 2px 8px;
        background-color: #a91d3a;
        color: white;
        text-decoration: none;
        border-radius: 5px;
        font-size: 12px;
        margin-top: 10px;
      "
    >
      Unsubscribe
    </a>
    </div>
  </body>
</html>
          `,
        };

      case EmailsType.OTHER:
        return {
          from: {
            name: 'Alletre Team',
            address: process.env.EMAIL_FROM,
          },
          to: email,
          subject: body.subject,
          html: this.emailBody(body, token),
          attachments: body.attachment
            ? [{ filename: 'invoice.pdf', content: body.attachment }]
            : [],
        };
    }
  }
  async sendEmail(
    email: string,
    token: string,
    emailType: EmailsType,
    body?: any,
  ) {
    console.log('body ==================**********>', body);
    const mailOptions = this.mailOptionsGenerator(
      email,
      token,
      emailType,
      body,
    );
    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.log(error);
    }
  }
}
