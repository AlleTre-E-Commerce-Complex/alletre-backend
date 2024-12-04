import * as path from 'path';
const PdfPrinter = require('pdfmake');

// Define fonts
const fonts = {
  Roboto: {
    normal: path.join(
      __dirname,
      '../../node_modules/pdfmake/build/vfs_fonts.js',
    ),
    bold: path.join(__dirname, '../../node_modules/pdfmake/build/vfs_fonts.js'),
    italics: path.join(
      __dirname,
      '../../node_modules/pdfmake/build/vfs_fonts.js',
    ),
    bolditalics: path.join(
      __dirname,
      '../../node_modules/pdfmake/build/vfs_fonts.js',
    ),
  },
};

// Create the printer
const printer = new PdfPrinter(fonts);

export const generateInvoicePDF = async (invoiceData: any): Promise<Buffer> => {
  console.log('invoiceData ===>', invoiceData);
  const docDefinition = {
    content: [
      {
        columns: [
          {
            image: 'https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/1.png?alt=media&token=3d538116-bf6d-45d9-83e0-7f0076c43077',
            width: 70,
            margin: [0, 0, 0, 10]
          },
          {
            text: 'Alletre Ecommerce Complex',
            style: 'header',
            margin: [10, 10, 0, 0]
          }
        ]
      },
      {
        text: 'Authorized Invoice',
        style: 'subheader'
      },
      {
        text: `Date: ${new Date().toLocaleDateString()}`,
        alignment: 'right',
        margin: [0, 0, 0, 15]
      },
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: `Seller Name: ${invoiceData?.auction?.user?.userName || 'N/A'}` },
              { text: `Seller Email: ${invoiceData?.auction?.user?.email || 'N/A'}` },
            ],
            margin: [0, 0, 0, 15],
          }
        ]
      },
      {
        text: 'Auction Details',
        style: 'tableHeader',
        margin: [0, 20, 0, 8]
      },
      {
        table: {
          headerRows: 1,
          widths: ['auto', '*', 'auto'],
          body: [
            [
              { text: 'Index', style: 'tableCell' },
              { text: 'Product Name', style: 'tableCell' },
              { text: 'Auction Price (AED)', style: 'tableCell' }
            ],
            [
              '1',
              invoiceData?.auction?.product?.title || 'N/A',
              invoiceData?.amount || 'N/A'
            ]
          ]
        },
        layout: {
          hLineWidth: (i) => 1,
          vLineWidth: (i) => 1,
          hLineColor: (i) => '#E5E7EB',
          vLineColor: (i) => '#E5E7EB',
          paddingLeft: (i) => 10,
          paddingRight: (i) => 10,
          paddingTop: (i) => 8,
          paddingBottom: (i) => 8
        }
      },
      {
        text: 'This is an authorized invoice from Alletre Ecommerce Complex. Thank you for your business!',
        style: 'footer',
        margin: [0, 30, 0, 20]
      },
      {
        columns: [
          { width: '*', text: '' },
          {
            width: 'auto',
            stack: [
              { text: '________________________', alignment: 'right' },
              { text: 'Manager', alignment: 'right', margin: [0, 5] }
            ]
          }
        ]
      }
    ],
    styles: {
      header: {
        fontSize: 20,
        bold: true,
        margin: [0, 0, 0, 10]
      },
      subheader: {
        fontSize: 16,
        alignment: 'center',
        margin: [0, 0, 0, 20]
      },
      tableHeader: {
        bold: true,
        fontSize: 14,
        color: 'black'
      },
      tableCell: {
        bold: true,
        fontSize: 12,
        fillColor: '#f8f9fa'
      },
      footer: {
        fontSize: 12,
        alignment: 'center',
        color: '#666666'
      }
    },
    defaultStyle: {
      fontSize: 11,
      lineHeight: 1.2
    }
  };

  return new Promise((resolve, reject) => {
    try {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks: any[] = [];

      pdfDoc.on('data', (chunk: any) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.end();
    } catch (error) {
      reject(error);
    }
  });
};
