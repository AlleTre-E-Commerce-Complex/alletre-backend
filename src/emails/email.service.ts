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
    userName?: string,
  ) {
    switch (emailType) {
      case EmailsType.VERIFICATION:
        return {
          from: {
            name: 'Alletre Team',
            address: process.env.EMAIL_FROM,
          },
          to: email,
          subject: `📨 Please Verify Your Email to Get Started`,
          html: `
          <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Email Verification </title>
  </head>
<body style="margin: auto; padding: 0; background-color: #ffffff; max-width: 600px; font-family: Montserrat; line-height: 1.6; color: #a; ">
  <div style="padding: 20px; text-align: center;">
    <div
      style="
        background-color: #F9F9F9;
        padding: 20px;
        color: white;
        margin: 40px auto;
        text-align: center;
        position: relative;
        max-width: 100%;
        border-radius: 15px;
      "
    >
      <img
        src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/logoForEmail.png?alt=media&token=8e56c373-b4d6-404f-8d2c-a503dfa71052"
        alt="Alletre Logo"
        style="
          max-width: 80px;
          position: absolute;
          padding-top: 20px;
          display: block;
        "
      />
      <h3
        style="
          margin-top: 30px;
          font-size: min(22px, 4vw); /* Smaller size for mobile */
          font-weight: bold;
          color: #a91d3a;
        "
      >
       Welcome to Alletre – Verify Your Email
      </h3>
      <h2 style="margin: 50px 0px 19px;  font-size: min(17px, 3vw);  color: #333; text-align: left; font-weight: 500">
        Hi, ${userName}
      </h2>

      <div
        style="
          margin: 20px auto;
          font-size: min(15px, 3vw); /* Adjust font size for mobile */
          line-height: 1.2; /* Slightly tighter line height for mobile */
          max-width: 90%; /* Ensure proper fit on smaller screens */
          color:  #333;
          text-align: left;
        "
      >
        <p>
         Thank you for joining <b>Alletre</b>! To complete your registration and start bidding, we just need you to verify your email address.
        </p>
      <p>Please click the button below to verify your email:</p>


       

        <div style="text-align: center;">
          <a
            href="${process.env.CLIENT_URL}/auth/activate?token=${token}"
            style="
              display: inline-block;
              padding: 12px 20px;
              background-color: #a91d3a !important;
              -webkit-background-color: #a91d3a !important;
              -moz-background-color: #a91d3a !important;
              color: #ffffff !important;
              text-decoration: none;
              border-radius: 10px;
              font-weight: bold;
              margin: 20px 0;
              font-size: 18px;
            "
          >
            Verify My Email 
          </a>
      
    
      </div>
     
         
     

        <h3>Why Verify Your Email?</h3>
       <p style="color: #707070; font-size: min(13px, 3vw);">
  <img src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/tick%20mark%20icon.jpg?alt=media&token=20f3d486-c83e-4cae-9876-f15391cc3682" 
       alt="tick" 
       style="width: 16px; position: relative; "> 
  Secure your account and protect your bids<br>
  <img src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/tick%20mark%20icon.jpg?alt=media&token=20f3d486-c83e-4cae-9876-f15391cc3682" 
       alt="tick" 
       style="width: 16px; position: relative; "> 
  Receive important updates and notifications<br>
  <img src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/tick%20mark%20icon.jpg?alt=media&token=20f3d486-c83e-4cae-9876-f15391cc3682" 
       alt="tick" 
       style="width: 16px; position: relative;"> 
  Get ready to start bidding and listing items
</p>



        
 <p style="font-size: min(13px, 3vw);  color: #707070;">If you didn’t sign up for an account with us, please ignore this email.</p>
   
     
        <p>Thank you for choosing  <b>Alletre</b> . We’re excited to have you as part of our community!</p>
       <p>Best regards,<br>
The <b>Alletre</b> Team
</p>
        <p>If you need assistance, feel free to reach out to our support team anytime!</p>
         </div>
       <h3
  style="
    margin: 30px auto 20px auto; /* Matches auto margins of the p element */
    font-size: min(16px, 4vw); /* Smaller size for mobile */
    font-weight: bold;
    color: #a91d3a;
    text-align: left; /* Align text to the left */
    max-width: 90%; /* Ensure proper fit and alignment */
  "
>
  Ecommerce and Online Auctions: Revolutionizing the Digital Marketplace
</h3>
<p
  style="
    margin: 20px auto;
    font-size: min(13px, 3vw); /* Adjust font size for mobile */
    line-height: 1.4; /* Slightly tighter line height for mobile */
    max-width: 90%; /* Ensure proper fit on smaller screens */
    text-align: left;
    color: #707070;
  "
>
  The world of ecommerce and online auctions has significantly transformed the way people buy and sell goods and services. As technology continues to evolve, both of these models have shaped the digital economy, offering convenience, access, and new opportunities for both consumers and sellers alike. Let's dive deeper into how ecommerce and online auctions work, their benefits, challenges, and how they continue to shape the future of retail.
</p>



<p style = "font-size: min(16px, 4vw); color:#707070">FOLLOW US!</p>
      <div style="margin: 20px 0 ;">
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
          margin-top: -20px;
          color: #333;
          letter-spacing: 4px
        "
      >
        www.alletre.com
      </p>

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
          subject: `🔒 Reset Your Password for Alletre`,
          html: `
          <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>🔒 Reset Your Password for Alletre </title>
  </head>
 
  <html>
    <head>
   
    </head>
<body style="margin: auto; padding: 0; background-color: #ffffff; max-width: 600px; font-family: Montserrat; line-height: 1.6; color: #a; ">
  <div style="padding: 20px; text-align: center;">
    <div
      style="
        background-color: #F9F9F9;
        padding: 20px;
        color: white;
        margin: 40px auto;
        text-align: center;
        position: relative;
        max-width: 100%;
        border-radius: 15px;
      "
    >
      <img
        src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/logoForEmail.png?alt=media&token=8e56c373-b4d6-404f-8d2c-a503dfa71052"
        alt="Alletre Logo"
        style="
          max-width: 80px;
          position: absolute;
          padding-top: 20px;
          display: block;
        "
      />
      <h3
        style="
          margin-top: 30px;
          font-size: min(22px, 4vw); /* Smaller size for mobile */
          font-weight: bold;
          color: #a91d3a;
        "
      >
      Forgot Your Password? Let’s Get You Back On Track!
      </h3>
      <h2 style="margin: 50px 0px 19px;  font-size: min(17px, 3vw);  color: #333; text-align: left; font-weight: 500">
        Hi, ${userName}
      </h2>

      <div
        style="
          margin: 20px auto;
          font-size: min(15px, 3vw); /* Adjust font size for mobile */
          line-height: 1.2; /* Slightly tighter line height for mobile */
          max-width: 90%; /* Ensure proper fit on smaller screens */
          color:  #333;
          text-align: left;
        "
      >
        <p>
        We received a request to reset the password for your  <b>Alletre</b>  account. If you didn’t request this, please ignore this email. Otherwise, click the button below to securely reset your password.
        </p>
        
        <div style="text-align: center;">
          <a
            href="${process.env.FRONT_URL}/credentials-update/change-password?token=${token}"
            style="
              display: inline-block;
              padding: 12px 20px;
              background-color: #a91d3a !important;
              -webkit-background-color: #a91d3a !important;
              -moz-background-color: #a91d3a !important;
              color: #ffffff !important;
              text-decoration: none;
              border-radius: 10px;
              font-weight: bold;
              margin: 20px 0;
              font-size: 18px;
            "
          >
           Reset My Password  
          </a>
      
    
      </div>
     
         
     

        <h3>Why Reset Your Password?</h3>
       <p style="color: #707070; font-size: min(13px, 3vw);">
  <img src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/tick%20mark%20icon.jpg?alt=media&token=20f3d486-c83e-4cae-9876-f15391cc3682" 
       alt="tick" 
       style="width: 16px; position: relative; "> 
  Quickly regain access to your account<br>
  <img src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/tick%20mark%20icon.jpg?alt=media&token=20f3d486-c83e-4cae-9876-f15391cc3682" 
       alt="tick" 
       style="width: 16px; position: relative; "> 
  Keep your account secure<br>
  <img src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/tick%20mark%20icon.jpg?alt=media&token=20f3d486-c83e-4cae-9876-f15391cc3682" 
       alt="tick" 
       style="width: 16px; position: relative;"> 
  Start bidding and listing items without delay
</p>



        
 <p style="font-size: min(13px, 3vw);  color: #707070;">The link will expire in 7 minutes, so be sure to reset your password as soon as possible.</p>
   
     
      <p>  If you need further assistance, feel free to reach out to our support team. We’re here to help!</p>
       <p>Thank you for being part of <b>Alletre</b>  </p>
       <p>Best regards,<br>
The <b>Alletre</b> Team
</p>
        <p>P.S. Stay secure! Make sure your new password is strong and unique.</p>
         </div>
       <h3
  style="
    margin: 30px auto 20px auto; /* Matches auto margins of the p element */
    font-size: min(16px, 4vw); /* Smaller size for mobile */
    font-weight: bold;
    color: #a91d3a;
    text-align: left; /* Align text to the left */
    max-width: 90%; /* Ensure proper fit and alignment */
  "
>
  Ecommerce and Online Auctions: Revolutionizing the Digital Marketplace
</h3>
<p
  style="
    margin: 20px auto;
    font-size: min(13px, 3vw); /* Adjust font size for mobile */
    line-height: 1.4; /* Slightly tighter line height for mobile */
    max-width: 90%; /* Ensure proper fit on smaller screens */
    text-align: left;
    color: #707070;
  "
>
  The world of ecommerce and online auctions has significantly transformed the way people buy and sell goods and services. As technology continues to evolve, both of these models have shaped the digital economy, offering convenience, access, and new opportunities for both consumers and sellers alike. Let's dive deeper into how ecommerce and online auctions work, their benefits, challenges, and how they continue to shape the future of retail.
</p>



<p style = "font-size: min(16px, 4vw); color:#707070">FOLLOW US!</p>
      <div style="margin: 20px 0 ;">
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
          margin-top: -20px;
          color: #333;
          letter-spacing: 4px
        "
      >
        www.alletre.com
      </p>

    </div>
  </body>
  </html>

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
    userName?: string,
  ) {
    const mailOptions = this.mailOptionsGenerator(
      email,
      token,
      emailType,
      body,
      userName,
    );
    try {
      const sendEmailresult = await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.log(error);
    }
  }
}
