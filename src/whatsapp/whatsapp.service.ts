import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as Twilio from 'twilio';
import { Worker } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';
@Injectable()
export class WhatsAppService {
  private client: Twilio.Twilio;
  private fromNumber: string;

  constructor(
    private readonly prismaService : PrismaService
  ) {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_WHATSAPP_NUMBER) {
      throw new Error('Missing Twilio environment variables.');
    }

    this.client = Twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    );

    this.fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;
  }

  async sendMessage(to: string, message: string) {
    try {
        console.log('-----___----____--->',to,message)
      const response = await this.client.messages.create({
        from: this.fromNumber,
        to: `whatsapp:${to}`, // Example: whatsapp:+971XXXXXXXXX
        body: message,
      });

      console.log('Message sent:', response.sid);
      return response;
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      throw error;
    }
  }



  

async sendAuctionToUsers(auctionId: string) {
    try {
        const auction = await this.prismaService.auction.findFirst({
            where: { id: Number(auctionId) },
            include: { product: { include: { images: true } } },
        });

        if (!auction) throw new Error('Auction not found');

        const { product } = auction;
        const mediaUrl = product.images[0]?.imageLink || '';
        const imageFileName = mediaUrl.split('/o/')[1] || '';

        const messageTemplateParams = {
            1: product.title,
            2: auction.startBidAmount.toString(),
            3: new Date(auction.startDate).toDateString(),
            4: new Date(auction.endDate).toDateString(),
            5: imageFileName,
            6: `${auction.id}/details`,
        };

        const allUsersList = await this.prismaService.nonRegisteredUser.findMany();

        const batchSize = 1000;
        const userBatches = [];

        for (let i = 0; i < allUsersList.length; i += batchSize) {
            userBatches.push(allUsersList.slice(i, i + batchSize));
        }

        console.log('Worker file exists:', fs.existsSync(path.join(__dirname, 'whatsappWorker.js')));

        const workers = userBatches.map((batch) => {
            return new Promise((resolve, reject) => {
                const workerPath = path.join(__dirname, 'whatsappWorker.js');

                const worker = new Worker(workerPath, {
                    workerData: {
                        users: batch,
                        messageTemplateParams,
                        fromNumber: this.fromNumber,
                        contentSid: process.env.WHATSAPP_CONTENT_SID,
                    },
                });

                worker.on('message', (result) => {
                    console.log('Worker finished:', result);
                    resolve(result);
                });

                worker.on('error', (error) => {
                    console.error('Worker error:', error);
                    reject(error);
                });

                worker.on('exit', (code) => {
                    if (code !== 0) {
                        console.error(`Worker stopped with exit code ${code}`);
                    }
                });
            });
        });

        const results = await Promise.allSettled(workers);

        return {
            success: true,
            message: 'Auction notifications sent successfully',
            results,
        };
    } catch (error) {
        console.error('Error sending WhatsApp messages:', error);
        throw error;
    }
}


  
  // async sendAuctionToUsers(auctionId: string) {
  //   try {
  //     // Fetch auction details
  //     const auction = await this.prismaService.auction.findFirst({
  //       where: { id: Number(auctionId) },
  //       include: { product: {include :{images :true}} }, // Ensure product details are included
  //     });
  
  //     if (!auction) {
  //       throw new Error('Auction not found');
  //     }
  // console.log('test auction : ',auction)
  //     // Extract auction details
  //     const { product } = auction;

  //     // const mediaUrl = product.images.map((images)=> images.imageLink)
  //     const mediaUrl = product.images[0].imageLink;
  //     const imageFileName = mediaUrl.split('/o/')[1]; // Get everything after '/o/'
  //     // Expected Output: uploadedImage-eef6d1f7-1e58-45eb-a703-cc392538c801.jpg?alt=media&token=eef6d1f7-1e58-45eb-a703-cc392538c801
  //     const messageTemplateParams = [
  //       product.title,  // {{1}} - Product Name
  //       auction.startBidAmount.toString(),  // {{2}} - Starting Price
  //       new Date(auction.startDate).toDateString(),  // {{3}} - Auction Start Date
  //       new Date(auction.endDate).toDateString(),  // {{4}} - Auction End Date
  //       imageFileName, // {{5}} imageLink
  //       `${auction.id}/details`, // {{6}} button link
  //     ];
      
      
  //     console.log('messageTemplateParams:',messageTemplateParams)
  //     console.log(' process.env.WHATSAPP_CONTENT_SID:', process.env.WHATSAPP_CONTENT_SID)

  //     // Fetch all users
  //     const allUsersList = await this.prismaService.nonRegisteredUser.findMany();
  
  //     for (const user of allUsersList) {
  //        await this.client.messages.create({
  //         from: this.fromNumber,
  //         to: `whatsapp:+971${user.mobile}`,  
  //         contentSid:  process.env.WHATSAPP_CONTENT_SID, // Your Twilio-approved template SID
  //         contentVariables: JSON.stringify({
  //           1: messageTemplateParams[0], 
  //           2: messageTemplateParams[1], 
  //           3: messageTemplateParams[2], 
  //           4: messageTemplateParams[3],
  //           5: messageTemplateParams[4],
  //           6: messageTemplateParams[5],
  //         }),
  //       });
  //     }
  
  //     return { success: true, message: 'Auction notifications sent successfully' };
  //   } catch (error) {
  //     console.error('Error sending WhatsApp message:', error);
  //     throw error;
  //   }
  // }
  
  
}
