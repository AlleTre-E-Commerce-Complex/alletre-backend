import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as Twilio from 'twilio';
import { Worker } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
@Injectable()
export class WhatsAppService {
  private client: Twilio.Twilio;
  private fromNumber: string;

  constructor(private readonly prismaService: PrismaService) {
    if (
      !process.env.TWILIO_ACCOUNT_SID ||
      !process.env.TWILIO_AUTH_TOKEN ||
      !process.env.TWILIO_WHATSAPP_NUMBER
    ) {
      throw new Error('Missing Twilio environment variables.');
    }

    this.client = Twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    );

    this.fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;
  }

  async sendMessage(to: string, message: string) {
    if(process.env.NODE_ENV === 'production'){
      try {
      const response = await this.client.messages.create({
        from: this.fromNumber,
        to: `whatsapp:${to}`, // Example: whatsapp:+971XXXXXXXXX
        body: message,
      });
      return response;
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      throw error;
    }}
  }

  async sendOtherUtilityMessages(
    messageTemplateParams: any,
    mobile: any,
    templateName: string,
  ) {
   if(process.env.NODE_ENV === 'production'){
     try {
      console.log('sendOtherUtilitymessage');
      if (mobile.startsWith('+971')) {
        mobile = mobile.substring(4);
      } else if (mobile.startsWith('0')) {
        mobile = mobile.substring(1);
      }
      if (!/^\d{9}$/.test(mobile)) {
        console.log(`Invalid number skipped: ${mobile}`);
        return;
        // throw Error('`Invalid number skipped: ${mobile}`')
      }

      try {
        // Construct the Gupshup API payload
        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: `971${mobile}`, // Correct format for the recipient number
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en' },
            components: [
              {
                type: 'header',
                parameters: [
                  {
                    type: 'image',
                    image: {
                      link: messageTemplateParams[8],
                    },
                  },
                ],
              },
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: messageTemplateParams[1] },
                  { type: 'text', text: messageTemplateParams[2] },
                  { type: 'text', text: messageTemplateParams[3] },
                  { type: 'text', text: messageTemplateParams[4] },
                  { type: 'text', text: messageTemplateParams[5] },
                  { type: 'text', text: messageTemplateParams[6] },
                  { type: 'text', text: messageTemplateParams[7] },
                ],
              },
              templateName === 'alletre_common_utility_templet'
                ? {
                    type: 'button',
                    sub_type: 'url',
                    index: 0,
                    parameters: [
                      {
                        type: 'text',
                        text: `${messageTemplateParams[9]}`,
                      },
                    ],
                  }
                : null,
            ].filter(Boolean), // Removes null/false values
          },
        };

        // Send the request to Gupshup
        const response = await axios.post(
          'https://partner.gupshup.io/partner/app/196a6e5a-95bf-4ba8-8a30-0f8627d75447/v3/message',
          payload,
          {
            headers: {
              accept: 'application/json',
              Authorization: 'sk_808029f6198240c788d9037099017a4a',
              'Content-Type': 'application/json',
            },
          },
        );

        // Log response or handle success/failure
        // console.log(`Message sent to ${mobile}:`, response.data);
      } catch (error) {
        console.log(
          `Failed to send message to: ${mobile} | Error: ${error.message}`,
        );
        // failedMessages.push({ user: mobile, error: error.message });
      }
    } catch (error) {
      console.error('Error sending WhatsApp messages:', error);
      throw error;
    }}
  }

  async sendAuctionToUsers(
    auctionId: any,
    userType: 'EXISTING_USER' | 'NON_EXISTING_USER',
  ) {
 if(process.env.NODE_ENV === 'production'){
     try {
      const auction = await this.prismaService.auction.findFirst({
        where: { id: Number(auctionId) },
        include: { product: { include: { images: true } } },
      });

      if (!auction) throw new Error('Auction not found');

      const { product } = auction;
      const mediaUrl = product.images[0]?.imageLink || '';

      const messageTemplateParams = {
        1: `*${
          product.title
        } starts on AED ${auction.startBidAmount.toString()}*`,
        2: `📅 *Auction Starts:* ${new Date(auction.startDate).toString()}`,
        3: `⏳ *Auction Ends:* ${new Date(auction.expiryDate).toString()}`,
        4: mediaUrl,
        5: `${auction.id}/details`,
      };
      let allUsersList: any[] = []; // Initialize as an empty array
      const unsubscribedUser = await this.prismaService.unsubscribedUser.findMany({
        select:{phone: true}
      })
      const unsubscribedPhones = unsubscribedUser.map(u => u.phone);

      if (userType === 'NON_EXISTING_USER') {
        allUsersList = await this.prismaService.nonRegisteredUser.findMany({
          where:{
            mobile: {
              notIn : unsubscribedPhones
            }
          },
        });
      } else if (userType === 'EXISTING_USER') {
        allUsersList = await this.prismaService.user.findMany({
          where:{
            phone: {
              notIn : unsubscribedPhones
            }
          },
        });
      }
      // console.log('allUsersList',allUsersList)
      const batchSize = 1000;
      const userBatches = [];

      for (let i = 0; i < allUsersList.length; i += batchSize) {
        userBatches.push(allUsersList.slice(i, i + batchSize));
      }

      const workers = userBatches.map((batch) => {
        return new Promise((resolve, reject) => {
          const workerPath = path.join(__dirname, 'whatsappWorker.js');
          const worker = new Worker(workerPath, {
            workerData: {
              users: batch,
              messageTemplateParams,
              templateName: 'alletre_auction_utility_templet_two',
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

      // const results = await Promise.allSettled(workers);
      const results = []

      return {
        success: true,
        message: 'Auction notifications sent successfully',
        results,
      };
    } catch (error) {
      console.error('Error sending WhatsApp messages:', error);
      throw error;
    }}
  }

  async sendCommonMessageToUsers(
    messages: any,
    userType: 'EXISTING_USER' | 'NON_EXISTING_USER',
    mediaUrl?: string,
    buttonUrl?: string,
    limit?: number,
    skip?: number,
    categoryId?: number,
  ) {
    if(process.env.NODE_ENV === 'production'){
      try {
      const messageTemplateParams = {
        // 1: '*🏡 Properties | 🚗 Cars | 💎 Jewelry | 📱 Electronics | 🏠 Home Appliances | 🏺 Antiques | 🛋️ Furniture*',
        1: messages[0],
        // 2: '✨ Whether you are a collector, bargain hunter, or seller, Alletre Online Auction is your go-to platform to buy & sell unique, high-value items! 💰🚀',
        2: messages[1],
        // 3: '🔓 Unlock amazing opportunities today!'
        3: messages[2],

        4: mediaUrl,
      };

      // console.log('mesage 999', messageTemplateParams);
      let allUsersList: any[] = []; // Initialize as an empty array
      const unsubscribedUser = await this.prismaService.unsubscribedUser.findMany({
        select:{phone: true}
      })
      const unsubscribedPhones = unsubscribedUser.map(u => u.phone);
      if (userType === 'NON_EXISTING_USER') {
        allUsersList = await this.prismaService.nonRegisteredUser.findMany({
          where:{
            mobile: {
              notIn : unsubscribedPhones
            }
          },
          ...(typeof categoryId === 'number' && !isNaN(categoryId)
            ? { where: { categoryId } }
            : {}),
          ...(typeof limit === 'number' && !isNaN(limit) && limit > 0
            ? { take: limit }
            : {}),
          ...(typeof skip === 'number' && !isNaN(skip) && skip > 0
            ? { skip: skip }
            : {}),
        });
      } else if (userType === 'EXISTING_USER') {
        allUsersList = await this.prismaService.user.findMany({
          where: {
            phone: {
              notIn: unsubscribedPhones
            }
          },
          ...(typeof limit === 'number' && !isNaN(limit) && limit > 0
            ? { take: limit }
            : {}),
          ...(typeof skip === 'number' && !isNaN(skip) && skip > 0
            ? { skip: skip }
            : {}),
        });
      }

      const batchSize = 1000;
      const userBatches = [];
      
      for (let i = 0; i < allUsersList.length; i += batchSize) {
        userBatches.push(allUsersList.slice(i, i + batchSize));
      }

      // console.log(
      //   'Worker file exists:',
      //   fs.existsSync(path.join(__dirname, 'whatsappWorker.js')),
      // );

      const workers = userBatches.map((batch) => {
        return new Promise((resolve, reject) => {
          const workerPath = path.join(__dirname, 'whatsappWorker.js');

          const worker = new Worker(workerPath, {
            workerData: {
              users: batch,
              messageTemplateParams,
              templateName: 'alletre_common_messeages',
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

      // const results = await Promise.allSettled(workers);
      const results = []

      return {
        success: true,
        message: 'Auction notifications sent successfully',
        results,
        allUsersList,
      };
    } catch (error) {
      console.error('Error sending WhatsApp messages:', error);
      throw error;
    }}
  }

  async handleWhatsAppWhebhook(webhookBody: any) {
    try {
      const message = webhookBody?.payload?.payload?.text?.toUpperCase();
      const phone = webhookBody?.payload?.sender?.phone;

      if (!phone) {
        console.log('No phone number found in webhook payload');
        return;
      }

      if (message === 'STOP') {
        const isUnsubscribed = await this.isUnsubscribed(phone);
        if (isUnsubscribed) {
          console.log(`The mobile number ${phone} is already unsubscribed`);
          return;
        }
        await this.addUnsubscribedUser(phone, message);
        return {
          reply:
            'You have successfully unsubscribed, If you would like to Subscribe again, reply START',
        };
      }

      if (message === 'START') {
        const isUnsubscribed = await this.isUnsubscribed(phone);
        if (!isUnsubscribed) {
          console.log(`The mobile number ${phone} is not unsubscribed yet`);
          return;
        }
        await this.removeUnsubscribeUser(phone);
        return { reply: 'You have successfully subscribed again' };
      }
    } catch (error) {
      console.log('Handle whatsapp  webhook error : ', error);
    }
  }

  async addUnsubscribedUser(phone: string, reason?: string) {
    return this.prismaService.unsubscribedUser.upsert({
      where: { phone },
      update: { reason },
      create: { phone, reason },
    });
  }
  async removeUnsubscribeUser(phone: string) {
    return this.prismaService.unsubscribedUser.delete({
      where: { phone },
    });
  }
  async isUnsubscribed(phone: string): Promise<boolean> {
    const user = await this.prismaService.unsubscribedUser.findUnique({
      where: { phone },
    });
    return !!user;
  }

  async SendInspectionDetails(currentUserId:string, aucitonId: string, mobile: string) {

    try {
     console.log('SendInspectionDetails');
     if (mobile.startsWith('+971')) {
       mobile = mobile.substring(4);
     } else if (mobile.startsWith('0')) {
       mobile = mobile.substring(1);
     }
     if (!/^\d{9}$/.test(mobile)) {
       console.log(`Invalid number skipped: ${mobile}`);
       return;
       // throw Error('`Invalid number skipped: ${mobile}`')
     }
     const aucitonData = await this.prismaService.auction.findFirst({
      where:{
        id: Number(aucitonId)
      },
      include:{
        user: true,
        location: true,
      }
     })
     const currentUserData = await this.prismaService.user.findFirst({
      where :{id:Number(currentUserId)}
     })
     try {
       const templateName ='send_inpection_details'
       console.log('lat ...',aucitonData.location.lat)
       const googleLocationLink  = aucitonData.location.lat ? `🗺️ Google map: https://www.google.com/maps?q=${aucitonData.location.lat},${aucitonData.location.lng}` : ' ';
       const messageTemplateParams = {
         1 : currentUserData.userName,
         2 : aucitonData.user.userName,
         3 : aucitonData.user.phone,
         4 : aucitonData.location.address,
         5 : googleLocationLink,
       }
       console.log('messageTemplateParams',messageTemplateParams)
       // Construct the Gupshup API payload
       const payload = {
         messaging_product: 'whatsapp',
         recipient_type: 'individual',
         to: `${currentUserData?.phone}`, // Correct format for the recipient number
         type: 'template',
         template: {
           name: templateName,
           language: { code: 'en' },
           components: [
             {
               type: 'body',
               parameters: [
                 { type: 'text', text: messageTemplateParams[1] },
                 { type: 'text', text: messageTemplateParams[2] },
                 { type: 'text', text: messageTemplateParams[3] },
                 { type: 'text', text: messageTemplateParams[4] },
                 { type: 'text', text: messageTemplateParams[5] },
               ],
             },
           ].filter(Boolean), // Removes null/false values
         },
       };

       // Send the request to Gupshup
       const response = await axios.post(
         'https://partner.gupshup.io/partner/app/196a6e5a-95bf-4ba8-8a30-0f8627d75447/v3/message',
         payload,
         {
           headers: {
             accept: 'application/json',
             Authorization: 'sk_808029f6198240c788d9037099017a4a',
             'Content-Type': 'application/json',
           },
         },
       );

       // Log response or handle success/failure
       console.log(`Message sent to ${mobile}:`, response.data);
       if(response){
        return {success : true}
       }else{
        return {success : false}
       }
     } catch (error) {
       console.log(
         `Failed to send message to: ${mobile} | Error: ${error.message}`,
       );
       // failedMessages.push({ user: mobile, error: error.message });
     }
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
