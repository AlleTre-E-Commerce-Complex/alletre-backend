import * as puppeteer from 'puppeteer';

export const generateArbonContractPDF = async (contractData: any): Promise<Buffer> => {
  console.log('--- generateArbonContractPDF CALLED ---');
  const {
    buyerName,
    buyerEmail,
    sellerName,
    sellerEmail,
    productTitle,
    productDescription,
    productPrice,
    arbonAmount,
    lang,
  } = contractData;

  const labels = {
    en: {
      contractTitle: 'Deposit Agreement (Arbon)',
      parties: 'Parties Details',
      buyer: 'Buyer',
      seller: 'Seller',
      name: 'Name',
      email: 'Email',
      itemDetails: 'Item Details',
      title: 'Title',
      description: 'Description',
      price: 'Total Price',
      deposit: 'Deposit Amount (Arbon)',
      penalties: 'Penalties & Disputes',
      penaltiesText: 'If the transaction is not completed within 7 days, the deposit may be forfeited or returned based on the agreement between parties. Disputes shall be settled through 3arbon platform mediation.',
      terms: 'Terms & Conditions',
      footer: 'Thank you for using 3arbon',
    },
    ar: {
      contractTitle: 'اتفاقية العربون',
      parties: 'تفاصيل الأطراف',
      buyer: 'المشتري',
      seller: 'البائع',
      name: 'الاسم',
      email: 'البريد الإلكتروني',
      itemDetails: 'تفاصيل المنتج',
      title: 'العنوان',
      description: 'الوصف',
      price: 'السعر الإجمالي',
      deposit: 'مبلغ العربون',
      penalties: 'العقوبات والنزاعات',
      penaltiesText: 'إذا لم يتم إكمال المعاملة في غضون 7 أيام، فقد يتم مصادرة العربون أو إعادته بناءً على الاتفاق بين الطرفين. يتم تسوية النزاعات من خلال وساطة منصة 3arbon.',
      terms: 'الشروط والأحكام',
      footer: 'شكرًا لاستخدامك 3arbon',
    }
  };

  const l = labels[lang] || labels.en;

  const htmlContent = `
<!DOCTYPE html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8" />
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
  <style>
    body { 
      font-family: 'Inter', sans-serif; 
      margin: 0;
      padding: 0;
      color: #333;
      background-color: #f8f9fa;
    }
    .page-wrapper {
      background-color: #ffffff;
      min-height: 1000px;
    }
    .header { 
      background-color: #1e2633; 
      color: #ffffff;
      padding: 40px; 
      text-align: center;
      border-bottom: 4px solid #d4af37;
    }
    .header h1 { 
      margin: 20px 0 0 0; 
      font-family: 'Montserrat', sans-serif;
      text-transform: uppercase;
      letter-spacing: 2px;
      font-size: 24px;
      color: #d4af37;
    }
    .logo { height: 45px; width: auto; }
    
    .content-container { padding: 40px; }
    
    .section { margin-bottom: 40px; }
    .section-title { 
      font-size: 16px; 
      font-weight: 700; 
      color: #1e2633; 
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 15px; 
      border-bottom: 2px solid #d4af37; 
      display: inline-block;
      padding-bottom: 4px;
    }
    
    .card {
      background: #ffffff;
      border: 1px solid #e1e4e8;
      border-radius: 8px;
      padding: 20px;
      display: flex;
      justify-content: space-between;
    }
    
    .details-table { width: 100%; border-collapse: collapse; }
    .details-table td { padding: 10px 0; border-bottom: 1px solid #f0f2f5; }
    .details-table tr:last-child td { border-bottom: none; }
    
    .label { font-weight: 600; color: #666; font-size: 13px; width: 40%; }
    .value { font-weight: 500; color: #1e2633; font-size: 14px; }
    
    .party-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
    }
    .party-box {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 15px;
      border-left: 4px solid #1e2633;
    }
    .party-label {
      font-weight: 700;
      color: #d4af37;
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    
    .footer { 
      text-align: center; 
      margin-top: 60px; 
      padding: 30px 40px;
      font-size: 12px; 
      color: #888; 
      border-top: 1px solid #eee; 
    }
    
    .deposit-highlight {
      background-color: #1e2633;
      color: #d4af37;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      margin-top: 20px;
    }
    .deposit-value {
      font-size: 24px;
      font-weight: 700;
      display: block;
    }
    .deposit-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    [dir="rtl"] .party-box {
      border-left: none;
      border-right: 4px solid #1e2633;
    }
  </style>
</head>
<body>
  <div class="page-wrapper">
    <div class="header">
      <img src="https://firebasestorage.googleapis.com/v0/b/alletre-auctions.firebasestorage.app/o/g217.png?alt=media&token=7020f633-e773-4c45-830f-a78aed390640" alt="3arbon" class="logo">
      <h1>${l.contractTitle}</h1>
    </div>

    <div class="content-container">
      <div class="section">
        <div class="section-title">${l.parties}</div>
        <table width="100%" cellspacing="15">
          <tr>
            <td width="50%" style="background: #f8f9fa; border-radius: 8px; padding: 15px; border-left: 4px solid #1e2633; vertical-align: top;">
              <div style="font-weight: 700; color: #d4af37; font-size: 12px; text-transform: uppercase; margin-bottom: 8px;">${l.buyer}</div>
              <div style="font-size: 14px; margin-bottom: 4px;"><b>${l.name}:</b> ${buyerName}</div>
              <div style="font-size: 14px;"><b>${l.email}:</b> ${buyerEmail}</div>
            </td>
            <td width="50%" style="background: #f8f9fa; border-radius: 8px; padding: 15px; border-left: 4px solid #d4af37; vertical-align: top;">
              <div style="font-weight: 700; color: #1e2633; font-size: 12px; text-transform: uppercase; margin-bottom: 8px;">${l.seller}</div>
              <div style="font-size: 14px; margin-bottom: 4px;"><b>${l.name}:</b> ${sellerName}</div>
              <div style="font-size: 14px;"><b>${l.email}:</b> ${sellerEmail}</div>
            </td>
          </tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">${l.itemDetails}</div>
        <table class="details-table">
          <tr>
            <td class="label">${l.title}</td>
            <td class="value">${productTitle}</td>
          </tr>
          <tr>
            <td class="label">${l.description}</td>
            <td class="value">${productDescription || 'N/A'}</td>
          </tr>
          <tr>
            <td class="label">${l.price}</td>
            <td class="value">${productPrice} AED</td>
          </tr>
        </table>
        
        <div class="deposit-highlight">
          <span class="deposit-label">${l.deposit}</span>
          <span class="deposit-value">${arbonAmount} AED</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">${l.penalties}</div>
        <p style="font-size: 14px; line-height: 1.6; color: #444;">${l.penaltiesText}</p>
      </div>

      <div class="section">
        <div class="section-title">${l.terms}</div>
        <ul style="font-size: 14px; line-height: 1.8; color: #444; padding-left: 20px;">
          <li>The deposit is valid for 7 days from the payment date.</li>
          <li>The seller can release the deposit within this period to complete the deal.</li>
          <li>In case of disputes, 3arbon support will act as an arbitrator.</li>
        </ul>
      </div>
    </div>

    <div class="footer">
      <div style="margin-bottom: 10px; font-weight: 600;">${l.footer}</div>
      <div>&copy; ${new Date().getFullYear()} 3arbon. All rights reserved.</div>
    </div>
  </div>
</body>
</html>
  `;

  let browser;
  try {
    console.log('Puppeteer launching...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    console.log('Puppeteer launched. Creating new page...');
    const page = await browser.newPage();
    console.log('Setting page content...');
    await page.setContent(htmlContent, { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    console.log('Generating PDF buffer...');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
    });
    console.log('PDF buffer generated. Length:', pdfBuffer.length);
    return Buffer.from(pdfBuffer);
  } catch (error) {
    console.error('Puppeteer PDF generation error:', error);
    throw error;
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
  }
};
