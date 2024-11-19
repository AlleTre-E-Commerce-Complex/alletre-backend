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
                <h1>New Auction: ${updatedAuction.product.title}</h1>
                <p>Check it out on our site!</p>
                <img src="${
                  updatedAuction.product.images[0].imageLink
                }" alt="Product Image" style="width:300px; height:auto;" />
                <a class="button" href="${
                  process.env.FRONT_URL
                }"><span>${'Click here to visite the site'}</span></a>
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
