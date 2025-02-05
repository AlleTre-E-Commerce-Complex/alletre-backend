import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as Twilio from 'twilio';

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
      // Fetch auction details
      const auction = await this.prismaService.auction.findFirst({
        where: { id: Number(auctionId) },
        include: { product: {include :{images :true}} }, // Ensure product details are included
      });
  
      if (!auction) {
        throw new Error('Auction not found');
      }
  console.log('test auction : ',auction)
      // Extract auction details
      const { product } = auction;
      const message = `🔥 *New Auction Alert!* 🔥
  
  🛒 *${product.title}*  
  💰 Starting Price: *$${auction.startBidAmount}*  
  📅 Auction Date: ${new Date(auction.createdAt).toDateString()}  
  
  🔗 *Join now:* https://alletre.com/auctions/${auction.id}
  `;
  
      // const mediaUrl = product.images.map((images)=> images.imageLink)
      const mediaUrl = product.images[0].imageLink
      console.log('mediaUrl :', mediaUrl)
      const messageTemplateParams = [
        product.title,  // {{1}} - Product Name
        auction.startBidAmount.toString(),  // {{2}} - Starting Price
        new Date(auction.startDate).toDateString(),  // {{3}} - Auction Start Date
        new Date(auction.endDate).toDateString(),  // {{4}} - Auction End Date
        `https://www.alletre.com/alletre/home/${auction.id}/details`,  // {{5}} - Auction Link
        `uploadedImage-017b637c-9961-4a20-9414-23bc93d1318c?alt=media&token=017b637c-9961-4a20-9414-23bc93d1318c`, // {{6}} imageLink
        `${auction.id}/details`, // {{7}} button link
      ];
      
      
      console.log('messageTemplateParams:',messageTemplateParams)
     const messageSendResponds =   await this.client.messages.create({
        from: this.fromNumber,
        to: `whatsapp:${+919847678427}`,  
        contentSid: "HX7d703ad7116139febc007de19dd23fef", // Your Twilio-approved template SID
        contentVariables: JSON.stringify({
          1: messageTemplateParams[0], 
          2: messageTemplateParams[1], 
          3: messageTemplateParams[2], 
          4: messageTemplateParams[3],
          5: messageTemplateParams[4],
          6: messageTemplateParams[5],
          7: messageTemplateParams[6],
        }),
        // mediaUrl: ['https://firebasestorage.googleapis.com/v0/b/alletre-auctions.firebasestorage.app/o/tick%20mark%20failed%20mark-02.png?alt=media&token=69f43881-b26e-43ef-b4c2-a595feb1f16b']
        // mediaUrl: mediaUrl.length > 0 ? [mediaUrl]: undefined
      });
      
    //   console.log('messageSendResponds :',messageSendResponds)
      return messageSendResponds
      // return await this.client.messages.create({
      //   from: this.fromNumber,
      //   to: `whatsapp:${+971521236711}`, // Example: whatsapp:+971XXXXXXXXX
      //   body: message,
      //   // mediaUrl: mediaUrl ? [mediaUrl] : undefined, // Attach product image if available
        
      //   // mediaUrl: undefined, 
      // });
      // Fetch all users
    //   const allUsersList = await this.prismaService.user.findMany();
  
    //   for (const user of allUsersList) {
    //     await this.client.messages.create({
    //       from: this.fromNumber,
    //       to: `whatsapp:${user.phone}`, // Example: whatsapp:+971XXXXXXXXX
    //       body: message,
    //       mediaUrl: mediaUrl ? [mediaUrl] : undefined, // Attach product image if available
    //     });
    //   }
  
    //   return { success: true, message: 'Auction notifications sent successfully' };
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      throw error;
    }
  }
  
  
}
