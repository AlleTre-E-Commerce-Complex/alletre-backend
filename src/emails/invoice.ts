import puppeteer from 'puppeteer';

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
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Disable JavaScript
    await page.setJavaScriptEnabled(false);
    await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
    const pdfBuffer: Uint8Array = await page.pdf({ format: 'A4', timeout:60000 });

    await browser.close();
    // Cast the Uint8Array to a Buffer and return it
    return Buffer.from(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};

