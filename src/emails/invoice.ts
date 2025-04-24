const wkhtmltopdf = require('wkhtmltopdf');

import { Readable } from 'stream';

export const generateInvoicePDF = async (invoiceData: any): Promise<Buffer> => {
  const amount = parseFloat(invoiceData?.amount) || 0;
  const serviceFee = (amount * 0.05).toFixed(2);
  const invoiceNumber =
    'ALLE' +
    Math.floor(Math.random() * 1e12)
      .toString()
      .padStart(12, '0');
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Invoice</title>
</head>
<body style="margin: 0; padding: 30px; font-family: Arial, sans-serif; background: white; color: #0c0b0b;">
  <div style="max-width: 750px; margin: 0 auto;">
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px;">
      <div style="display: flex; flex-direction: column;">
        <img src="https://firebasestorage.googleapis.com/v0/b/alletre-auctions.firebasestorage.app/o/allatre-logo-color.svg?alt=media&token=d39db059-121a-4db5-9006-d609f3060b99"
             alt="Alletre Logo"
             style="height: 36px; margin-bottom: 10px; margin-right: 180px;">
        <div style="font-size: 16px; line-height: 1.8;">
          <strong>ALLE TRE E-Commerce Complex LLC OPC</strong><br>
          Office No. 504<br>
          Julphar Tower, Ras Al Khaimah, UAE<br>
          Email: info@alletre.com
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 28px; font-weight: 600; margin-bottom: 6px;">TAX INVOICE</div>
        <div style="font-size: 22px;">فاتورة ضريبية</div>
      </div>
    </div>

    <div style="border-top: 1px solid #ddd; margin: 24px 0;"></div>

    <table style="width: 100%; font-size: 16px; border-collapse: collapse;">
      <tr>
        <td style="padding-bottom: 8px;"><strong>Billed To:</strong> ${
          invoiceData.auction.bids[0].user.userName
        }</td>
        <td style="text-align: right; padding-bottom: 8px;"><strong>Invoice No:</strong> ${invoiceNumber}</td>
      </tr>
      <tr>
        <td><strong>Invoice Date:</strong> ${new Date().toLocaleDateString()}</td>
        <td style="text-align: right;"><strong>VAT Reg. No:</strong> 104703657700001</td>
      </tr>
    </table>

    <div style="margin: 70px 0;">
      <table style="width: 100%; font-size: 16px; border-collapse: collapse;">
        <tr>
          <td><strong>Alletre Service Fee / رسوم خدمة أليتري</strong></td>
          <td style="text-align: right;"><strong>${
            serviceFee || 'N/A'
          } AED</strong></td>
        </tr>
      </table>
    </div>

    <div style="border-top: 1px solid #ddd; margin: 24px 0;"></div>

    <table style="width: 100%; font-size: 18px; font-weight: bold; border-collapse: collapse;">
      <tr>
        <td>Total</td>
        <td style="text-align: right;">${serviceFee || 'N/A'} AED</td>
      </tr>
    </table>

    <div style="border-top: 1px solid #ddd; margin: 24px 0;"></div>

    <div style="text-align: center; font-size: 15px; color: #000; margin-top: 50px;">
      Thank you for using Alletre / شكرًا لاستخدامك منصة ألترَي
    </div>
  </div>
</body>
</html>
  `;

  try {
    return new Promise<Buffer>((resolve, reject) => {
      const pdfChunks: Buffer[] = [];
      const pdfStream: Readable = wkhtmltopdf(htmlContent, {
        pageSize: 'A4',
        marginTop: '0',
        marginBottom: '0',
        marginLeft: '0',
        marginRight: '0',
      });

      pdfStream.on('data', (chunk) => pdfChunks.push(chunk));
      pdfStream.on('end', () => resolve(Buffer.concat(pdfChunks)));
      pdfStream.on('error', (error) => reject(error));
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};