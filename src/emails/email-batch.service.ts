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
  
   <body style="margin: auto; padding: 0; background-color: #ffffff; max-width: 600px; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="padding: 20px; text-align: center;">
      <div
        style="
          background-color: #a91d3a;
          padding: 20px;
          color: white;
          margin: 20px auto;
          text-align: center;
          position: relative;
          max-width: 100%;
        "
      >
        <img
          src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/10.png?alt=media&token=38270fdb-8c83-4fb1-b51b-4ba4682ae827"
          alt="Alletre Logo"
          style="
            max-width: 80px;
            position: absolute;
            top: 30px;
            left: 50%;
            transform: translateX(-50%);
          "
        />
        <h2 style="margin: 30px 0 20px; font-size: 24px; font-weight: bold;">New Auction</h2>
        <div style="max-width: 600px; margin: 0 auto;">
      <p style="margin: 0; padding: 0; font-size: 14px; font-size: min(16px, 3.5vw); line-height: 1.2;">
        Don't miss out on this exciting new auction!
      </p>
      <p style="margin: 0; padding: 0; font-size: 14px; font-size: min(16px, 3.5vw); line-height: 1.2;">
        Check it out now on our platform
      </p>
    </div>
        <div style="margin: 50px auto; text-align: center;">
           <img
               src="${updatedAuction.product.images[0].imageLink}"
             alt="Product Image"
            style="width: 100%; max-width: 300px; height: auto; border-radius: 8px; display: inline-block;"
            />
        </div>
       <h1
         style="font-size: min(24px, 5vw);"
      >
         ${updatedAuction.product.title}
      </h1>
      
      </div>
      <a
          href="https://www.alletre.com/alletre/home/${updatedAuction.id}/details"
          style="
            display: inline-block;
            padding: 12px 20px;
            background-color: #a91d3a;
            color: white;
            text-decoration: none;
            border-radius: 10px;
            font-weight: bold;
            margin: 20px 0;
            text-align: center;
            font-size: 18px;
          "
        >
          View Auction Now!
        </a>
       <h3
        style="
          margin-top: 30px;
          font-size: min(24px, 5vw);
          font-weight: bold;
          color: #a91d3a;
        "
      >
     Ecommerce and Online Auctions: Revolutionizing the Digital 
    Marketplace
      </h3>
      <p
        style="
          margin: 20px auto;
          font-size: 16px;
          line-height: 1.5;
          max-width: 80%;
        "
      >
    The world of ecommerce and online auctions has 
significantly transformed the way people buy and sell goods 
and services. As technology continues to evolve, both of these 
models have shaped the digital economy, offering convenience, 
access, and new opportunities for both consumers and sellers 
alike. Let's dive deeper into how ecommerce and online 
auctions work, their benefits, challenges, and how they continue 
to shape the future of retail.
      </p>

      <div style="margin: 20px 0;">
        <!-- Instagram Icon -->
        <a href="https://www.instagram.com/alletre.ae/" target="_blank" style="margin: 0 5px; display: inline-block;">
          <img
            src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/instagram%20Icon.png?alt=media&token=4ca91fcd-2e6f-476c-a0e6-fb6c81c0ac47"
            alt="Instagram"
            style="width: 30px; height: 30px;"
          />
        </a>

        <!-- Facebook Icon -->
        <a href="https://www.facebook.com/alletr.ae" target="_blank" style="margin: 0 5px; display: inline-block;">
          <img
            src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/Facebook%20Icon.png?alt=media&token=15e160e4-1bfb-4e81-9a12-1c41f83edabb"
            alt="Facebook"
            style="width: 30px; height: 30px;"
          />
        </a>

        <!-- Snapchat Icon -->
        <a href="https://www.snapchat.com/add/alletre" target="_blank" style="margin: 0 5px; display: inline-block;">
          <img
            src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/Snapchat%20Icon.png?alt=media&token=1a20756e-84f5-4e33-bf1a-f935e626e9b7"
            alt="Snapchat"
            style="width: 30px; height: 30px;"
          />
        </a>

        <!-- TikTok Icon -->
        <a href="https://www.tiktok.com/@alletre.ae" target="_blank" style="margin: 0 5px; display: inline-block;">
          <img
            src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/Tick%20Tok%20Icon.png?alt=media&token=6bb9d534-2031-4bf2-870d-a867be937d83"
            alt="TikTok"
            style="width: 30px; height: 30px;"
          />
        </a>

        <!-- YouTube Icon -->
        <a href="https://www.youtube.com/@Alletre_ae" target="_blank" style="margin: 0 5px; display: inline-block;">
          <img
            src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/Youtube%20Icon.png?alt=media&token=ccb87278-f063-4838-9b02-7ceffae7c710"
            alt="YouTube"
            style="width: 30px; height: 30px;"
          />
        </a>
      </div>

      <p
        style="
          font-size: 16px;
          margin-top: 20px;
          color: #333;
          letter-spacing: 5px
        "
      >
        www.alletre.com
      </p>
        <a
      href="https://www.alletre.com"
      style="
        display: inline-block;
        padding: 2px 8px;
        background-color: #a91d3a;
        color: white;
        text-decoration: none;
        border-radius: 5px;
        font-size: 12px;
        margin-top: 10px;
      "
    >
      Unsubscribe
    </a>
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
