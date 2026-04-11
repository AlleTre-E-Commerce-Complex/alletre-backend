import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EmailsType } from '../auth/enums/emails-type.enum';
import { EmailBody } from './EmailBody';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailBatchService } from './email-batch.service';

@Injectable()
export class EmailSerivce extends EmailBody {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly emailBatchService: EmailBatchService,
  ) {
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
        const verificationLink = `${process.env.CLIENT_URL}/auth/activate?token=${token}`;
        return {
          from: {
            name: '3arbon Team',
            address: process.env.EMAIL_FROM,
          },
          to: email,
          subject: `📨 Please Verify Your Email to Get Started`,
          html: `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>3arbon Email Verification</title>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
        :root {
            color-scheme: light dark;
            supported-color-schemes: light dark;
        }

        @media only screen and (max-width: 480px) {
            .mobile-h1 { font-size: 24px !important; }
            .mobile-text { font-size: 14px !important; padding: 10px 30px !important; text-align: left !important; }
            .mobile-greeting { font-size: 16px !important; }
            .mobile-button { padding: 14px 30px !important; font-size: 14px !important; }
        }

        @media (prefers-color-scheme: dark) {
            .body-bg { background-color: #111111 !important; }
            .content-bg { background-color: #111111 !important; }
            .header-bg { background-color: #1a222f !important; background-image: linear-gradient(#1a222f, #1a222f) !important; }
            .footer-bg { background-color: #1a222f !important; background-image: linear-gradient(#1a222f, #1a222f) !important; border-radius: 0 0 8px 8px; }
            .main-text { color: #e9ecef !important; }
            .sub-text { color: #adb5bd !important; text-align: center !important; }
            .heading-text { color: #ffffff !important; }
            .footer-text { color: #ffffff !important; }
            .box-bg { background-color: #1a222f !important; border: 1px solid #2d3748 !important; }
            .button-lock { background-color: #1e2633 !important; color: #ffffff !important; }
            .force-white { color: #ffffff !important; }
        }

        /* Forced Dark Mode Logic */
        [data-ogsc] .heading-text { color: #ffffff !important; }
        [data-ogsc] .footer-text { color: #ffffff !important; }
        [data-ogsc] .force-white { color: #ffffff !important; }
        [data-ogsc] .button-lock { background-color: #1e2633 !important; color: #ffffff !important; }
    </style>
</head>
<body class="body-bg" style="margin: 0; padding: 0; background-color: #e9ecef; font-family: 'Montserrat', sans-serif; -webkit-font-smoothing: antialiased;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" class="body-bg" style="background-color: #e9ecef; padding: 40px 0;">
        <tr>
            <td align="center">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" class="content-bg" style="max-width: 600px; background-color: #f4f5f7; border-radius: 8px; overflow: hidden; box-shadow: 0 8px 25px rgba(0,0,0,0.06);">
                    
                    <tr>
                        <td align="left" class="header-bg" style="background-color: #1e2633; background-image: linear-gradient(#1e2633, #1e2633); padding: 25px 40px; border-bottom: 2px solid #d4af37;">
                            <a href="https://3arbon.com" style="text-decoration: none;">
                                <img src="https://firebasestorage.googleapis.com/v0/b/alletre-auctions.firebasestorage.app/o/g217.png?alt=media&token=fc1c5fac-7f9c-48a1-8cf4-b41819ddeda5" 
                                     alt="3arbon" 
                                     style="display: block; border: 0; height: 35px; width: auto;">
                            </a>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding: 50px 0 10px 0;">
                            <div style="background-color: #1e2633; background-image: linear-gradient(#1e2633, #1e2633); width: 64px; height: 64px; border-radius: 50%; display: table; margin: 0 auto;">
                               <div style="display: table-cell; vertical-align: middle; text-align: center; padding: 0;">
                                    <img src="https://img.icons8.com/ios-filled/50/d4af37/ok.png" width="32" height="32" alt="Verify" style="display: block; margin: 0 auto;">
                                </div>
                            </div>
                            <p style="color: #d4af37; text-transform: uppercase; letter-spacing: 3px; font-size: 11px; margin-top: 20px; font-weight: 700;">Email Verification</p>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding: 10px 40px 20px 40px;">
                            <h1 class="mobile-h1 heading-text" style="color: #1e2633; font-size: 32px; margin: 0; font-weight: 700;">Verify Your Email</h1>
                            <div style="width: 50px; height: 3px; background-color: #d4af37; margin: 15px auto 0 auto;"></div>
                        </td>
                    </tr>

                    <tr>
                        <td class="mobile-text main-text" style="padding: 20px 60px; color: #515b6f; font-size: 16px; line-height: 1.8; text-align: left;">
                            <p class="mobile-greeting heading-text" style="font-weight: 700; color: #1e2633; font-size: 18px; margin-bottom: 10px; margin-top: 0;">Hi, ${userName}</p>
                            <p style="margin: 0;">Thank you for joining <strong>3arbon</strong>! To complete your registration and start listing, we just need you to verify your email address.</p>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding: 20px 40px 40px 40px;">
                            <a href="${verificationLink}" class="mobile-button button-lock force-white" style="background-color: #1a222f; background-image: linear-gradient(#1a222f, #1a222f); color: #ffffff !important; padding: 18px 50px; text-decoration: none; border-radius: 4px; font-weight: 700; font-size: 16px; display: inline-block; border-bottom: 4px solid #d4af37; transition: all 0.3s ease;">
                                <span class="force-white" style="color: #d4af37 !important; font-weight: 700; text-shadow: 0 0 1px #ffffff, 0 0 1px #ffffff;"><font color="#d4af37">Verify My Email</font></span>
                            </a>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding: 0 40px 30px 40px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: separate; border-spacing: 12px 0;">
                                <tr>
                                    <td class="box-bg" bgcolor="#ffffff" style="padding: 20px 10px; border-radius: 8px; width: 33%; text-align: center; border: 1px solid #e2e8f0;">
                                        <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto;">
                                            <tr><td align="center" style="padding-bottom: 6px;">
                                                <img src="https://img.icons8.com/ios-filled/50/d4af37/shield.png" width="22" height="22" alt="Shield" style="display: block; margin: 0 auto;">
                                            </td></tr>
                                            <tr><td class="heading-text" style="font-size: 10px; color: #1e2633; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Secure Account</td></tr>
                                        </table>
                                    </td>
                                    <td class="box-bg" bgcolor="#ffffff" style="padding: 20px 10px; border-radius: 8px; width: 33%; text-align: center; border: 1px solid #e2e8f0;">
                                        <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto;">
                                            <tr><td align="center" style="padding-bottom: 6px;">
                                                <img src="https://img.icons8.com/ios-filled/50/d4af37/appointment-reminders--v1.png" width="22" height="22" alt="Notification" style="display: block; margin: 0 auto;">
                                            </td></tr>
                                            <tr><td class="heading-text" style="font-size: 10px; color: #1e2633; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Stay Updated</td></tr>
                                        </table>
                                    </td>
                                    <td class="box-bg" bgcolor="#ffffff" style="padding: 20px 10px; border-radius: 8px; width: 33%; text-align: center; border: 1px solid #e2e8f0;">
                                        <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto;">
                                            <tr><td align="center" style="padding-bottom: 6px;">
                                                <img src="https://img.icons8.com/ios-filled/50/d4af37/add-list.png" width="22" height="22" alt="Listing" style="display: block; margin: 0 auto;">
                                            </td></tr>
                                            <tr><td class="heading-text" style="font-size: 10px; color: #1e2633; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Easy Listing</td></tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 0 40px 40px 40px;">
                            <div class="box-bg main-text" style="background-color: #ffffff; border-left: 4px solid #d4af37; padding: 20px; color: #515b6f; font-size: 13px; border-radius: 0 4px 4px 0; line-height: 1.5; border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
                                <strong>Didn't sign up?</strong> If you didn't create an account on 3arbon.com, you can safely ignore this email.
                            </div>
                        </td>
                    </tr>
               
                    <tr>
                        <td align="center" class="footer-bg" bgcolor="#1a222f" style="padding: 45px 40px; background-color: #1a222f; background-image: linear-gradient(#1a222f, #1a222f); border-radius: 0 0 8px 8px;">
                            <p class="footer-text force-white" style="font-size: 14px; color: #ffffff !important; margin: 0; line-height: 1.6; text-align: center;">
                                <span class="force-white" style="color: #adb5bd !important; font-weight: 400;"><font color="#adb5bd">Best regards,</font></span><br>
                                <strong style="color: #d4af37; font-size: 18px; font-weight: 700;">The 3arbon Team</strong>
                            </p>
                            <p class="footer-text force-white" style="font-size: 13px; color: #ffffff !important; margin-top: 25px; text-align: center;">
                                <span class="force-white" style="color: #adb5bd !important; opacity: 0.9;"><font color="#adb5bd">Need help? Contact our support team at</font></span><br>
                                <a href="mailto:info@3arbon.com" style="color: #d4af37; text-decoration: none; font-weight: 700;">info@3arbon.com</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`,
        };

      case EmailsType.RESET_PASSWORD:
        const resetLink = `${process.env.FRONT_URL}/credentials-update/change-password?token=${token}`;
        return {
          from: {
            name: '3arbon Team',
            address: process.env.EMAIL_FROM,
          },
          to: email,
          subject: `🔒 Reset Your Password for Alletre`,
          html: `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>3arbon Password Reset</title>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
        :root {
            color-scheme: light dark;
            supported-color-schemes: light dark;
        }

        @media only screen and (max-width: 480px) {
            .mobile-h1 { font-size: 24px !important; }
            .mobile-text { font-size: 14px !important; padding: 10px 30px !important; text-align: left !important; }
            .mobile-greeting { font-size: 16px !important; }
            .mobile-button { padding: 14px 30px !important; font-size: 14px !important; }
        }

        @media (prefers-color-scheme: dark) {
            .body-bg { background-color: #111111 !important; }
            .content-bg { background-color: #111111 !important; }
            .header-bg { background-color: #1a222f !important; background-image: linear-gradient(#1a222f, #1a222f) !important; }
            .footer-bg { background-color: #1a222f !important; background-image: linear-gradient(#1a222f, #1a222f) !important; border-radius: 0 0 8px 8px; }
            .main-text { color: #e9ecef !important; }
            .sub-text { color: #adb5bd !important; text-align: center !important; }
            .heading-text { color: #ffffff !important; }
            .footer-text { color: #ffffff !important; }
            .box-bg { background-color: #1a222f !important; border: 1px solid #2d3748 !important; }
            .button-lock { background-color: #1e2633 !important; color: #ffffff !important; }
            .force-white { color: #ffffff !important; }
        }

        /* Forced Dark Mode Logic */
        [data-ogsc] .heading-text { color: #ffffff !important; }
        [data-ogsc] .footer-text { color: #ffffff !important; }
        [data-ogsc] .force-white { color: #ffffff !important; }
        [data-ogsc] .button-lock { background-color: #1e2633 !important; color: #ffffff !important; }
    </style>
</head>
<body class="body-bg" style="margin: 0; padding: 0; background-color: #e9ecef; font-family: 'Montserrat', sans-serif; -webkit-font-smoothing: antialiased;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" class="body-bg" style="background-color: #e9ecef; padding: 40px 0;">
        <tr>
            <td align="center">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" class="content-bg" style="max-width: 600px; background-color: #f4f5f7; border-radius: 8px; overflow: hidden; box-shadow: 0 8px 25px rgba(0,0,0,0.06);">
                    
                    <tr>
                        <td align="left" class="header-bg" style="background-color: #1e2633; background-image: linear-gradient(#1e2633, #1e2633); padding: 25px 40px; border-bottom: 2px solid #d4af37;">
                            <a href="https://3arbon.com" style="text-decoration: none;">
                                <img src="https://firebasestorage.googleapis.com/v0/b/alletre-auctions.firebasestorage.app/o/g217.png?alt=media&token=fc1c5fac-7f9c-48a1-8cf4-b41819ddeda5" 
                                     alt="3arbon" 
                                     style="display: block; border: 0; height: 35px; width: auto;">
                            </a>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding: 50px 0 10px 0;">
                            <div style="background-color: #1e2633; background-image: linear-gradient(#1e2633, #1e2633); width: 64px; height: 64px; border-radius: 50%; display: table; margin: 0 auto;">
                               <div style="display: table-cell; vertical-align: middle; text-align: center; padding: 0;">
                                    <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto;">
                                        <tr><td align="center" style="padding: 0;">
                                            <div style="width: 12px; height: 9px; border: 2.5px solid #d4af37; border-bottom: none; border-radius: 6px 6px 0 0;"></div>
                                        </td></tr>
                                        <tr><td align="center" style="padding: 0;">
                                            <div style="width: 20px; height: 14px; border: 2.5px solid #d4af37; border-radius: 2px; margin-top: -1px;"></div>
                                        </td></tr>
                                    </table>
                                </div>
                            </div>
                            <p style="color: #d4af37; text-transform: uppercase; letter-spacing: 3px; font-size: 11px; margin-top: 20px; font-weight: 700;">Password Reset</p>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding: 10px 40px 20px 40px;">
                            <h1 class="mobile-h1 heading-text" style="color: #1e2633; font-size: 32px; margin: 0; font-weight: 700;">Reset Your Password</h1>
                            <div style="width: 50px; height: 3px; background-color: #d4af37; margin: 15px auto 0 auto;"></div>
                        </td>
                    </tr>

                    <tr>
                        <td class="mobile-text main-text" style="padding: 20px 60px; color: #515b6f; font-size: 16px; line-height: 1.8; text-align: left;">
                            <p class="mobile-greeting heading-text" style="font-weight: 700; color: #1e2633; font-size: 18px; margin-bottom: 10px; margin-top: 0;">Hi, ${userName}</p>
                            <p style="margin: 0;">We received a request to reset the password for your <strong>3arbon.com</strong> account. Click the button below to create a new password.</p>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding: 20px 40px 40px 40px;">
                            <a href="${resetLink}" class="mobile-button button-lock force-white" style="background-color: #1a222f; background-image: linear-gradient(#1a222f, #1a222f); color: #ffffff !important; padding: 18px 50px; text-decoration: none; border-radius: 4px; font-weight: 700; font-size: 16px; display: inline-block; border-bottom: 4px solid #d4af37; transition: all 0.3s ease;">
                                <span class="force-white" style="color: #d4af37 !important; font-weight: 700; text-shadow: 0 0 1px #ffffff, 0 0 1px #ffffff;"><font color="#d4af37">Reset My Password</font></span>
                            </a>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding: 0 40px 30px 40px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: separate; border-spacing: 12px 0;">
                                <tr>
                                    <td class="box-bg" bgcolor="#ffffff" style="padding: 20px 10px; border-radius: 8px; width: 33%; text-align: center; border: 1px solid #e2e8f0;">
                                        <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto;">
                                            <tr><td align="center" style="padding-bottom: 6px;">
                                                <img src="https://img.icons8.com/ios-filled/50/d4af37/shield.png" width="22" height="22" alt="Shield" style="display: block; margin: 0 auto;">
                                            </td></tr>
                                            <tr><td class="heading-text" style="font-size: 10px; color: #1e2633; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Secure Link</td></tr>
                                        </table>
                                    </td>
                                    <td class="box-bg" bgcolor="#ffffff" style="padding: 20px 10px; border-radius: 8px; width: 33%; text-align: center; border: 1px solid #e2e8f0;">
                                        <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto;">
                                            <tr><td align="center" style="padding-bottom: 6px;">
                                                <img src="https://img.icons8.com/ios-filled/50/d4af37/clock--v1.png" width="22" height="22" alt="Clock" style="display: block; margin: 0 auto;">
                                            </td></tr>
                                            <tr><td class="heading-text" style="font-size: 10px; color: #1e2633; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">15 Minutes</td></tr>
                                        </table>
                                    </td>
                                    <td class="box-bg" bgcolor="#ffffff" style="padding: 20px 10px; border-radius: 8px; width: 33%; text-align: center; border: 1px solid #e2e8f0;">
                                        <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto;">
                                            <tr><td align="center" style="padding-bottom: 6px;">
                                                <img src="https://img.icons8.com/ios-filled/50/d4af37/ok.png" width="22" height="22" alt="Badge" style="display: block; margin: 0 auto;">
                                            </td></tr>
                                            <tr><td class="heading-text" style="font-size: 10px; color: #1e2633; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">One-Time Use</td></tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 0 40px 40px 40px;">
                            <div class="box-bg main-text" style="background-color: #ffffff; border-left: 4px solid #d4af37; padding: 20px; color: #515b6f; font-size: 13px; border-radius: 0 4px 4px 0; line-height: 1.5; border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
                                <strong>Didn't request this?</strong> If you didn't ask to reset your password, you can safely ignore this email. Your account remains secure.
                            </div>
                        </td>
               
                    <tr>
                        <td align="center" class="sub-text" style="padding: 30px 40px 20px 40px; border-top: 1px solid #e2e8f0;">
                            <p class="sub-text" style="font-size: 14px; color: #adb5bd !important; margin: 0; text-align: center;">
                                Never share your password reset link with anyone.
                            </p>
                        </td>
                    </tr>
 
                    <tr>
                        <td align="center" class="footer-bg" bgcolor="#1a222f" style="padding: 45px 40px; background-color: #1a222f; background-image: linear-gradient(#1a222f, #1a222f); border-radius: 0 0 8px 8px;">
                            <p class="footer-text force-white" style="font-size: 14px; color: #ffffff !important; margin: 0; line-height: 1.6; text-align: center;">
                                <span class="force-white" style="color: #adb5bd !important; font-weight: 400;"><font color="#adb5bd">Best regards,</font></span><br>
                                <strong style="color: #d4af37; font-size: 18px; font-weight: 700;">The 3arbon Team</strong>
                            </p>
                            <p class="footer-text force-white" style="font-size: 13px; color: #ffffff !important; margin-top: 25px; text-align: center;">
                                <span class="force-white" style="color: #adb5bd !important; opacity: 0.9;"><font color="#adb5bd">Need help? Contact our support team at</font></span><br>
                                <a href="mailto:info@3arbon.com" style="color: #d4af37; text-decoration: none; font-weight: 700;">info@3arbon.com</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`,
        };

      case EmailsType.OTHER:
        return {
          from: {
            name: '3arbon Team',
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
    const isBypassed =
      emailType === EmailsType.VERIFICATION ||
      emailType === EmailsType.RESET_PASSWORD;

    if (process.env.ENABLE_EMAILS === 'false' && !isBypassed) {
      return;
    }
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

  async sendAuctionBulkEmail(auctionId: string) {
    if (process.env.ENABLE_EMAILS === 'false') {
      console.log(
        'Bulk auction email sending is disabled via ENABLE_EMAILS flag.',
      );
      return;
    }
    try {
      const auction = await this.prismaService.auction.findUnique({
        where: {
          id: Number(auctionId),
        },
        include: {
          bids: true,
          user: true,
          product: { include: { images: true, category: true } },
        },
      });
      if (auction) {
        await this.emailBatchService.sendBulkEmails(auction);
      }
    } catch (error) {
      console.log('sendbulkEamil error :', error);
    }
  }

  async sendListedProductBulkEmail(listedId: string) {
    if (process.env.ENABLE_EMAILS === 'false') {
      console.log(
        'Listed product bulk email sending is disabled via ENABLE_EMAILS flag.',
      );
      return;
    }
    try {
      const listedProduct = await this.prismaService.listedProducts.findUnique({
        where: {
          id: Number(listedId),
        },
        include: {
          user: true,
          product: { include: { images: true, category: true } },
        },
      });
      if (listedProduct) {
        await this.emailBatchService.sendListedProdcutBulkEmails(listedProduct);
      }
    } catch (error) {
      console.log('sendbulkEamil error :', error);
    }
  }

  async unsubscribeEmais(email: string) {
    try {
      const isAlreadyUnsubscribed = await this.isUnsubscribed(email);
      if (isAlreadyUnsubscribed) {
        return;
      }
      const unsubscribed = await this.prismaService.unsubscribedUser.create({
        data: {
          email,
          phone: null,
          reason: 'user unsubscribed by email',
        },
      });
      return unsubscribed;
    } catch (error) {
      console.log('unsubscribe email error:', error);
    }
  }

  async isUnsubscribed(email: string): Promise<boolean> {
    const user = await this.prismaService.unsubscribedUser.findFirst({
      where: { email },
    });
    return !!user;
  }
}
