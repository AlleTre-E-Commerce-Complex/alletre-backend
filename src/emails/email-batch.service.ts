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
    console.log('send bulk email test 3', text);
    const html = `
  <head>
    <link
      rel="stylesheet"
      href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
    />
  </head>
  <body style="margin: 0; padding: 0; background-color: #f4f4f4">
    <div
      style="
        font-family: Arial, sans-serif;
        line-height: 1.6;
        text-align: center;1
        color: #333;
      "
    >
      <div
        style="
          background-color: #a91d3a;
          padding: 350px;
          color: white;
          margin: 50px auto; /* Adds top margin and centers horizontally */
          max-width: 600px; /* Sets the width of the container */
          text-align: center; /* Ensures the icon is centered */
          position: relative; /* Allows positioning of the image */
        "
      >
        <img
          src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/10.png?alt=media&token=38270fdb-8c83-4fb1-b51b-4ba4682ae827"
          alt="Alletre Logo"
          style="
            max-width: 150px;
            margin: 0 auto 20px;
            position: absolute;
            top: 90px; /* Moves the icon above the top edge of the container */
            left: 50%;
            transform: translateX(-50%); /* Centers the icon horizontally */
          "
        />

        <h2
          style="
            margin: -60px 0 0; /* Moves it upwards slightly */
            font-weight: bold; /* Makes the text bolder */
            font-size: 36px;
          "
        >
          New Auction
        </h2>
        <p style="margin-top: 50px; margin-bottom: 0; font-size: 26px">
          Don't miss out on this exciting new auction!
        </p>
        <p style="margin-bottom: 60px; font-size: 26px">
          Check it out now on our platform
        </p>

        <div
          style="
            background: white;
            padding: 10px;
            border-radius: 12px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            display: inline-block;
            border: 1px solid #eee;
          "
        >
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
        <h1
          style="
            text-align: center;
            margin-bottom: 30px;
            font-size: 28px;
            color: white;
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.1);
          "
        >
          ${updatedAuction.product.title}
        </h1>
      </div>

      <div style="padding: 20px; text-align: left; background-color: #f9f9f9">
        <div style="text-align: center; margin: 30px 0">
          <a
            href="${process.env.FRONT_URL}"
            style="
              display: inline-block;
              padding: 18px 30px;
              background-color: #a91d3a;
              color: white !important;
              text-decoration: none;
              border-radius: 10px; /* Increased border-radius for a more rounded button */
              font-weight: bold;
              mso-line-height-rule: exactly;
              width: 250px; /* Button width */
              text-align: center; /* Center the text */
              max-width: 100%;
              white-space: nowrap;
            "
          >
            <span
              style="
                display: block;
                width: 100%;
                text-align: center;
                letter-spacing: 3px;
                font-size: 19px;
                line-height: 30px; /* Increased line height to make text appear taller */
              "
            >
              View Auction Now!
            </span>
          </a>
          <h3
            style="
              margin-top: 30px;
              font-size: 24px;
              font-weight: bold;
              text-align: center;
              color: #a91d3a;
            "
          >
            Ecommerce and Online Auctions: Revolutionizing the Digital
            Marketplace
          </h3>
          <p
            style="
              width: 80%;
              margin: 0 auto;
              font-size: 16px;
              line-height: 1.5;
            "
          >
            The world of ecommerce and online auctions has significantly
            transformed the way people buy and sell goods and services. As
            technology continues to evolve, both of these models have shaped the
            digital economy, offering convenience, access, and new opportunities
            for both consumers and sellers alike. Let's dive deeper into how
            ecommerce and online auctions work, their benefits, challenges, and
            how they continue to shape the future of retail
          </p>
        </div>
        <div style="text-align: center; margin-top: 30px">
          <p style="font-size: 18px; font-weight: bold; margin-bottom: 10px">
            FOLLOW US!
          </p>
          <div style="text-align: center; margin-top: 30px">
          <!-- WhatsApp Icon -->
          <a
            href="https://wa.me/97172663004"
            target="_blank"
            style="margin: 0 10px; display: inline-block; text-decoration: none;"
          >
            <div
              style="width: 40px; height: 40px; border-radius: 50%; background-color: #a91d3a; display: flex; justify-content: center; align-items: center; box-shadow: 4px 8px 8px  rgba(0, 0, 0, 0.2);"
            >
              <i class="fa-brands fa-whatsapp" style="color: white; font-size: 20px"></i>
            </div>
          </a>

          <!-- Facebook Icon -->
          <a
            href="https://www.facebook.com/alletr.ae"
            target="_blank"
            style="margin: 0 10px; display: inline-block; text-decoration: none;"
          >
            <div
              style="width: 40px; height: 40px; border-radius: 50%; background-color: #a91d3a; display: flex; justify-content: center; align-items: center; box-shadow: 4px 8px 8px  rgba(0, 0, 0, 0.2);"
            >
              <i class="fa-brands fa-facebook" style="color: white; font-size: 20px"></i>
            </div>
          </a>

          <!-- TikTok Icon -->
          <a
            href="https://www.tiktok.com/@alletre.ae"
            target="_blank"
            style="margin: 0 10px; display: inline-block; text-decoration: none;"
          >
            <div
              style="width: 40px; height: 40px; border-radius: 50%; background-color: #a91d3a; display: flex; justify-content: center; align-items: center; box-shadow: 4px 8px 8px  rgba(0, 0, 0, 0.2);"
            >
              <i class="fa-brands fa-tiktok" style="color: white; font-size: 20px"></i>
            </div>
          </a>

          <!-- Snapchat Icon -->
          <a
            href="https://www.snapchat.com/add/alletre"
            target="_blank"
            style="margin: 0 10px; display: inline-block; text-decoration: none;"
          >
            <div
              style="width: 40px; height: 40px; border-radius: 50%; background-color: #a91d3a; display: flex; justify-content: center; align-items: center; box-shadow: 4px 8px 8px  rgba(0, 0, 0, 0.2);"
            >
              <i class="fa-brands fa-snapchat" style="color: white; font-size: 20px"></i>
            </div>
          </a>

          <!-- YouTube Icon -->
          <a
            href="https://www.youtube.com/@Alletre_ae"
            target="_blank"
            style="margin: 0 10px; display: inline-block; text-decoration: none;"
          >
            <div
              style="width: 40px; height: 40px; border-radius: 50%; background-color: #a91d3a; display: flex; justify-content: center; align-items: center; box-shadow: 4px 8px 8px  rgba(0, 0, 0, 0.2);"
            >
              <i class="fa-brands fa-youtube" style="color: white; font-size: 20px"></i>
            </div>
          </a>

          <p style="font-size: 16px; color: #333; margin-top: 15px;  letter-spacing: 6px;
                font-size: 26px;">
            www.alletre.com
          </p>
        </div>
       </div>
      </div>
  </body>
    
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
          console.log('worker message : ', result);
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
