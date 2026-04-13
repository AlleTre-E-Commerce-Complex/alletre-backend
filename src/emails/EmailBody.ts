export class EmailBody {
  // constructor() {}

  emailBody(body: any) {
    let data = '';
    for (const [key, value] of Object.entries(body)) {
      if (
        key !== 'img' &&
        key !== 'attachment' &&
        key !== 'subject' &&
        key !== 'Button_URL' &&
        key !== 'title' &&
        key !== 'Button_text' &&
        key !== 'userName' &&
        key !== 'message1' &&
        key !== 'message2' &&
        key !== 'preHeader' &&
        key !== 'features'
      ) {
        data += `<p style="margin: 8px 0; font-size: 14px; color: #515b6f;"><strong style="color: #1e2633;">${key}:</strong> ${value}</p>`;
      }
    }

    // Process features if provided as an array
    let featuresHtml = '';
    if (body.features && Array.isArray(body.features)) {
      featuresHtml = `
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 30px 0; border-collapse: separate; border-spacing: 12px 0;">
            <tr>
                ${body.features
                  .map(
                    (f) => `
                    <td class="feature-cell" bgcolor="#f8fafc" style="padding: 20px 10px; border-radius: 8px; width: 33%; text-align: center; border: 1px solid #e2e8f0;">
                        <img src="${
                          f.icon ||
                          'https://img.icons8.com/ios-filled/50/d4af37/shield.png'
                        }" width="22" height="22" style="display: block; margin: 0 auto 10px auto;">
                        <span style="font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1e2633; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; display: block; line-height: 1.2;">
                          ${f.text}
                        </span>
                    </td>
                `,
                  )
                  .join('')}
            </tr>
        </table>
      `;
    }

    return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>3arbon Notification</title>
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
            .mobile-feature { display: block !important; width: 100% !important; margin-bottom: 12px !important; }
        }

        @media (prefers-color-scheme: dark) {
            .body-bg { background-color: #111111 !important; }
            .content-bg { background-color: #111111 !important; }
            .header-bg { background-color: #1a222f !important; background-image: linear-gradient(#1a222f, #1a222f) !important; }
            .footer-bg { background-color: #1a222f !important; background-image: linear-gradient(#1a222f, #1a222f) !important; border-radius: 0 0 8px 8px !important; }
            .main-text { color: #e9ecef !important; }
            .sub-text { color: #adb5bd !important; text-align: center !important; }
            .heading-text { color: #ffffff !important; }
            .footer-text { color: #ffffff !important; }
            .box-bg { background-color: #1a222f !important; border: 1px solid #2d3748 !important; }
            .button-lock { background-color: #1a222f !important; color: #ffffff !important; }
            .force-white { color: #ffffff !important; }
        }

        /* Forced Dark Mode Logic */
        [data-ogsc] .body-bg { background-color: #111111 !important; }
        [data-ogsc] .content-bg { background-color: #111111 !important; }
        [data-ogsc] .heading-text { color: #ffffff !important; }
        [data-ogsc] .footer-text { color: #ffffff !important; }
        [data-ogsc] .force-white { color: #ffffff !important; }
        [data-ogsc] .button-lock { background-color: #1a222f !important; color: #ffffff !important; }
    </style>
</head>
<body class="body-bg" style="margin: 0; padding: 0; background-color: #e9ecef; font-family: 'Montserrat', sans-serif; -webkit-font-smoothing: antialiased;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" class="body-bg" style="background-color: #e9ecef; padding: 40px 0;">
        <tr>
            <td align="center">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" class="content-bg" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 8px 25px rgba(0,0,0,0.06);">
                    
                    <!-- Header Area -->
                    <tr>
                        <td align="left" class="header-bg" style="background-color: #1e2633; background-image: linear-gradient(#1e2633, #1e2633); padding: 25px 40px; border-bottom: 2px solid #d4af37;">
                            <a href="https://3arbon.com" style="text-decoration: none;">
                                <img src="https://firebasestorage.googleapis.com/v0/b/alletre-auctions.firebasestorage.app/o/g217.png?alt=media&token=fc1c5fac-7f9c-48a1-8cf4-b41819ddeda5" 
                                     alt="3arbon" 
                                     style="display: block; border: 0; height: 35px; width: auto;">
                            </a>
                        </td>
                    </tr>

                    <!-- Status Icon & Label -->
                    <tr>
                        <td align="center" style="padding: 50px 0 10px 0;">
                            <div style="background-color: #1e2633; background-image: linear-gradient(#1e2633, #1e2633); width: 64px; height: 64px; border-radius: 50%; display: table; margin: 0 auto;">
                               <div style="display: table-cell; vertical-align: middle; text-align: center; padding: 0;">
                                    <img src="https://img.icons8.com/ios-filled/50/d4af37/ok.png" width="30" height="30" style="display: block; margin: 0 auto;">
                                </div>
                            </div>
                            <p style="color: #d4af37; text-transform: uppercase; letter-spacing: 3px; font-size: 11px; margin-top: 20px; font-weight: 700;">
                                ${body.preHeader || 'NOTIFICATION'}
                            </p>
                        </td>
                    </tr>

                    <!-- Title -->
                    <tr>
                        <td align="center" style="padding: 10px 40px 20px 40px;">
                            <h1 class="mobile-h1 heading-text" style="color: #1e2633; font-size: 32px; margin: 0; font-weight: 700; line-height: 1.2;">
                                ${body.title}
                            </h1>
                            <div style="width: 50px; height: 3px; background-color: #d4af37; margin: 15px auto 0 auto;"></div>
                        </td>
                    </tr>

                    <!-- Main Text Area -->
                    <tr>
                        <td class="mobile-text main-text" style="padding: 20px 60px; color: #515b6f; font-size: 16px; line-height: 1.8; text-align: left;">
                            <p class="mobile-greeting heading-text" style="font-weight: 700; color: #1e2633; font-size: 18px; margin-bottom: 10px; margin-top: 0;">
                                Hi, ${body.userName}
                            </p>
                            <div style="margin: 0;">
                                ${body.message1}
                            </div>
                        </td>
                    </tr>

                    <!-- Features Grid -->
                    ${
                      featuresHtml
                        ? `
                    <tr>
                        <td align="center" style="padding: 0 40px 30px 40px;">
                            ${featuresHtml}
                        </td>
                    </tr>
                    `
                        : ''
                    }

                    <!-- Dynamic Details Box -->
                    ${
                      data
                        ? `
                    <tr>
                        <td style="padding: 0 40px 30px 40px;">
                            <div class="box-bg main-text" style="background-color: #ffffff; border-left: 4px solid #d4af37; padding: 20px; color: #515b6f; font-size: 13px; border-radius: 0 4px 4px 0; line-height: 1.5; border: 1px solid #e2e8f0;">
                                ${data}
                            </div>
                        </td>
                    </tr>
                    `
                        : ''
                    }

                    <!-- CTA Button -->
                    ${
                      body.Button_URL
                        ? `
                    <tr>
                        <td align="center" style="padding: 20px 40px 40px 40px;">
                            <a href="${body.Button_URL}" class="mobile-button button-lock force-white" style="background-color: #1a222f; background-image: linear-gradient(#1a222f, #1a222f); color: #ffffff !important; padding: 18px 50px; text-decoration: none; border-radius: 4px; font-weight: 700; font-size: 16px; display: inline-block; border-bottom: 4px solid #d4af37;">
                                <span class="force-white" style="color: #d4af37 !important; font-weight: 700;">
                                    ${body.Button_text}
                                </span>
                            </a>
                        </td>
                    </tr>
                    `
                        : ''
                    }

                    <!-- Message 2 -->
                    ${
                      body.message2
                        ? `
                    <tr>
                        <td align="center" class="sub-text" style="padding: 0 40px 40px 40px;">
                            <div class="main-text" style="font-size: 14px; color: #515b6f !important; margin: 0; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 30px;">
                                ${body.message2}
                            </div>
                        </td>
                    </tr>
                    `
                        : ''
                    }

                    <!-- Premium Dark Footer -->
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
</html>`;
  }
}
