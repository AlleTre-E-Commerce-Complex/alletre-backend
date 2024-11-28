// src/email/email-batch.service.ts
import { Injectable } from '@nestjs/common';
import { Worker } from 'worker_threads';
import * as path from 'path';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class EmailBatchService {
  constructor(private readonly prismaService: PrismaService) {}
  private batchSize = 100; // Customize batch size as needed

  async sendBulkEmails(updatedAuction: any) {
    console.log('send bulk email test 1', updatedAuction);
    const users = await this.getAllRegisteredUsers();
    console.log('send bulk email test 2', users);

    const subject = `New Auction: ${updatedAuction.product.title}`;
    const text = `A new auction has been listed: ${updatedAuction.product.title}`;
    const html = `
      
        <div style="margin: 0; padding: 0; background-color: #f4f4f4;">
          <div style="
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            font-family: Arial, Helvetica, sans-serif;
            color: #333333;
            background: white;
          ">
            <!-- Logo Header with Background -->
            <div style="
              text-align: center;
              margin-bottom: 20px;
              background: #a91d3a;
              background: linear-gradient(135deg, rgb(186, 110, 128), #9f5b68);
              padding: 20px;
              border-radius: 12px;
            ">
              <img
                src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/1.png?alt=media&token=3d538116-bf6d-45d9-83e0-7f0076c43077"
                alt="Alletre Logo"
                style="width: 150px; height: auto; margin-bottom: 10px; display: inline-block;"
              />
            </div>

            <h1 style="
              text-align: center;
              margin-bottom: 30px;
              font-size: 28px;
              color: #a91d3a;
              text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.1);
            ">
              ✨ New Auction: ${updatedAuction.product.title} ✨
            </h1>

            <!-- Product Image -->
            <div style="text-align: center; margin-bottom: 30px;">
              <div style="
                background: white;
                padding: 10px;
                border-radius: 12px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                display: inline-block;
                border: 1px solid #eee;
              ">
                <img
                  src="${updatedAuction.product.images[0].imageLink}"
                  alt="Product Image"
                  style="
                    width: 300px;
                    height: auto;
                    border-radius: 8px;
                    display: block;
                    max-width: 100%;
                  "
                />
              </div>
            </div>

            <p style="
              font-size: 16px;
              line-height: 1.6;
              text-align: center;
              margin-bottom: 30px;
              color: #9e1b24;
              padding: 0 20px;
            ">
              Don't miss out on this exciting new auction! Check it out now on our platform.
            </p>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a
                href="${process.env.FRONT_URL}"
                style="
                  display: inline-block;
                  padding: 12px 24px;
                  background-color: #a91d3a;
                  color: white !important;
                  text-decoration: none;
                  border-radius: 5px;
                  font-weight: bold;
                  mso-line-height-rule: exactly;
                "
              >
                View Auction Now
              </a>
            </div>

            <!-- Footer -->
            <div style="
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              text-align: center;
              color: #666666;
              font-size: 12px;
            ">
              <p style="margin: 0;">Terms and Conditions apply</p>
            </div>
          </div>
        </div>
      
    `;
    try {
      const userBatches = this.chunkArray(users, this.batchSize);
      const workers = [];

      for (const batch of userBatches) {
        console.log('batches : ', batch);
        const worker = new Worker(path.resolve(__dirname, 'email.worker.js'), {
          workerData: { users: batch, subject, text, html },
        });

        worker.on('message', (result) => {
          if (result.success) {
            console.log(`Batch sent successfully`);
          } else {
            console.error('SendGrid Error Details:', {
              error: result.error,
              statusCode: result.error?.code,
              response: result.error?.response?.body,
              batch: batch.length,
            });
          }
        });

        worker.on('error', (error) => {
          console.error('Worker error:', error);
        });

        workers.push(worker);
      }

      await Promise.all(
        workers.map(
          (worker) => new Promise((resolve) => worker.on('exit', resolve)),
        ),
      );
    } catch (error) {
      console.error('Email batch service error:', error);
      throw error;
    }
  }

  private chunkArray(array: string[], size: number): string[][] {
    const result: string[][] = [];
    for (let i = 0; i < array.length; i += size) {
      result.push(array.slice(i, i + size));
    }
    return result;
  }
  async getAllRegisteredUsers(batchSize = 1000) {
    const emails = [];
    let skip = 0;
    let batch: any;

    try {
      do {
        // Fetch a batch of users
        batch = await this.prismaService.user.findMany({
          skip: skip,
          take: batchSize,
          select: {
            email: true,
          },
        });

        // Add fetched emails to the list
        emails.push(...batch.map((user: any) => user.email));

        // Increment the skip counter for the next batch
        skip += batchSize;
      } while (batch.length > 0); // Continue fetching until no more users are returned

      return emails;
    } catch (error) {
      console.log(
        'Error while fetching user email address for bulk email:',
        error,
      );
    }
  }
}
