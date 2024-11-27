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
      <!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="desctiption" content="This is my Webpage" />
    <title>Rameez's Website</title>
  </head>
  <body>
    <div
      style="
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
        font-family: Arial, sans-serif;
        color: #d9bfbf;
        background: linear-gradient(to bottom, #c9c1c1, #e4e5e7);
      "
    >
      <!-- Logo Header with Background -->
      <div
        style="
          text-align: center;
          margin-bottom: 20px;
          background: linear-gradient(135deg, rgb(186, 110, 128), #9f5b68);
          padding: 20px;
          border-radius: 12px;
        "
      >
        <img
          src="${process.env.FRONT_URL}/Images/logo192.png"
          alt="Alletre Logo"
          style="width: 150px; height: auto; margin-bottom: 10px"
        />
      </div>

      <!-- Animated Title -->
      <h1
        style="
          color: #2c3e50;
          text-align: center;
          margin-bottom: 30px;
          font-size: 28px;
          background: linear-gradient(to right, #a91d3a, #5b0c1f);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
        "
      >
        ✨ New Auction: ${updatedAuction.product.title} ✨
      </h1>

      <!-- Product Image with Enhanced Styling -->
      <div style="text-align: center; margin-bottom: 30px">
        <div
          style="
            background: white;
            padding: 10px;
            border-radius: 12px;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
            display: inline-block;
          "
        >
          <img
            src="${updatedAuction.product.images[0].imageLink}"
            alt="Product Image"
            style="
              width: 300px;
              height: auto;
              border-radius: 8px;
              transition: transform 0.3s ease;
            "
          />
        </div>
      </div>

      <p
        style="
          font-size: 16px;
          line-height: 1.6;
          text-align: center;
          margin-bottom: 30px;
          color: #9e1b24;
        "
      >
        Don't miss out on this exciting new auction! Check it out now on our
        platform.
      </p>

      <div style="text-align: center">
        <a
          href="${process.env.FRONT_URL}"
          style="
            display: inline-block;
            padding: 12px 24px;
            background-color: #a91d3a;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            font-weight: bold;
            transition: background-color 0.3s ease;
          "
        >
          View Auction Now
        </a>
      </div>

      <div
        style="
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #eee;
          text-align: center;
          color: #7f8c8d;
          font-size: 12px;
        "
      >
        <p>Terms and Conditions apply</p>
      </div>
    </div>
  </body>
</html>


     
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
            console.error(`Batch failed:`, result.error);
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
      console.log('emial batch service error : ', error);
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
