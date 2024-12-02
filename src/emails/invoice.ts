import PDFDocument = require('pdfkit');
import axios from 'axios';

export const generateInvoicePDF = async (invoiceData: any): Promise<Buffer> => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      // Capture the PDF data in chunks
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Fetch and embed the logo
      const logoUrl = 'https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/1.png?alt=media&token=3d538116-bf6d-45d9-83e0-7f0076c43077';
      const logoResponse = await axios.get(logoUrl, { responseType: 'arraybuffer' });
      const logoBuffer = Buffer.from(logoResponse.data, 'binary');
      doc.image(logoBuffer, 50, 30, { width: 100 });

      // Company Name and Invoice Title
      doc
        .fontSize(20)
        .text('Alletre Ecommerce Complex', { align: 'center' })
        .fontSize(16)
        .text('Authorized Invoice', { align: 'center' })
        .moveDown();

      // Customer and Seller Details
      doc
        .fontSize(12)
        .text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' })
        .moveDown();
      doc
        .fontSize(12)
        .text(`Customer: ${invoiceData?.auction?.user?.userName}`)
        .text(`Email: ${invoiceData?.auction?.user?.email}`)
        .text(`Seller: ${invoiceData?.sellerName || 'N/A'}`)
        .moveDown();

      // Auction Details Table
      doc.moveDown();
      doc.fontSize(14).text('Auction Details', { underline: true }).moveDown();
      const tableTop = doc.y;
      const item = invoiceData?.auction?.product?.title || 'N/A';
      const amount = invoiceData?.amount || 'N/A';

      doc
        .fontSize(12)
        .text('Index', 50, tableTop)
        .text('Product Name', 150, tableTop)
        .text('Auction Price (AED)', 400, tableTop);

      doc
        .moveDown()
        .text('1', 50, doc.y)
        .text(item, 150, doc.y)
        .text(amount, 400, doc.y)
        .moveDown();

      // Authorized Description
      doc
        .moveDown()
        .fontSize(12)
        .text(
          'This is an authorized invoice from the company Alletre Ecommerce Complex. Thank you for your business!',
          { align: 'center' },
        )
        .moveDown();

      // Signature Section
      doc.moveDown().text('________________________', { align: 'right' });
      doc.text('Manager', { align: 'right' });

      // Finalize the PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};
