import { Injectable } from '@nestjs/common';
import { Worker } from 'worker_threads';
import * as path from 'path';
import { PrismaService } from 'src/prisma/prisma.service';
import { fork } from 'child_process';

@Injectable()
export class EmailBatchService {
  constructor(private readonly prismaService: PrismaService) {}
  private batchSize = 100; // Customize batch size as needed

  async sendBulkEmails(updatedAuction: any, currentUserEmail?: string) {
    try {
      const users = await this.getAllRegisteredUsers(
        1000,
        updatedAuction.user.email,
      );

      const subject = `🚨 New Auction Alert: Don't Miss Out!`;
      const text = `A new auction has been listed: ${updatedAuction.product.title}`;
      const html = this.generateEmailTemplate(updatedAuction);

      const userBatches = this.chunkArray(users, this.batchSize);
      const childProcesses = [];
      const results = [];

      for (const batch of userBatches) {
        const child = fork(path.resolve(__dirname, 'email.child.js'));

        const timeout = setTimeout(() => {
          console.log('Child process timeout - killing process');
          child.kill();
        }, 30000);

        child.on('message', (result: any) => {
          clearTimeout(timeout);
          results.push(result);
          if (result.success) {
            console.log(`Batch sent successfully`);
          } else {
            console.error(`Batch failed:`, result.error);
          }
        });

        child.on('error', (error) => {
          clearTimeout(timeout);
          console.error('Child process error:', error);
          results.push({ success: false, error: error.message });
        });

        child.on('exit', (code, signal) => {
          clearTimeout(timeout);
          if (code !== 0) {
            console.error(`Child process exited with code ${code}, signal: ${signal}`);
          }
        });

        child.send({ users: batch, subject, text, html });
        childProcesses.push({ child, timeout });
      }

      try {
        await Promise.all(
          childProcesses.map(
            ({ child }) =>
              new Promise<void>((resolve) => {
                child.on('exit', () => resolve());
              }),
          ),
        );
      } finally {
        childProcesses.forEach(({ child, timeout }) => {
          clearTimeout(timeout);
          if (!child.killed) {
            child.kill();
          }
        });
      }

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success).length;
      console.log(`Bulk email sending completed. Success: ${successCount}, Failures: ${failureCount}`);

    } catch (error) {
      console.error('Email batch service error:', error);
      throw error;
    }
  }

  private generateEmailTemplate(updatedAuction: any): string {
    const expiryDate = new Date(updatedAuction.expiryDate);
    const formattedDate = expiryDate.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const html = `
  
   <body style="margin: auto; padding: 0; background-color: #ffffff; max-width: 600px; font-family: Montserrat; line-height: 1.6; color: #a; ">
  <div style="padding: 20px; text-align: center;">
    <div
      style="
        background-color: #F9F9F9;
        padding: 20px;
        color: white;
        margin: 40px auto;
        text-align: center;
        position: relative;
        max-width: 100%;
        border-radius: 15px;
      "
    >
      <img
        src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/logoForEmail.png?alt=media&token=8e56c373-b4d6-404f-8d2c-a503dfa71052"
        alt="Alletre Logo"
        style="
          max-width: 80px;
          position: absolute;
          padding-top: 20px;
          display: block;
        "
      />
      <h3
        style="
          margin-top: 30px;
          font-size: min(22px, 4vw); /* Smaller size for mobile */
          font-weight: bold;
          color: #a91d3a;
        "
      >
        A New Auction Just Went Live!
      </h3>
      <h2 style="margin: 50px 0px 19px;  font-size: min(17px, 3vw);  color: #333; text-align: left; font-weight: 500">
        Hi Alletre member,
      </h2>

      <div
        style="
          margin: 20px auto;
          font-size: min(15px, 3vw); /* Adjust font size for mobile */
          line-height: 1.2; /* Slightly tighter line height for mobile */
          max-width: 90%; /* Ensure proper fit on smaller screens */
          color:  #333;
          text-align: left;
        "
      >
        <p>
          Exciting news! A brand-new auction has just been listed on <b>Alletre</b>, and we think you’ll love it.
        </p>
      <p>Auction Details:</p>
<ul style="margin: 0; padding-left: 20px; color:  #333; font-size: min(13px, 3vw);">
  <li>Title: ${updatedAuction.product.title}</li>
  <li>Category: ${updatedAuction.product.category.nameEn}</li>
  <li>Starting Bid: ${updatedAuction.startBidAmount}</li>
  <li>Ends On: ${formattedDate}</li>
</ul>

        <p>This is your chance to snag an incredible deal or score a rare find. Don’t wait too long—bids are already rolling in!</p>

        <div style="text-align: center;">
          <a
            href=" https://www.alletre.com/alletre/home/${updatedAuction.id}/details"
            style="
              display: inline-block;
              padding: 12px 20px;
              background-color: #a91d3a !important;
              -webkit-background-color: #a91d3a !important;
              -moz-background-color: #a91d3a !important;
              color: #ffffff !important;
              text-decoration: none;
              border-radius: 10px;
              font-weight: bold;
              margin: 20px 0;
              font-size: 18px;
            "
          >
            View Auction
          </a>
      
    
      </div>
     
         
     

      <div style="margin: 50px auto; text-align: center;">
           <img
               src="${updatedAuction.product.images[0].imageLink}"
             alt="Product Image"
            style="width: 100%; max-width: 300px; height: auto; border-radius: 8px; display: inline-block;"
            />
        </div>
        <h3>Why Bid on Alletre ?</h3>
    <p style="color: #707070; font-size: min(13px, 3vw);">
  <img src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/tick%20mark%20icon.jpg?alt=media&token=20f3d486-c83e-4cae-9876-f15391cc3682" 
       alt="tick" 
       style="width: 16px; position: relative; "> 
  Unique items from trusted sellers<br>
  <img src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/tick%20mark%20icon.jpg?alt=media&token=20f3d486-c83e-4cae-9876-f15391cc3682" 
       alt="tick" 
       style="width: 16px; position: relative; "> 
  Safe and secure bidding<br>
  <img src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/tick%20mark%20icon.jpg?alt=media&token=20f3d486-c83e-4cae-9876-f15391cc3682" 
       alt="tick" 
       style="width: 16px; position: relative;"> 
  Exciting deals and discounts
</p>



        
 <p >Get in on the action before it’s too late. Visit <b>Alletre</b> now to explore this auction and others like it!.</p>
   
       <div style="text-align: center;">
          <a
            href="https://www.alletre.com/"
            style="
              display: inline-block;
              padding: 12px 20px;
              background-color: #a91d3a !important;
              -webkit-background-color: #a91d3a !important;
              -moz-background-color: #a91d3a !important;
              color: #ffffff !important;
              text-decoration: none;
              border-radius: 10px;
              font-weight: bold;
              margin: 20px 0;
              font-size: 18px;
            "
          >
           Explore Auctions 
          </a>
      
    
      </div>
      <p>Thank you for being part of the <b>Alletre</b> community. We’re thrilled to bring you opportunities like this every day!</p>
       <p>Happy bidding,<br>
The <b>Alletre</b> Team
</p>
        <p>P.S. Keep your eyes on your inbox for more exclusive auction updates!</p>
         </div>
       <h3
  style="
    margin: 30px auto 20px auto; /* Matches auto margins of the p element */
    font-size: min(16px, 4vw); /* Smaller size for mobile */
    font-weight: bold;
    color: #a91d3a;
    text-align: left; /* Align text to the left */
    max-width: 90%; /* Ensure proper fit and alignment */
  "
>
  Ecommerce and Online Auctions: Revolutionizing the Digital Marketplace
</h3>
<p
  style="
    margin: 20px auto;
    font-size: min(13px, 3vw); /* Adjust font size for mobile */
    line-height: 1.4; /* Slightly tighter line height for mobile */
    max-width: 90%; /* Ensure proper fit on smaller screens */
    text-align: left;
    color: #707070;
  "
>
  The world of ecommerce and online auctions has significantly transformed the way people buy and sell goods and services. As technology continues to evolve, both of these models have shaped the digital economy, offering convenience, access, and new opportunities for both consumers and sellers alike. Let's dive deeper into how ecommerce and online auctions work, their benefits, challenges, and how they continue to shape the future of retail.
</p>



<p style = "font-size: min(16px, 4vw); color:#707070">FOLLOW US!</p>
      <div style="margin: 20px 0 ;">
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
          margin-top: -20px;
          color: #333;
          letter-spacing: 4px
        "
      >
        www.alletre.com
      </p>
 <p
  style="
    margin: 20px auto;
    font-size: min(10px, 3vw); /* Adjust font size for mobile */
    line-height: 1.4; /* Slightly tighter line height for mobile */
    max-width: 90%; /* Ensure proper fit on smaller screens */
    color: #ACACAC;
  "
>
  This email was sent to you
  because you indicated that you'd like to receive new, Auctions, and updates from Alletre. If you don't want to receive such emails in the future, please 
  <a 
    href="unsubscribe-link-here" 
    style="
      display: inline-block;
      color: blue; /* Text color */
      text-decoration: underline; /* Add underline */
      background: none; /* No background */
      border: none; /* No border */
      padding: 0; /* Remove padding */
      font-size: inherit; /* Match the paragraph font size */
    "
  >
    Unsubscribe Here
  </a>.
</p>
    </div>
  </body>
    `;
    return html;
  }

  private chunkArray(array: string[], size: number): string[][] {
    const result: string[][] = [];
    for (let i = 0; i < array.length; i += size) {
      result.push(array.slice(i, i + size));
    }
    return result;
  }
  async getAllRegisteredUsers(batchSize = 1000, currentUserEmail?: string) {
    const emails = [];
    let skip = 0;
    let batch: any;

    try {
      do {
        batch = await this.prismaService.user.findMany({
          skip: skip,
          take: batchSize,
          select: {
            email: true,
          },
          where: {
            email: currentUserEmail ? { not: currentUserEmail } : undefined,
          },
        });

        emails.push(...batch.map((user: any) => user.email));

        skip += batchSize;
      } while (batch.length > 0);

      return emails;
    } catch (error) {
      console.log(
        'Error while fetching user email address for bulk email:',
        error,
      );
    }
  }
}
