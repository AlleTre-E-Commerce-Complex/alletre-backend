import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from 'src/prisma/prisma.service';
import * as sgMail from '@sendgrid/mail';
import { fork } from 'child_process';

@Injectable()
export class EmailBatchService {
  constructor(private readonly prismaService: PrismaService) {}
  // private batchSize = 100; // Customize batch size as needed

  async sendBulkEmails(updatedAuction: any, currentUserEmail?: string) {
    try {
   
        const emails = await this.getAllRegisteredUsers(
          updatedAuction.user.email,
        );
        console.log('email length:',emails.length)
        console.log('updatedAuction:',updatedAuction)
        const subject = updatedAuction.bids.length > 0 ? '🔥 This Auction Is Heating Up – Don’t Miss Out!' : `🚨 New Auction Alert: Don't Miss Out!`;
        const text = `A new auction has been listed: ${updatedAuction.product.title}`;
        const html = this.generateEmailTemplate(updatedAuction);
  
        const childPath = path.join(__dirname, 'email.child.js'); // adjust path if needed
        const child = fork(childPath);
  
        child.send({ users: emails, subject, text, html });
  
        child.on('message', (message:any) => {
          if (message?.success) {
            console.log('✅ Email sending succeeded in child process');
          } else {
            console.error('❌ Email sending failed in child process:', message.error);
          }
        });
  
        child.on('exit', (code) => {
          console.log(`📤 Email child process exited with code ${code}`);
        });
    
      
    } catch (error) {
      console.error('Email batch service error:', error);
      throw error;
    }
  }

  async getAllRegisteredUsers(currentUserEmail?: string): Promise<string[]> {
    // Fire both queries in parallel
    // const unsubscribedUser = await this.prismaService.unsubscribedUser.findMany({
    //   select:{email: true}
    // })
    // const unsubscribedEmails  = unsubscribedUser.map(u => u.email);
    const [normal, nonReg] = await Promise.all([
      this.prismaService.user.findMany({
        select: { email: true },
        where: {
          // email: { not: null, ...(currentUserEmail ? { notIn: [currentUserEmail] } : {}) }
          email: {
            not: null,
            notIn: [
              ...(currentUserEmail ? [currentUserEmail] : []),
              // ...unsubscribedEmails
            ]
          },
          isBlocked: false
        }
      }),
      this.prismaService.nonRegisteredUser.findMany({
        select: { email: true },
        // where: { email: { not: null } }
        where: {
          email: {
            not: null,
            // notIn: unsubscribedEmails
          }
        }
      })
    ]);
  
    const allEmails = [
      ...normal.map(u => u.email),
      ...nonReg.map(u => u.email)
    ];
  
    // Email regex (standard format)
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  
    // Filter only valid emails
    const validEmails = allEmails.filter(email => emailRegex.test(email));
  
    console.log('normalEmails:', normal.length);
    console.log('nonRegEmails:', nonReg.length);
    console.log(`Fetched ${allEmails.length} emails`);
    console.log(`Valid emails: ${validEmails.length}, Invalid: ${allEmails.length - validEmails.length}`);
  
    return validEmails;
  }
  

  private generateEmailTemplate(updatedAuction: any): string {
    const date = updatedAuction.type === 'SCHEDULED' 
    ? new Date(updatedAuction.startDate) 
    : new Date(updatedAuction.expiryDate);
    const lastBid = updatedAuction.bids[updatedAuction.bids.length - 1];
    const CurrentBidAmount = lastBid ? lastBid.amount : 0;
    const subjectLine = updatedAuction.bids.length
  ? 'This Auction Is Heating Up – Don’t Miss Out!'
  : updatedAuction.type === 'SCHEDULED'
    ? 'A New Auction Has Just Listed'
    : 'A New Auction Just Went Live!';

    const formattedDate = date.toLocaleString('en-US', {
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
      ${subjectLine}
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
          ${updatedAuction.bids.length > 0 
            ? `🔥 The bidding is getting intense! The auction titled "Test in" has just reached AED ${CurrentBidAmount} and interest is growing fast. If you’ve been thinking about joining in—now’s the time!`
            :'Exciting news! A brand-new auction has just been listed on <b>Alletre</b>, and we think you’ll love it.'}
        </p>
      <p>Auction Details:</p>
      <ul style="margin: 0; padding-left: 20px; color:  #333; font-size: min(13px, 3vw);">
        <li>Title: ${updatedAuction.product.title}</li>
        <li>Category: ${updatedAuction.product.category.nameEn}</li>
        <li>
        ${updatedAuction.bids.length > 0 ? 'Current Bid' : 'Starting Bid'}: 
        ${updatedAuction.bids.length > 0 ? CurrentBidAmount : updatedAuction.startBidAmount}
      </li>
        <li>${updatedAuction.type === 'SCHEDULED' ? 'Starts On': 'Ends On'}: ${formattedDate}</li>
      </ul>

       <p>
          ${updatedAuction.bids.length > 0 
            ? 'Why wait and miss out? This could be your chance to grab a deal or outbid the competition in the final stretch.'
            :'This is your chance to snag an incredible deal or score a rare find. Don’t wait too long—bids are already rolling in!'}
        </p>

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
    href="<%asm_preferences_raw_url%>"
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

  async sendListedProdcutBulkEmails(updatedListedProduct: any, currentUserEmail?: string) {
    try {
      const emails = await this.getAllRegisteredUsers(
        updatedListedProduct.user.email,
      );
      console.log('email length:',emails.length)
      const subject = `🚨 New product Alert: Don't Miss Out!`;
      const text = `A new product has been listed: ${updatedListedProduct.product.title}`;
      const html = this.generateEmailTemplateForListedProduct(updatedListedProduct);

      const childPath = path.join(__dirname, 'email.child.js'); // adjust path if needed
      const child = fork(childPath);

      child.send({ users: emails, subject, text, html });

      child.on('message', (message:any) => {
        if (message?.success) {
          console.log('✅ Email sending succeeded in child process');
        } else {
          console.error('❌ Email sending failed in child process:', message.error);
        }
      });

      child.on('exit', (code) => {
        console.log(`📤 Email child process exited with code ${code}`);
      });


    } catch (error) {
      console.error('Email batch service error:', error);
      throw error;
    }
  }
  
  private generateEmailTemplateForListedProduct(updatedListedProduct: any): string {


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
        ${`A New Product Has Just Listed`}
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
          Exciting news! A brand-new Product has just been listed on <b>Alletre</b>, and we think you’ll love it.
        </p>
      <p>Auction Details:</p>
<ul style="margin: 0; padding-left: 20px; color:  #333; font-size: min(13px, 3vw);">
  <li>Title: ${updatedListedProduct.product.title}</li>
  <li>Category: ${updatedListedProduct.product.category.nameEn}</li>
  <li>Starting Bid: ${updatedListedProduct.ProductListingPrice}</li>
</ul>

        /*<p>This is your chance to snag an incredible deal or score a rare find. Don’t wait too long—bids are already rolling in!</p>*/

        <div style="text-align: center;">
          <a
            href=" https://www.alletre.com/alletre/home/${updatedListedProduct.id}/details"
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
               src="${updatedListedProduct.product.images[0].imageLink}"
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
    href="<%asm_preferences_raw_url%>"
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
}
