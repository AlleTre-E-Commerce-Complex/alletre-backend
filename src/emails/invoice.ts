const wkhtmltopdf = require('wkhtmltopdf');

import { Readable } from 'stream';

export const generateInvoicePDF = async (invoiceData: any): Promise<Buffer> => {
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoice</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 20px;
        }
        .header {
          text-align: center;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        .table th, .table td {
          border: 1px solid #ddd;
          padding: 8px;
          text-align: left;
        }
        .table th {
          background-color: #f4f4f4;
          font-weight: bold;
        }
        .footer {
          margin-top: 20px;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Alletre Ecommerce Complex</h1>
        <h2>Authorized Invoice</h2>
        <p>Date: ${new Date().toLocaleDateString()}</p>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Index</th>
            <th>Product Name</th>
            <th>Auction Price (AED)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>${invoiceData?.auction?.product?.title || 'N/A'}</td>
            <td>${invoiceData?.amount || 'N/A'}</td>
          </tr>
        </tbody>
      </table>
      <div class="footer">
        <p>This is an authorized invoice from Alletre Ecommerce Complex. Thank you for your business!</p>
      </div>
    </body>
    </html>
  `;

  try {
    return new Promise<Buffer>((resolve, reject) => {
      const pdfChunks: Buffer[] = [];
      const pdfStream: Readable = wkhtmltopdf(htmlContent, { pageSize: 'A4' });

      pdfStream.on('data', (chunk) => pdfChunks.push(chunk));
      pdfStream.on('end', () => resolve(Buffer.concat(pdfChunks)));
      pdfStream.on('error', (error) => reject(error));
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};
