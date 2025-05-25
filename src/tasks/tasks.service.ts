import { Body, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { Worker } from 'worker_threads';
import { join } from 'path';
import {
  AuctionStatus,
  JoinedAuctionStatus,
  PaymentStatus,
  PaymentType,
  PrismaClient,
  WalletStatus,
  WalletTransactionType,
} from '@prisma/client';
import { AuctionWebSocketGateway } from 'src/auction/gateway/auction.gateway';
import { UserAuctionsService } from 'src/auction/services/user-auctions.service';
import { EmailsType } from 'src/auth/enums/emails-type.enum';
import { StripeService } from 'src/common/services/stripe.service';
import { EmailBatchService } from 'src/emails/email-batch.service';
import { EmailSerivce } from 'src/emails/email.service';
import { NotificationsService } from 'src/notificatons/notifications.service';
// import { auctionCreationMessage } from 'src/notificatons/NotificationsContents/auctionCreationMessage';
import { PaymentsService } from 'src/payments/services/payments.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { WalletService } from 'src/wallet/wallet.service';
import { WhatsAppService } from 'src/whatsapp/whatsapp.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private prismaService: PrismaService,
    private userAuctionService: UserAuctionsService,
    private paymentService: PaymentsService,
    private stripeService: StripeService,
    private walletService: WalletService,
    private emailService: EmailSerivce,
    private emailBatchService: EmailBatchService,
    private notificationService: NotificationsService,
    private auctionWebsocketGateWay: AuctionWebSocketGateway,
    private readonly whatsappService: WhatsAppService,
  ) {}

  /**
   * Function will run every hour to get inschdeule and publish them if paid
   */
  @Interval(60000)
  async publishAllInScheduleAuction() {
    // Get InSchedule auctions
    const inScheduleAuctions = await this.prismaService.auction.findMany({
      where: {
        status: AuctionStatus.IN_SCHEDULED,
        startDate: { lte: new Date() },
        Payment: {
          every: {
            type: PaymentType.SELLER_DEPOSIT,
            status: { in: [PaymentStatus.SUCCESS, PaymentStatus.HOLD] },
          },
        },
      },
    });

    console.log(
      `publish AllInSchedule Auction cron job on fire [${new Date()}] :`,
      inScheduleAuctions,
    );

    for (const auction of inScheduleAuctions) {
      // Set payment expired
      const updatedAuction = await this.prismaService.auction.update({
        where: { id: auction.id },
        data: { status: AuctionStatus.ACTIVE },
        include: {
          bids: true,
          user: true,
          product: { include: { images: true, category: true } },
        },
      });
      if (updatedAuction) {
        this.auctionWebsocketGateWay.listingNewAuction(updatedAuction);
        const auctionEndDate = new Date(updatedAuction.expiryDate);
        const formattedEndDate = auctionEndDate.toISOString().split('T')[0];
        const formattedEndTime = auctionEndDate.toTimeString().slice(0, 5);
        const emailBodyToSeller = {
          subject: '🎉 Your Auction is Live! Let the Bidding Begin!',
          title: 'Your Listing is Now Live!',
          Product_Name: updatedAuction.product.title,
          img: updatedAuction.product.images[0].imageLink,
          userName: `${updatedAuction.user.userName}`,
          message1: `
                <p>Congratulations! Your auction listing ${updatedAuction.product.title}, has been successfully posted on <b>Alletre</b>. Buyers can now discover and bid on your item.</p>
                <p>Here’s a summary of your listing:</p>
                <ul>
                  <li>Title: ${updatedAuction.product.title}</li>                     
                  <li>Category: ${updatedAuction.product.category.nameEn}</li>
                  <li>Starting Bid: ${updatedAuction.startBidAmount}</li>
                  <li>Auction Ends: ${formattedEndDate} & ${formattedEndTime}</li>
                </ul>
                <p>To maximize your listing’s visibility, share it with your friends or on social media!</p> 
              `,
          message2: `
              
                <p>You can track bids and view your auction here:</p>
                <div style="text-align: center">
      <a
        href='https://www.alletre.com/alletre/home/${updatedAuction.id}/details'
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
        View My Auction 
      </a>
    </div>

                <p style="margin-bottom: 0;">Best regards,</p>
<p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                <p>P.S. Keep an eye on your email for updates on bids and messages from interested buyers.</p>
              `,
          Button_text: 'Share My Auction ',
          Button_URL: `https://www.alletre.com/alletre/home/${updatedAuction.id}/details`,
        };
        const whatsappBodyToSeller = {
          1: `${updatedAuction.user.userName}`,
          2: `🎉 Your auction listing *${updatedAuction.product.title}* is now live on *Alletre*! Buyers can start bidding right away.`,
          3: ` Category: ${updatedAuction.product.category.nameEn}`,
          4: ` Starting Bid: ${updatedAuction.startBidAmount}`,
          5: ` Ends: ${formattedEndDate} at ${formattedEndTime}`,
          6: `🚀 To boost visibility, share your listing with friends or on social media. 👁️ Track your auction and stay updated on the latest bids`,
          7: `Thanks for choosing *Alletre*! Good luck with your auction. 📬 Stay tuned for updates and messages from interested bidders.`,
          8: `${updatedAuction.product.images[0].imageLink}`,
          9: `https://www.alletre.com/alletre/home/${updatedAuction.id}/details`,
        };

        if (updatedAuction.user.phone) {
          await this.whatsappService.sendOtherUtilityMessages(
            whatsappBodyToSeller,
            updatedAuction.user.phone,
            'alletre_common_utility_templet',
          );
        }

        await this.emailService.sendEmail(
          updatedAuction.user.email,
          'token',
          EmailsType.OTHER,
          emailBodyToSeller,
        );
        await this.emailBatchService.sendBulkEmails(
          updatedAuction,
          updatedAuction.userId.toString(),
        );
        const usersId = await this.notificationService.getAllRegisteredUsers(
          updatedAuction.userId,
        );
        await this.prismaService.notification.create({
          data: {
            userId: updatedAuction.userId,
            message:
              'Congratulations! Your auction has been successfully published.',
            imageLink: updatedAuction.product.images[0].imageLink,
            productTitle: updatedAuction.product.title,
            auctionId: updatedAuction.id,
          },
        });
        const imageLink = updatedAuction.product.images[0].imageLink;
        const productTitle = updatedAuction.product.title;
        const message = 'New Auction has been published.';
        await this.notificationService.sendNotifications(
          usersId,
          message,
          imageLink,
          productTitle,
          updatedAuction.id,
        );
      }
    }

    //TODO: Notify all users
  }

  /**
   * Function will run midnight to set all joined auction must be paid by bidder Expired_Payment
   * If winner refuse to pay, we gives compensation to the seller here 
   */
  @Cron(process.env.NODE_ENV === 'production' ? CronExpression.EVERY_DAY_AT_MIDNIGHT :  CronExpression.EVERY_5_MINUTES)
  async markPendingBidderPaymentAuctionsExpired() {
    // Get pending payment auctions
    const pendingPaymentAuction =
      await this.prismaService.joinedAuction.findMany({
        where: {
          paymentExpiryDate: { lte: new Date() },
          status: JoinedAuctionStatus.PENDING_PAYMENT,
        },
        include: {
          auction: {include: {
            user:true,
            product: { include: { images: true, category: true } },
            bids: {
              orderBy: { amount: 'desc' },
              include: {
                user: true,
              },
            },
          }},
        },
      });

    console.log('pendingPaymentAuction :', pendingPaymentAuction);
    for (const joinedAuction of pendingPaymentAuction) {
      //find the security deposit Of Winned bidder

      const isWinnerCompletedFullPayment =  await this.prismaService.payment.findFirst({
        where:{
          auctionId: joinedAuction.auctionId,
          userId: joinedAuction.userId,
          type:'AUCTION_PURCHASE',
          status:'BANK_STATEMENT_UPLOADED'
        }
      })
      console.log('chekking winner payment1', isWinnerCompletedFullPayment)

      if(isWinnerCompletedFullPayment){
      console.log('chekking winner payment2')

        console.log('winner has submitted a bank tranfer form')
        continue
      }
      console.log('chekking winner payment3')
      const winnerSecurityDeposit = await this.prismaService.payment.findFirst({
        where: {
          auctionId: joinedAuction.auctionId,
          userId: joinedAuction.userId,
          type: 'BIDDER_DEPOSIT',
        },
        include: {
          user: true,
          auction: {
            include: {
              product: { include: { images: true, category: true } },
              bids: {
                orderBy: { amount: 'desc' },
                include: {
                  user: true,
                },
              },
              user: true,
            },
          },
        },
      });
      
      const sellerPaymentData = await this.prismaService.payment.findFirst({
        where: {
          auctionId: joinedAuction.auctionId,
          userId: joinedAuction.auction.userId,
          type: 'SELLER_DEPOSIT',
        },
        include: {
          user: true,
          auction: {
            include: {
              product: { include: { images: true, category: true } },
              bids: {
                orderBy: { amount: 'desc' },
                include: {
                  user: true,
                },
              },
              user: true,
            },
          },
        },
      });

        // //capturig the winner payment data
        // let isWinnerSecurityDepositCaptured :any = false
        // if(winnerSecurityDeposit.isWalletPayment){
        //   //payment is already in the admin wallet
        // }else if(winnerSecurityDeposit.paymentIntentId){
        //    isWinnerSecurityDepositCaptured = 
        //     await this.stripeService.captureDepositPaymentIntent(
        //       winnerSecurityDeposit.paymentIntentId
        //     )

        //      //find the last transaction balane of the alletre
        //       const lastBalanceOfAlletre =
        //       await this.walletService.findLastTransactionOfAlletre();
        //     //tranfering data for the alletre fees
        //     const alletreWalletData = {
        //       status: WalletStatus.DEPOSIT,
        //       transactionType: WalletTransactionType.By_AUCTION,
        //       description: `Capturing security deposit of winner due delay of complete payment`,
        //       amount: Number(isWinnerSecurityDepositCaptured.amount) / 100, // Convert from cents to dollars
        //       auctionId: Number(joinedAuction.auctionId),
        //       balance: lastBalanceOfAlletre
        //         ? Number(lastBalanceOfAlletre) +
        //           Number(isWinnerSecurityDepositCaptured.amount) / 100
        //         : Number(isWinnerSecurityDepositCaptured.amount) / 100, // Convert from cents to dollars
        //     };
        //     await this.walletService.addToAlletreWallet(
        //       joinedAuction.userId,
        //       alletreWalletData,
        //     );
        // }

      console.log('winnerSecurityDeposit',winnerSecurityDeposit)
      // if (winnerSecurityDeposit) 
        {
        try {

          let releaseSecurityDepositOfseller: any = false;
          // relese security deposit of seller
          if(sellerPaymentData){
            const [lastWalletTransactionBalance, lastWalletTransactionAlletre] =
              await Promise.all([
                this.walletService.findLastTransaction(
                  sellerPaymentData.userId,
                ),
                this.walletService.findLastTransactionOfAlletre(),
              ]);
            const sellerReturnSecurityDepositWalletData = {
              status: WalletStatus.DEPOSIT,
              transactionType: WalletTransactionType.By_AUCTION,
              description:
                `Return Security deposit due to winner Not paid the full amount. `,
              amount: Number(sellerPaymentData.amount),
              auctionId: Number(sellerPaymentData.auctionId),
              balance: lastWalletTransactionBalance
                ? Number(lastWalletTransactionBalance) +
                  Number(sellerPaymentData.amount)
                : Number(sellerPaymentData.amount),
            };
            const walletDataToAlletreWhenRetrunSecurityDepositToSeller = {
              status: WalletStatus.WITHDRAWAL,
              transactionType: WalletTransactionType.By_AUCTION,
              description:
                `Return Security deposit of seller due to winner Not paid the full amount. `,
              amount: Number(sellerPaymentData.amount),
              auctionId: Number(sellerPaymentData.auctionId),
              balance:
                Number(lastWalletTransactionAlletre) -
                Number(sellerPaymentData.amount),
            };

            const isAlreadySendS_DBack = await this.prismaService.wallet.findFirst({
              where:{
                status : sellerReturnSecurityDepositWalletData.status,
                transactionType: sellerReturnSecurityDepositWalletData.transactionType,
                description : sellerReturnSecurityDepositWalletData.description,
                amount : sellerReturnSecurityDepositWalletData.amount,
                auctionId : sellerReturnSecurityDepositWalletData.auctionId
              } 
            })
            console.log('isAlreadySendS_DBack',isAlreadySendS_DBack)
            if (isAlreadySendS_DBack){
              console.log('already send security deposit ')
              continue;
 
            }
            const [sellerWalletCreationData, alletreWalletCreationData] =
              await Promise.all([
                this.walletService.create(
                  sellerPaymentData.userId,
                  sellerReturnSecurityDepositWalletData,
                ),
                this.walletService.addToAlletreWallet(
                  sellerPaymentData.userId,
                  walletDataToAlletreWhenRetrunSecurityDepositToSeller,
                ),
              ]);
            releaseSecurityDepositOfseller =
              sellerWalletCreationData && alletreWalletCreationData;
            }else{
              releaseSecurityDepositOfseller  = true
            }

          if (releaseSecurityDepositOfseller) {
            if(winnerSecurityDeposit){
            //logic for transfering compensation 
            //finding the last transaction balance of the seller
            const lastWalletTransactionBalance =
              await this.walletService.findLastTransaction(
                joinedAuction.auction.userId,
              );
            //finding the last transaction balance of the alletreWallet
            const lastBalanceOfAlletre =
              await this.walletService.findLastTransactionOfAlletre();

            //calculating the amount that need add to the highest bidder
            const compensationPercenatage = 30;
            const compensationAmountToSellerWallet = (Number(winnerSecurityDeposit.amount) * compensationPercenatage) / 100;

            //transfering data for the compensation to the  seller.
            const walletData = {
              status: WalletStatus.DEPOSIT,
              transactionType: WalletTransactionType.By_AUCTION,
              description:
                `Compensation Due to full payment delay by the winned bidder. ---kamaru`,
              amount: compensationAmountToSellerWallet,
              auctionId: Number(joinedAuction.auctionId),
              balance: lastWalletTransactionBalance
                ? Number(lastWalletTransactionBalance) + compensationAmountToSellerWallet
                : compensationAmountToSellerWallet,
            };
            //tranfering data for the alletre 

            const alletreWalletData = {
              status: WalletStatus.WITHDRAWAL,
              transactionType: WalletTransactionType.By_AUCTION,
              description:
                `Compensation Due to full payment delay by the winned bidder. ---kamaru`,
              amount: compensationAmountToSellerWallet,
              auctionId: Number(joinedAuction.auctionId),
              balance: Number(lastBalanceOfAlletre) - compensationAmountToSellerWallet,
            };
            
            const isAlreadySendCompensationBack = await this.prismaService.wallet.findFirst({
              where:{
                status : walletData.status,
                transactionType: walletData.transactionType,
                description : walletData.description,
                amount : walletData.amount,
                auctionId : walletData.auctionId
              } 
            })
            console.log('isAlreadySendCompensationBack',isAlreadySendCompensationBack)

            if (isAlreadySendCompensationBack){
              console.log('already send Compensation deposit ')
              continue;
 
            }

            await this.prismaService.$transaction(async (prisma) => {

              // await this.walletService.create(
              //   joinedAuction.auction.userId,
              //   walletData,
              //   prisma,
              // );

              await prisma.wallet.create({
                data: {
                  userId : joinedAuction.auction.userId,
                  description: walletData.description,
                  amount: Number(Number(walletData.amount).toFixed(2)),
                  status: walletData.status,
                  transactionType: walletData.transactionType,
                  auctionId: walletData.auctionId,
                  balance: Number(Number(walletData.balance).toFixed(2)),
                },
              });

              // await this.walletService.addToAlletreWallet(
              //   joinedAuction.auction.userId,
              //   alletreWalletData,
              //   prisma,
              // );


             await prisma.alletreWallet.create({
                data: {
                  userId:joinedAuction.auction.userId,
                  description: alletreWalletData.description,
                  amount: Number(Number(alletreWalletData.amount).toFixed(2)),
                  status: alletreWalletData.status,
                  transactionType: alletreWalletData.transactionType,
                  auctionId: alletreWalletData.auctionId,
                  balance: Number(Number(alletreWalletData.balance).toFixed(2)),
                },
              });

              // Update auction and joined auction statuses
              await prisma.auction.update({
                where: { id: joinedAuction.auctionId },
                data: { status: AuctionStatus.EXPIRED },
              });
              await prisma.joinedAuction.update({
                where: { id: joinedAuction.id },
                data: { status: JoinedAuctionStatus.PAYMENT_EXPIRED },
              });

              // return { releaseSecurityDepositOfseller };
            });
          }else{
            await this.prismaService.$transaction(async (prisma) => {
              // Update auction and joined auction statuses
              await prisma.auction.update({
                where: { id: joinedAuction.auctionId },
                data: { status: AuctionStatus.EXPIRED },
              });
              await prisma.joinedAuction.update({
                where: { id: joinedAuction.id },
                data: { status: JoinedAuctionStatus.PAYMENT_EXPIRED },
              });

              // return { releaseSecurityDepositOfseller };
            });
          }
            //sendEmailtoSeller
            const emailBodyForSeller = {
              subject: '⚠️ Auction Closed: Bidder Failed to Pay',
              title: 'Important Update About Your Auction',
              Product_Name: joinedAuction.auction.product.title,
              img: joinedAuction.auction.product.images[0].imageLink,
              userName: joinedAuction.auction.user.userName,
              message1: `
                <p>We’re reaching out to inform you that the winning bidder for your auction 
                <b>${joinedAuction.auction.product.title}</b> did not complete the payment within the required timeframe. 
                While we understand this may be disappointing, we’ve taken steps to ensure you’re protected.</p>
            
                <p><b>Here’s what happens next:</b></p>
                <ul>
                  <li>Your Security Deposit: 
                    $${joinedAuction.auction.product.category.sellerDepositFixedAmount}
                  </li>
                  ${
                    winnerSecurityDeposit
                      ? `<li>Compensation: 
                          $${Number(
                            joinedAuction.auction.product.category.bidderDepositFixedAmount,
                          ) * 0.5} (50% of the bidder’s security deposit)
                        </li>`
                      : ''
                  }
                </ul>
            
                <p>
                  ${
                    winnerSecurityDeposit
                      ? "The compensation and security deposit have been credited to your account and are available for use in future auctions."
                      : "Your security deposit has been credited to your account and is available for use in future auctions."
                  }
                </p>
            
                <h3>What’s Next?</h3>
                <p>We encourage you to relist your item to attract new bidders and secure a successful sale.</p>
              `,
              message2: `
                <p>Thank you for using <b>Alletre</b>. We’re here to support you every step of the way and are confident your next auction will be a success!</p>
                <p style="margin-bottom: 0;">Best regards,</p>
                <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                <p>Check out our Seller Tips to optimize your listing and attract more bidders!</p>
              `,
              Button_text: 'Create auction',
              Button_URL: 'https://www.alletre.com/',
            };
            

            const whatsappBodyForSeller = {
              1: `⚠️ Hi ${joinedAuction.auction.user.userName},`,
              2: `We regret to inform you that the winning bidder for your auction *${joinedAuction.auction.product.title}* did not complete the payment within the required timeframe.`,
              3: `But don ot worry, here is what happens next:`,
              4: `• Your security deposit: ${joinedAuction.auction.product.category.sellerDepositFixedAmount}`,
              5 :`${winnerSecurityDeposit ? `• Compensation: ${
                Number(
                  joinedAuction.auction.product.category
                    .bidderDepositFixedAmount,
                ) * 0.5
              } (50% of the bidders deposit)`:``}`,
              6: `The ${winnerSecurityDeposit ? 'compensation and':''} the security deposit has been credited to your account and is available for use in future auctions.`,
              7: `👉 What is next? We recommend relisting your item to attract new bidders and secure a successful sale. Thank you for using *Alletre*! We are here to support you every step of the way.`,
              8: `${joinedAuction.auction.product.images[0].imageLink}`,
              9: `https://www.alletre.com/`,
            };

            if (joinedAuction.auction.user.phone) {
              await this.whatsappService.sendOtherUtilityMessages(
                whatsappBodyForSeller,
                joinedAuction.auction.user.phone,
                'alletre_common_utility_templet',
              );
            }

            //sendEmailtoBidder
            const auctionEndDate = new Date(
              sellerPaymentData.auction.expiryDate,
            );
            const formattedEndDate = auctionEndDate.toISOString().split('T')[0]; // Extract YYYY-MM-DD
            const formattedEndTime = auctionEndDate.toTimeString().slice(0, 5);
            const emailBodyForBidder = {
              subject: '⚠️ Auction Cancelled: Payment Not Completed',
              title: `Auction Cancelled - Payment Not Received`,
              Product_Name: joinedAuction.auction.product.title,
              img: joinedAuction.auction.product.images[0].imageLink,
              userName: `${joinedAuction.auction.bids[0].user.userName}`,
              message1: ` 
            <p>We regret to inform you that your winning bid for ${joinedAuction.auction.product.title} has been cancelled. Unfortunately, we did not receive your payment within the required time frame.</p>
            <p>Auction Details:</p>
            <ul>
              <li>Title: ${joinedAuction.auction.product.title} </li>
              <li>Winning Bid: ${joinedAuction.auction.bids[0].amount}</li>
              <li>Payment Due By: ${formattedEndDate} & ${formattedEndTime}</li>
            </ul>
            <h3>Consequences:</h3>
            <p>Since payment was not completed on time:</p>
            <ul>
              <li>The auction has been cancelled.</li>
              ${!winnerSecurityDeposit ? ``:`<li>Your security deposit of ${joinedAuction.auction.product.category.bidderDepositFixedAmount} has been confiscated.</li>`}
            </ul>
            <p>We understand this may be disappointing, but we want to ensure smooth and timely transactions for all our users.</p>
            <h3>Consequences:</h3>
              <p>We encourage you to explore other exciting auctions that match your interests. If you’d like to participate again, we’re always here to help you get started.</p>
            `,
              message2: ` 
              <p>Thank you for being part of the  <b>Alletre</b> community. We look forward to seeing you in future auctions!</p>
                        <p style="margin-bottom: 0;">Best regards,</p>
                        <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                        <p>P.S. Have questions or need assistance? Feel free to contact our support team.</p>`,
              Button_text: 'Explore Auctions',
              Button_URL: ' https://www.alletre.com/',
            };

            const whatsappBodyForBidder = {
              1: `⚠️ Hi ${joinedAuction.auction.bids[0].user.userName},`,
              2: `Your winning bid for *${joinedAuction.auction.product.title}* has been cancelled because we did not receive your payment on time.`,
              3: `Here are the auction details:`,
              4: `• Title: ${joinedAuction.auction.product.title} • Winning Bid: ${joinedAuction.auction.bids[0].amount} • Payment Due By: ${formattedEndDate} & ${formattedEndTime}`,
              5: `Since the payment was not completed: • The auction has been cancelled ${winnerSecurityDeposit ? `• Your security deposit of ${joinedAuction.auction.product.category.bidderDepositFixedAmount} has been confiscated.`:``}`,
              6: `We know this is disappointing, but timely payments help us ensure a smooth experience for all users.`,
              7: `We encourage you to explore other auctions that match your interests. Thank you for being part of *Alletre*!`,
              8: `${joinedAuction.auction.product.images[0].imageLink}`,
              9: `https://www.alletre.com/`,
            };

            if (joinedAuction.auction.bids[0].user.phone) {
              await this.whatsappService.sendOtherUtilityMessages(
                whatsappBodyForBidder,
                joinedAuction.auction.bids[0].user.phone,
                'alletre_common_utility_templet',
              );
            }

            const notificationMessageToSeller = ` 
                                We are really sorry to say that, unfortunatly, the winner of your Auction of ${joinedAuction.auction.product.title}
                                (Model:${joinedAuction.auction.product.model}) has not paid the full amount by time. 
                                So ${winnerSecurityDeposit ? `we are giving you an amount as a compensation to your wallet and`:``} your security deposit has
                                been sent back to your bank account.`;
            const notificationBodyToSeller = {
              status: 'ON_PENDING_PAYMENT_TIME_EXPIRED',
              userType: 'FOR_SELLER',
              usersId: joinedAuction.auction.userId,
              message: notificationMessageToSeller,
              imageLink: joinedAuction.auction.product.images[0].imageLink,
              productTitle: joinedAuction.auction.product.title,
              auctionId: joinedAuction.auctionId,
            };
            const notificationMessageToBidder = `
             We are really sorry to say that, the time to pay the pending amount of Auction of ${joinedAuction.auction.product.title}
                        (Model:${joinedAuction.auction.product.model}) has been expired. Due to the delay of the payment you have lost
                        your security deposite`;
            const notificationBodyToBidder = {
              status: 'ON_PENDING_PAYMENT_TIME_EXPIRED',
              userType: 'FOR_WINNER',
              usersId: joinedAuction.auction.bids[0].user.id,
              message: notificationMessageToBidder,
              imageLink: joinedAuction.auction.product.images[0].imageLink,
              productTitle: joinedAuction.auction.product.title,
              auctionId: joinedAuction.auctionId,
            };
            const createSellerNotificationData =
              await this.prismaService.notification.create({
                data: {
                  userId: joinedAuction.auction.userId,
                  message: notificationBodyToSeller.message,
                  imageLink: notificationBodyToSeller.imageLink,
                  productTitle: notificationBodyToSeller.productTitle,
                  auctionId: joinedAuction.auctionId,
                },
              });
            const createWinnerNotificationData =
              await this.prismaService.notification.create({
                data: {
                  userId: notificationBodyToBidder.usersId,
                  message: notificationBodyToBidder.message,
                  imageLink: notificationBodyToBidder.imageLink,
                  productTitle: notificationBodyToBidder.productTitle,
                  auctionId: notificationBodyToBidder.auctionId,
                },
              });
            if (createSellerNotificationData) {
              try {
                this.notificationService.sendNotificationToSpecificUsers(
                  notificationBodyToSeller,
                );
              } catch (error) {
                console.log('sendNotificationToSpecificUsers error', error);
              }
            }
            if (createWinnerNotificationData) {
              try {
                this.notificationService.sendNotificationToSpecificUsers(
                  notificationBodyToBidder,
                );
              } catch (error) {
                console.log('sendNotificationToSpecificUsers error', error);
              }
            }
            await Promise.all([
              this.emailService.sendEmail(
                joinedAuction.auction.user.email,
                'token',
                EmailsType.OTHER,
                emailBodyForSeller,
              ),
              this.emailService.sendEmail(
                joinedAuction.auction.bids[0].user.email,
                'token',
                EmailsType.OTHER,
                emailBodyForBidder,
              ),
            ]);
          }
        } catch (error) {
          const body = {
            subject:
              'Error When Handling the winner full paymet expiry in the task service ',
            title:
              'Error When Handling the winner full paymet expiry in the task service',
            message1: `This is a test message from alletre backend when error occur at markPendingBidderPaymentAuctionsExpired function 
                           Transaction Failed ${error.message}`,
            Button_text: 'Click here to continue your payment',
            Button_URL: process.env.FRONT_URL,
          };
          await this.emailService.sendEmail(
            'info@alletre.com',
            'token',
            EmailsType.OTHER,
            body,
          );
          console.error(`Transaction failed: ${error.message}`);
        }
      }
    }
  }

  // ======> This is comented becuase the delivery is taken by winner or company when we change the method we will activate it <================

  //Function to send email when the seller is refuse or has any issue to deliver the item.
  // @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  // async _markPendingDelivery() {
  //   try {
  //     const pendingDeliveryAuction = await this.prismaService.auction.findMany({
  //       where: {
  //         status: 'SOLD',
  //         isItemSendForDelivery: false,
  //       },
  //       include: {
  //         user: true,
  //         product: { include: { images: true } },
  //         bids: {
  //           orderBy: { amount: 'desc' },
  //           include: {
  //             user: true,
  //           },
  //         },
  //       },
  //     });
  //     await Promise.all(
  //       pendingDeliveryAuction.map(async (auction) => {
  //         // Calculate expected delivery date
  //         const expectedDeliveryDate = new Date(auction.expiryDate);
  //         expectedDeliveryDate.setDate(
  //           expectedDeliveryDate.getDate() +
  //             auction.numOfDaysOfExpecetdDelivery,
  //         );
  //         const currentDate = new Date();

  //         // Check if the current date is greater than the expected delivery date
  //         if (currentDate > expectedDeliveryDate) {
  //           console.log('Sending email to seller, delivery is delayed.');
  //           // Email body for the seller
  //           const emailBodyForSeller = {
  //             subject: '🚚 Action Needed: Delivery Delay Notification',
  //             title: 'Delivery Delayed for Auction Purchase',
  //             Product_Name: auction.product.title,
  //             img: auction.product.images[0].imageLink,
  //             userName: `${auction.user.userName}`,
  //             message1: `
  //           <p>We wanted to bring to your attention that the delivery of  ${auction.product.title} has been delayed.</p>
  //           <p>Auction Details:</p>
  //           <ul>
  //             <li>Title: ${auction.product.title} </li>
  //             <li>Winning Bid: ${auction.bids[0].amount}</li>
  //             <li>Winner Name: ${auction.bids[0].user.userName}</li>
  //           </ul>
  //           <h3>What You Should Do Next</h3>
  //           <p>Please take immediate action to fulfill the delivery of this product and ensure the buyer receives their purchase promptly.</p>
  //                 `,
  //             message2: `
  //             <p>Thank you for your cooperation. If you have any questions or need assistance, feel free to reach out to us.</p>
  //                       <p style="margin-bottom: 0;">Best regards,</p>
  //                       <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
  //                       <p>P.S. Timely delivery ensures a better experience for everyone. Let us know if there’s anything we can do to help!</p>`,
  //             Button_text: 'View Auction Details',
  //             Button_URL: ' https://www.alletre.com/',
  //           };
  //           await this.emailService.sendEmail(
  //             auction.user.email,
  //             'token',
  //             EmailsType.OTHER,
  //             emailBodyForSeller,
  //           );
  //           const notificationMessageToSeller = `
  //           It appears that the delivery of your product from the auction "${auction.product.title}"
  //                 (Model: ${auction.product.model}) has been delayed beyond the expected ${auction.numOfDaysOfExpecetdDelivery} days.
  //                 Please take action to fulfill the delivery.`;
  //           const deliveryDelayNotificationData =
  //             await this.prismaService.notification.create({
  //               data: {
  //                 userId: auction.userId,
  //                 message: notificationMessageToSeller,
  //                 imageLink: auction.product.images[0].imageLink,
  //                 productTitle: auction.product.title,
  //                 auctionId: auction.id,
  //               },
  //             });
  //           if (deliveryDelayNotificationData) {
  //             // Send notification to seller
  //             const sellerUserId = deliveryDelayNotificationData.userId;
  //             const notification = {
  //               status: 'ON_DELIVERY_DELAY',
  //               userType: 'FOR_SELLER',
  //               usersId: sellerUserId,
  //               message: deliveryDelayNotificationData.message,
  //               imageLink: deliveryDelayNotificationData.imageLink,
  //               productTitle: deliveryDelayNotificationData.productTitle,
  //               auctionId: deliveryDelayNotificationData.auctionId,
  //             };
  //             try {
  //               this.notificationService.sendNotificationToSpecificUsers(
  //                 notification,
  //               );
  //             } catch (error) {
  //               console.log('sendNotificationToSpecificUsers error', error);
  //             }
  //           }
  //         }
  //       }),
  //     );
  //   } catch (error) {
  //     console.log(error);
  //   }
  // }


  //Function will run every minute to check the upcoming Pending payment by bidders and will send a warning email

  @Interval(60000)
  async _markUpcomingPendingPayment() {
    // Get auctions expiring within 24 hours
    const twentyFourHourPendingPaymentAuctions =
      await this.prismaService.joinedAuction.findMany({
        where: {
          paymentExpiryDate: {
            gte: new Date(), // Expiration date is greater than or equal to the current time
            lte: new Date(new Date().getTime() + 24 * 60 * 60 * 1000), // Expiring within the next 24 hours
          },
          status: JoinedAuctionStatus.PENDING_PAYMENT,
          isWarningMessageSent24Hours: false, // Add a specific flag for 24-hour warnings
        },
        include: {
          auction: {
            include: {
              user: true,
              product: { include: { images: true, category: true } },
              bids: {
                orderBy: { amount: 'desc' },
                include: { user: true },
              },
            },
          },
          user: true,
        },
      });

    // Send 24-hour reminder emails
    if (twentyFourHourPendingPaymentAuctions.length) {
      await Promise.all(
        twentyFourHourPendingPaymentAuctions.map(async (data) => {
          const auctionEndDate = new Date(data.auction.expiryDate);
          auctionEndDate.setDate(auctionEndDate.getDate() + 3);
          const formattedEndDate = auctionEndDate.toISOString().split('T')[0]; // Extract YYYY-MM-DD
          const formattedEndTime = auctionEndDate.toTimeString().slice(0, 5);
          const body = {
            subject:
              '⏳ Final Reminder: Complete Your Payment to Secure Your Win',
            title: 'Your Auction Win is at Risk!',
            Product_Name: data.auction.product.title,
            img: data.auction.product.images[0].imageLink,
            userName: `${data.user.userName}`,
            message1: ` 
              <p>Congratulations on winning the auction for ${data.auction.product.title}! However, we noticed that you haven’t completed the payment yet.</p>
              <p>Auction Details:</p>
              <ul>
                <li>Title: ${data.auction.product.title} </li>
                <li>Winning Bid: ${data.auction.bids[0].amount}</li>
                <li>Payment Due By: ${formattedEndDate} & ${formattedEndTime}</li>
              </ul>
              <h3>What Happens If You Don’t Pay?</h3>
              <p>If payment is not completed within the next 24 hours:</p>
              <ul>
                <li>The auction will be cancelled. </li>
                <li>Your security deposit of ${data.auction.product.category.bidderDepositFixedAmount} will be confiscated.</li>
              </ul>
              <p>We encourage you to act quickly to avoid losing your deposit and your winning bid!</p>`,
            message2: ` 
              <p>Thank you for being part of the <b>Alletre</b> community. Completing your payment ensures a smooth transaction for both you and the seller.</p>
              <p style="margin-bottom: 0;">Best regards,</p>
              <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
              <p>P.S. Need help or have questions? Contact our support team for assistance.</p>`,
            Button_text: 'Complete My Payment Now',
            Button_URL:
              'https://www.alletre.com/alletre/profile/my-bids/pending',
          };

          const whatsappBodyForPendingPayment = {
            1: `⏳ Hi ${data.user.userName},`,
            2: `Congrats on winning the auction for *${data.auction.product.title}*! However, we noticed your payment is still pending.`,
            3: `Here are your auction details:`,
            4: `• Title: ${data.auction.product.title} • Winning Bid: ${data.auction.bids[0].amount} • Payment Due By: ${formattedEndDate} & ${formattedEndTime}`,
            5: `If payment is not completed within the next 24 hours: • The auction will be cancelled • Your deposit of ${data.auction.product.category.bidderDepositFixedAmount} will be confiscated.`,
            6: `We recommend acting quickly to avoid losing both your winning bid and your deposit.`,
            7: `Thanks for being part of *Alletre*! Completing your payment helps ensure a smooth experience for everyone.`,
            8: `${data.auction.product.images[0].imageLink}`,
            9: `alletre/profile/my-bids/pending`,
          };

          if (data.user.phone) {
            await this.whatsappService.sendOtherUtilityMessages(
              whatsappBodyForPendingPayment,
              data.user.phone,
              'alletre_common_utility_templet',
            );
          }

          // Send email
          await this.emailService.sendEmail(
            data.user.email,
            'token',
            EmailsType.OTHER,
            body,
          );

          // Update flag to indicate 24-hour warning sent
          await this.prismaService.joinedAuction.update({
            where: { id: data.id },
            data: { isWarningMessageSent24Hours: true },
          });

          // Create notification
          const pendingPaymentNotificationData =
            await this.prismaService.notification.create({
              data: {
                userId: data.userId,
                message: `Your pending payment on your Auction of "${data.auction.product.title}"
                        (Model: ${data.auction.product.model}) is going to expire soon. 
                        Notice: If you refuse to pay, you will lose your security deposit. Thank you.`,
                imageLink: data.auction.product.images[0].imageLink,
                productTitle: data.auction.product.title,
                auctionId: data.auctionId,
              },
            });

          // Check if the notification was successfully created
          if (pendingPaymentNotificationData) {
            const notification = {
              status: 'ON_PENDING_PAYMENT_OF_BIDDER',
              userType: 'FOR_BIDDER',
              usersId: data.userId,
              message: pendingPaymentNotificationData.message,
              imageLink: pendingPaymentNotificationData.imageLink,
              productTitle: pendingPaymentNotificationData.productTitle,
              auctionId: pendingPaymentNotificationData.auctionId,
            };

            // Send the notification to the user (bidder)
            try {
              await this.notificationService.sendNotificationToSpecificUsers(
                notification,
              );
            } catch (error) {
              console.log('sendNotificationToSpecificUsers error', error);
            }
          }
        }),
      );
    }

    // Get auctions expiring within 1 hour
    const oneHourPendingPaymentAuctions =
      await this.prismaService.joinedAuction.findMany({
        where: {
          paymentExpiryDate: {
            gte: new Date(), // Expiration date is greater than or equal to the current time
            lte: new Date(new Date().getTime() + 1 * 60 * 60 * 1000), // Expiring within the next 1 hour
          },
          status: JoinedAuctionStatus.PENDING_PAYMENT,
          isWarningMessageSent1Hour: false, // Add a specific flag for 1-hour warnings
        },
        include: {
          auction: {
            include: {
              product: { include: { images: true, category: true } },
              bids: {
                orderBy: { amount: 'desc' },
                include: { user: true },
              },
            },
          },
          user: true,
        },
      });

    // Send 1-hour reminder emails
    if (oneHourPendingPaymentAuctions.length) {
      await Promise.all(
        oneHourPendingPaymentAuctions.map(async (data) => {
          const auctionEndDate = new Date(data.auction.expiryDate);
          const formattedEndDate = auctionEndDate.toISOString().split('T')[0]; // Extract YYYY-MM-DD
          const formattedEndTime = auctionEndDate.toTimeString().slice(0, 5);

          const body = {
            subject: '⏰ Urgent: 1 Hour Left to Complete Your Payment!',
            title: 'Last Chance to Secure Your Auction Win!',
            Product_Name: data.auction.product.title,
            img: data.auction.product.images[0].imageLink,
            userName: `${data.user.userName}`,
            message1: ` 
              <p>This is a final reminder—only 1 hour remains to complete the payment for your winning bid on ${data.auction.product.title}.</p>
              <p>Auction Details:</p>
              <ul>
                <li>Title: ${data.auction.product.title} </li>
                <li>Winning Bid: ${data.auction.bids[0].amount}</li>
                <li>Payment Due By: ${formattedEndDate} & ${formattedEndTime}</li>
              </ul>
              <h3>What Happens If You Don’t Pay?</h3>
              <p>If payment is not completed within the next hour:</p>
              <ul>
                <li>The auction will be cancelled. </li>
                <li>Your security deposit of ${data.auction.product.category.bidderDepositFixedAmount} will be confiscated.</li>
              </ul>
              <p>Don’t miss out on your chance to secure this item. Complete your payment now to avoid losing your winning bid and deposit!</p>`,
            message2: ` 
              <p>Thank you for using <b>Alletre</b>. We’re eager to help you complete this transaction smoothly.</p>
              <p style="margin-bottom: 0;">Best regards,</p>
              <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
              <p>P.S. Need assistance? Contact us immediately for support.</p>`,
            Button_text: 'Complete My Payment Now',
            Button_URL:
              ' https://www.alletre.com/alletre/profile/my-bids/pending',
          };

          const whatsappBodyForFinalHour = {
            1: `⏰ Hi ${data.user.userName},`,
            2: `This is a final reminder—only 1 hour remains to complete your payment for *${data.auction.product.title}*.`,
            3: `Auction details below:`,
            4: `• Title: ${data.auction.product.title} • Winning Bid: ${data.auction.bids[0].amount} • Payment Due By: ${formattedEndDate} & ${formattedEndTime}`,
            5: `If payment is not completed in the next hour: • The auction will be cancelled • Your deposit of ${data.auction.product.category.bidderDepositFixedAmount} will be confiscated.`,
            6: `Do not miss out! Complete your payment now to secure your win and avoid losing your deposit.`,
            7: `Thanks for using *Alletre*! We are here to help you complete this transaction smoothly.`,
            8: `${data.auction.product.images[0].imageLink}`,
            9: `alletre/profile/my-bids/pending`,
          };

          if (data.user.phone) {
            await this.whatsappService.sendOtherUtilityMessages(
              whatsappBodyForFinalHour,
              data.user.phone,
              'alletre_common_utility_templet',
            );
          }

          // Send email
          await this.emailService.sendEmail(
            data.user.email,
            'token',
            EmailsType.OTHER,
            body,
          );

          // Update flag to indicate 1-hour warning sent
          await this.prismaService.joinedAuction.update({
            where: { id: data.id },
            data: { isWarningMessageSent1Hour: true },
          });

          // Create notification
          const pendingPaymentNotificationData =
            await this.prismaService.notification.create({
              data: {
                userId: data.userId,
                message: `Your pending payment on your Auction of "${data.auction.product.title}"
                        (Model: ${data.auction.product.model}) is going to expire soon. 
                        Notice: If you refuse to pay, you will lose your security deposit. Thank you.`,
                imageLink: data.auction.product.images[0].imageLink,
                productTitle: data.auction.product.title,
                auctionId: data.auctionId,
              },
            });

          // Check if the notification was successfully created
          if (pendingPaymentNotificationData) {
            const notification = {
              status: 'ON_PENDING_PAYMENT_OF_BIDDER',
              userType: 'FOR_BIDDER',
              usersId: data.userId,
              message: pendingPaymentNotificationData.message,
              imageLink: pendingPaymentNotificationData.imageLink,
              productTitle: pendingPaymentNotificationData.productTitle,
              auctionId: pendingPaymentNotificationData.auctionId,
            };

            // Send the notification to the user (bidder)
            try {
              await this.notificationService.sendNotificationToSpecificUsers(
                notification,
              );
            } catch (error) {
              console.log('sendNotificationToSpecificUsers error', error);
            }
          }
        }),
      );
    }
  }

  /**
   * Function will run every mintue to set all auction expired
   */
  @Interval(60000)
  async markAuctionExpired() {
    await this._markExpiredAuctionsAndNotifyWinnerBidder();
  }

  async _markExpiredAuctionsAndNotifyWinnerBidder() {
   try {
    console.log(`Start Expiration Schedular[${new Date()}] `,new Date());
    // Get expiredAuctions
    const auctionsToBeExpired = await this.prismaService.auction.findMany({
      where: {
        expiryDate: {
          lte: new Date()// Filter auctions where expiryDate is less than or equal to the current date and time
        },
        status: AuctionStatus.ACTIVE,
        
      },
      include:{Payment:{where:{type:'SELLER_DEPOSIT'}}}
    });
    console.log(' [IMPORTANT] auctionsToBeExpired: ', auctionsToBeExpired);

    //if there is auctions to be expired
    // await Promise.all(
    //   auctionsToBeExpired?.map(async (auction) =>
      for(const auction of auctionsToBeExpired)   {
        //get all bidders on an auction
        const BiddersForAuction = await this.prismaService.bids.findMany({
          where: { auctionId: auction.id },
          orderBy: { amount: 'desc' },
        });
        const sellerPayment = auction.Payment

        // if (sellerPayment.length === 0){
        //   // this is the case while the user is not pay the security deposit, there are cases when uses can put auction with out security deposite in special categories (ex: car under 5000),  
        //   const adminMessage = "The auction has been cancelled because the seller did not comply with Alletre's guidelines"
        //   this.userAuctionService.updateAuctionForCancellationByAdmin(auction.id, adminMessage)
        //   return
        // }


        // //capturig the seller payment data
        // if(sellerPayment[0].isWalletPayment){
        //   //payment is already in the admin wallet
        // }else if(sellerPayment[0].paymentIntentId){
        //  const isSellerPaymentCaptured =
        //   await this.stripeService.captureDepositPaymentIntent(
        //     sellerPayment[0].paymentIntentId,
        //   );
        // //find the last transaction balane of the alletre
        // const lastBalanceOfAlletre =
        //   await this.walletService.findLastTransactionOfAlletre();
        // //tranfering data for the alletre fees
        // const alletreWalletData = {
        //   status: WalletStatus.DEPOSIT,
        //   transactionType: WalletTransactionType.By_AUCTION,
        //   description: `Capturing security deposit of seller due to auction expired`,
        //   amount: Number(isSellerPaymentCaptured.amount) / 100, // Convert from cents to dollars
        //   auctionId: Number(auction.id),
        //   balance: lastBalanceOfAlletre
        //     ? Number(lastBalanceOfAlletre) +
        //       Number(isSellerPaymentCaptured.amount) / 100
        //     : Number(isSellerPaymentCaptured.amount) / 100, // Convert from cents to dollars
        // };
        // await this.walletService.addToAlletreWallet(
        //   sellerPayment[0].userId,
        //   alletreWalletData,
        // );
        // }

        if (BiddersForAuction.length) {
          // Get user with highest bids for auctions
          const highestBidForAuction = BiddersForAuction[0];
          console.log('Max Bid = ', highestBidForAuction);

          // Get winner winnedBidderJoinedAuction
          const winnedBidderAuction =
            await this.prismaService.joinedAuction.findFirst({
              where: {
                userId: highestBidForAuction.userId,
                auctionId: highestBidForAuction.auctionId,
              },
              include:{
                auction:{include:{Payment:{where:{userId:highestBidForAuction.userId,type:'BIDDER_DEPOSIT'}}}}
              }
            });
            console.log('****123',winnedBidderAuction?.auction)
            console.log('****123',winnedBidderAuction?.auction.Payment)
        
           if(winnedBidderAuction?.auction?.Payment.length){
            console.log('testofbidderPayment')
             //capturig the winner payment data
            if(winnedBidderAuction.auction.Payment[0].isWalletPayment){
              //payment is already in the admin wallet
            }else if(winnedBidderAuction.auction.Payment[0].paymentIntentId){
           const isWinnerPaymentCaptured = 
            await this.stripeService.captureDepositPaymentIntent(
              winnedBidderAuction.auction.Payment[0].paymentIntentId
            )

             //find the last transaction balane of the alletre
              const lastBalanceOfAlletre =
              await this.walletService.findLastTransactionOfAlletre();
            //tranfering data for the alletre fees
            const alletreWalletData = {
              status: WalletStatus.DEPOSIT,
              transactionType: WalletTransactionType.By_AUCTION,
              description: `Capturing security deposit of winner due to auction expired`,
              amount: Number(isWinnerPaymentCaptured.amount) / 100, // Convert from cents to dollars
              auctionId: Number(auction.id),
              balance: lastBalanceOfAlletre
                ? Number(lastBalanceOfAlletre) +
                  Number(isWinnerPaymentCaptured.amount) / 100
                : Number(isWinnerPaymentCaptured.amount) / 100, // Convert from cents to dollars
            };
            await this.walletService.addToAlletreWallet(
              winnedBidderAuction.userId,
              alletreWalletData,
            );
           }
          }
          // Update winner joinedAuction to winner and waiting for payment & Set all joined to LOST
          const today = new Date();
          // const newDate = new Date(today.setDate(today.getDate() + 3));
          const newDate =  process.env.NODE_ENV === 'production' ?
          new Date(today.setDate(today.getDate() + 2)):
          new Date(today.getTime() + 3 * 60 * 1000); // Adds 5 minutes

          const {
            isAcutionUpdated,
            isHighestBidder_J_auctionUpdated,
            isLostBidders_J_auctionUpdated,
          } = await this.prismaService.$transaction(async (prisma) => {
            // Set auction to waiting for payment from winner to stop bids
            const isAcutionUpdated = await prisma.auction.update({
              where: {
                id: auction.id,
              },
              data: {
                status: AuctionStatus.WAITING_FOR_PAYMENT, // Update the status of the auction to 'WAITING_FOR_PAYMENT'
                endDate: new Date(), // Set the endDate to the current date and time
              },
              include: {
                bids: {
                  orderBy: { amount: 'desc' },
                  include: {
                    user: true,
                  },
                },
                user: true,
                product: { include: { images: true } },
              },
            });

            const isHighestBidder_J_auctionUpdated =
              await prisma.joinedAuction.update({
                where: { id: winnedBidderAuction.id },
                data: {
                  status: JoinedAuctionStatus.PENDING_PAYMENT,
                  paymentExpiryDate: newDate,
                },
                include: { user: true },
              });

            const isLostBidders_J_auctionUpdated =
              await prisma.joinedAuction.updateMany({
                where: {
                  auctionId: auction.id,
                  id: { not: winnedBidderAuction.id },
                },
                data: { status: JoinedAuctionStatus.LOST },
              });
            return {
              isAcutionUpdated,
              isHighestBidder_J_auctionUpdated,
              isLostBidders_J_auctionUpdated,
            };
          });


          const auctionEndDate = new Date(isAcutionUpdated.expiryDate);
          const formattedEndDate = auctionEndDate.toISOString().split('T')[0]; // Extract YYYY-MM-DD
          const formattedEndTime = auctionEndDate.toTimeString().slice(0, 5);

          if (isAcutionUpdated) {
            //sendEmailtoSeller
            console.log('isAuctionUpdated');
            const body = {
              subject: '🏆 Auction Closed: Congratulations, You Have a Winner!',
              title: 'Your Auction Has Ended Successfully!',
              Product_Name: isAcutionUpdated.product.title,
              img: isAcutionUpdated.product.images[0].imageLink,
              userName: `${isAcutionUpdated.user.userName}`,
              message1: ` 
             <p>Exciting news! Your auction for ${isAcutionUpdated.product.title} has officially ended, and we have a winner!</p>
                    <p>Here are the final details:</p>
              <ul>
              <li>	Winning Bid Amount: ${isAcutionUpdated.bids[0].amount}</li>
              <li>	Winner: ${isAcutionUpdated.bids[0].user.userName} </li>
              <li> Auction Ended On: ${formattedEndDate} & ${formattedEndTime} </li>
             </ul>
             <h3>What’s Next? </h3>
             <ul>
              <li>1. Contact the Winner: Our team Coordinate with ${isAcutionUpdated.bids[0].user.userName} to finalize payment and delivery details.</li>
              <li>2. The winning bid amount and your security deposit will be credit to your wallet after the item delivery.</li>           </ul>
             `,
              message2: `<p>We’re thrilled about your successful auction and appreciate your trust in <b>Alletre</b>! If you need assistance, our support team is just a click away.</p>
                <div style="text-align: center">
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
              Contact Support 
              </a>
             </div>
             <p>Thank you for being part of our community. Here's to more successful auctions!</p>
                <p>Warm regards,</p>
                          <p>The <b>Alletre</b> Team </p>
                          <p>P.S. Encourage buyers to leave feedback—it helps build trust and improve future experiences!</p>`,
                Button_text: 'View Auction Summary   ',
                Button_URL:
                ` https://www.alletre.com/alletre/home/${isAcutionUpdated.id}/details`,
            };

            const whatsappBodyForAuctionSuccess = {
              1: `🏆 Hi ${isAcutionUpdated.user.userName},`,
              2: `Great news! Your auction for *${isAcutionUpdated.product.title}* has officially ended and we have a winner.`,
              3: `Here are the final details:`,
              4: `• Winning Bid Amount: ${isAcutionUpdated.bids[0].amount} • Winner: ${isAcutionUpdated.bids[0].user.userName} • Ended On: ${formattedEndDate} & ${formattedEndTime}`,
              5: `Next steps: • Our team will coordinate with ${isAcutionUpdated.bids[0].user.userName} to finalize payment and delivery.`,
              6: `• The winning amount and your deposit will be credited to your wallet after item delivery.`,
              7: `Thanks for trusting *Alletre*! If you need help, our support team is just a click away. We look forward to more successful auctions with you.`,
              8: `${isAcutionUpdated.product.images[0].imageLink}`,
              9: `https://www.alletre.com/alletre/home/${isAcutionUpdated.id}/details`,
            };

            if (isAcutionUpdated.user.phone) {
              await this.whatsappService.sendOtherUtilityMessages(
                whatsappBodyForAuctionSuccess,
                isAcutionUpdated.user.phone,
                'alletre_common_utility_templet',
              );
            }

            await this.emailService.sendEmail(
              isAcutionUpdated.user.email,
              'token',
              EmailsType.OTHER,
              body,
            );

            // create notification for seller
            const isCreateNotificationToSeller =
              await this.prismaService.notification.create({
                data: {
                  userId: isAcutionUpdated.userId,
                  message: `We would like to inform you that your auction for "${isAcutionUpdated.product.title}" (Model: ${isAcutionUpdated.product.model}) has expired.`,
                  imageLink: isAcutionUpdated.product.images[0].imageLink,
                  productTitle: isAcutionUpdated.product.title,
                  auctionId: isAcutionUpdated.id,
                },
              });
            if (isCreateNotificationToSeller) {
              // Send notification to seller when auction expire
              const sellerUserId = isCreateNotificationToSeller.userId;

              const notification = {
                status: 'ON_AUCTION_EXPIRE_WITH_BIDDER',
                userType: 'FOR_SELLER',
                usersId: sellerUserId,
                message: isCreateNotificationToSeller.message,
                imageLink: isCreateNotificationToSeller.imageLink,
                productTitle: isCreateNotificationToSeller.productTitle,
                auctionId: isCreateNotificationToSeller.auctionId,
              };
              try {
                this.notificationService.sendNotificationToSpecificUsers(
                  notification,
                );
              } catch (error) {
                console.log('sendNotificationToSpecificUsers error', error);
              }
            }
          }

          auctionEndDate.setDate(auctionEndDate.getDate() + 3);
          const PaymentEndDate = auctionEndDate.toISOString().split('T')[0];
          if (isHighestBidder_J_auctionUpdated) {
            //sendEmailToHighestBidder
            const body = {
              subject: '🏆 Congratulations! You Won the Auction!',
              title:
                'Your Winning Bid is Confirmed – Complete Your Purchase Now',
              Product_Name: isAcutionUpdated.product.title,
              img: isAcutionUpdated.product.images[0].imageLink,
              userName: `${isAcutionUpdated.bids[0].user.userName}`,
              message1: ` 
                <p>Congratulations on winning the auction for ${isAcutionUpdated.product.title}! It’s time to complete the payment and finalize your purchase.</p>
                        <p>Auction Details:</p>
                <ul>
                  <li>	Item: ${isAcutionUpdated.product.title}</li>
                  <li>	Winning Bid: ${isAcutionUpdated.bids[0].amount}</li>
                  <li>	Seller: ${isAcutionUpdated.user.userName}</li>
                  <li>	Payment Due By:${PaymentEndDate}& ${formattedEndTime}</li>
                </ul>
                <h3>What’s Next? </h3>
                <p>1️⃣<b> Complete Payment:</b></p>
                <p>Secure your item by completing the payment now</p>`,
              message2: ` <p>2️⃣<b> Choose Delivery or Pickup:</b></p>
                <ul>
                  <li>	<b>Delivery</b>: The item will be shipped to your address after payment. (additional shipping charges may apply).</li>
                  <li>	<b>Pickup</b>: If you prefer, you can collect the item directly from the seller’s address. (Details will be provided after payment).</li>
                </ul>
                     <div style="text-align: center">
               <a
                href="https://www.alletre.com/alletre/profile/my-bids/pending"
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
                Select Delivery Option 
               </a>
               </div>
               <p>3️⃣ <b> Confirm Item Collection:</b></p>
                   
                    <p>If you choose to pick up the item, don’t forget to confirm that you’ve collected it. This ensures a smooth transaction for both you and the seller.</p>
                              <div style="text-align: center">
               <a
                 href="https://www.alletre.com/alletre/profile/my-bids/pending"
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
                Confirm Collection  
               </a>
               </div>
                    <p>Warm regards,</p>
                   <p>The <b>Alletre</b> Team </p>`,
                 Button_text: 'Complete Payment ',
                 Button_URL:
                   'https://www.alletre.com/alletre/profile/my-bids/pending',
            };
            await this.emailService.sendEmail(
              isHighestBidder_J_auctionUpdated.user.email,
              'token',
              EmailsType.OTHER,
              body,
            );
            //sending whatsapp message to winner
            const whatsappBodyForAuctionWin = {
              1: `🏆 Hi ${isAcutionUpdated.bids[0].user.userName},`,
              2: `Congrats! You won the auction for *${isAcutionUpdated.product.title}*. Now it is time to complete your payment and finalize the deal.`,
              3: `Auction details:`,
              4: `• Item: ${isAcutionUpdated.product.title} • Winning Bid: ${isAcutionUpdated.bids[0].amount} • Seller: ${isAcutionUpdated.user.userName} • Payment Due By: ${PaymentEndDate} & ${formattedEndTime}`,
              5: `Step 1 Complete your payment go to *alletre.com*, login to your account, and Click the button below this message to begin the payment process securely .`,
              6: `Step 2 Choose delivery or pickup: • Delivery: We ship to your address (shipping charges may apply) • Pickup: Collect directly from the seller (details shared after payment)`,
              7: `Step 3 If picking up, confirm once collected. This helps ensure a smooth and secure transaction. Thanks for being part of *Alletre*!`,
              8: `${isAcutionUpdated.product.images[0].imageLink}`,
              9: `alletre/profile/my-bids/pending`,
            };

            if (isAcutionUpdated.bids[0].user.phone) {
              await this.whatsappService.sendOtherUtilityMessages(
                whatsappBodyForAuctionWin,
                isAcutionUpdated.bids[0].user.phone,
                'alletre_common_utility_templet',
              );
            }

            // create notification for winner
            const isCreateNotificationToWinner =
              await this.prismaService.notification.create({
                data: {
                  userId: isHighestBidder_J_auctionUpdated.userId,
                  message: `Congratulations.. You have won the Auction of ${isAcutionUpdated.product.title} (Model:${isAcutionUpdated.product.model}) at AED ${isAcutionUpdated.bids[0].amount}.`,
                  imageLink: isAcutionUpdated.product.images[0].imageLink,
                  productTitle: isAcutionUpdated.product.title,
                  auctionId: isAcutionUpdated.id,
                },
              });
            if (isCreateNotificationToWinner) {
              // Send notification to winner when auction expire
              const sellerUserId = isCreateNotificationToWinner.userId;

              const notification = {
                status: 'ON_AUCTION_EXPIRE_WITH_BIDDER',
                userType: 'FOR_WINNER',
                usersId: sellerUserId,
                message: isCreateNotificationToWinner.message,
                imageLink: isCreateNotificationToWinner.imageLink,
                productTitle: isCreateNotificationToWinner.productTitle,
                auctionId: isCreateNotificationToWinner.auctionId,
              };
              try {
                this.notificationService.sendNotificationToSpecificUsers(
                  notification,
                );
              } catch (error) {
                console.log('sendNotificationToSpecificUsers error', error);
              }
            }
          }
          if (isLostBidders_J_auctionUpdated) {
            //sendEmailToLostBidders
            const loserData = await this.prismaService.joinedAuction.findMany({
              where: {
                auctionId: auction.id,
                id: { not: winnedBidderAuction.id },
              },
              include: { user: true },
            });
            if (loserData.length) {
              await Promise.all(
                loserData.map(async (data) => {
                  const body = {
                    subject: '❌ Auction Ended: You Didn’t Win This Time',
                    title: 'The Auction Has Ended',
                    Product_Name: isAcutionUpdated.product.title,
                    img: isAcutionUpdated.product.images[0].imageLink,
                    userName: `${data.user.userName}`,
                    message1: ` 
                    <p>Thank you for participating in the auction for ${
                      isAcutionUpdated.product.title
                    }. While your bid was competitive, the auction has now ended, and unfortunately, you didn’t win this time. </p>
                            <p>Auction Summary:</p>
                    <ul>
                      <li>	Item: ${isAcutionUpdated.product.title}</li>
                      <li>	Your Highest Bid: [Your Bid Amount]:${
                        isAcutionUpdated.bids.find(
                          (bid) => bid.userId === isAcutionUpdated.user.id,
                        )?.amount
                      }</li>
                      <li>	Winning Bid: ${isAcutionUpdated.bids[0].amount}</li>
                    </ul>
                    <h3>Don’t Give Up! </h3>
                    <p>There are many more exciting auctions waiting for you on [Website Name]. Check here for more exciting auctions:</p>
                    `,
                    message2: `<p>We appreciate your enthusiasm and look forward to seeing you succeed in your next auction. Keep bidding and keep winning!</p>
                                <p>Warm regards,</p>
                                <p>The <b>Alletre</b> Team </p>
                                <p>P.S. Have questions or need assistance? Contact us anytime.</p>`,
                    Button_text: 'Live Auctions',
                    Button_URL: ' https://www.alletre.com/',
                  };

                  await this.emailService.sendEmail(
                    data.user.email,
                    'token',
                    EmailsType.OTHER,
                    body,
                  );
                  const whatsappBodyForAuctionLost = {
                    1: `❌ Hi ${data.user.userName},`,
                    2: `Thank you for participating in the auction for *${isAcutionUpdated.product.title}*. While your bid was competitive, the auction has ended and you did not win this time.`,
                    3: `Auction summary:`,
                    4: `• Item: ${
                      isAcutionUpdated.product.title
                    } • Your Highest Bid: ${
                      isAcutionUpdated.bids.find(
                        (bid) => bid.userId === isAcutionUpdated.user.id,
                      )?.amount
                    } • Winning Bid: ${isAcutionUpdated.bids[0].amount}`,
                    5: `Do not give up. There are many more exciting auctions waiting for you on Alletre.`,
                    6: `Tap below to explore live auctions and get ready for your next opportunity to win.`,
                    7: `We appreciate your enthusiasm and look forward to seeing you succeed next time. Keep bidding and keep winning with Alletre.`,
                    8: `${isAcutionUpdated.product.images[0].imageLink}`,
                    9: `https://www.alletre.com`,
                  };

                  if (data.user.phone) {
                    await this.whatsappService.sendOtherUtilityMessages(
                      whatsappBodyForAuctionLost,
                      data.user.phone,
                      'alletre_common_utility_templet',
                    );
                  }

                  // create notification for winner
                  const isCreateNotificationToLoser =
                    await this.prismaService.notification.create({
                      data: {
                        userId: data.userId,
                        message: `We regret to inform you that you have lost the auction for "${isAcutionUpdated.product.title}" (Model: ${isAcutionUpdated.product.model}).`,
                        imageLink: isAcutionUpdated.product.images[0].imageLink,
                        productTitle: isAcutionUpdated.product.title,
                        auctionId: isAcutionUpdated.id,
                      },
                    });
                  if (isCreateNotificationToLoser) {
                    // Send notification to seller when auction expire
                    const sellerUserId = isCreateNotificationToLoser.userId;

                    const notification = {
                      status: 'ON_AUCTION_EXPIRE_WITH_BIDDER',
                      userType: 'FOR_LOSERS',
                      usersId: sellerUserId,
                      message: isCreateNotificationToLoser.message,
                      imageLink: isCreateNotificationToLoser.imageLink,
                      productTitle: isCreateNotificationToLoser.productTitle,
                      auctionId: isCreateNotificationToLoser.auctionId,
                    };
                    try {
                      this.notificationService.sendNotificationToSpecificUsers(
                        notification,
                      );
                    } catch (error) {
                      console.log(
                        'sendNotificationToSpecificUsers error',
                        error,
                      );
                    }
                  }
                }),
              );
            }
          }

          // finding losers peyment data to Cancel payment authorizations for losing bidders
          const losingBidders = await this.prismaService.joinedAuction.findMany(
            {
              where: {
                auctionId: auction.id,
                id: { not: winnedBidderAuction.id },
                status: JoinedAuctionStatus.LOST,
              },
            },
          );

          console.log('lostBidders :',losingBidders.length)
          for (const loser of losingBidders){
            try {
              const lostBidderPaymentData =
              await this.paymentService.getAuctionPaymentTransaction(
                loser.userId,
                loser.auctionId,
                PaymentType.BIDDER_DEPOSIT,
              );
              //releasing the security deposit of losers
              console.log('lostBidderPaymentData',lostBidderPaymentData)
              if(lostBidderPaymentData){
                await this.processRefundForLosingBidders(lostBidderPaymentData, this.prismaService);
              }
              console.log(`Successfully processed refund for losing bidder: ${loser.userId}`);
            } catch (error) {
              console.error(
                `Failed to process refund for losing bidder ${loser.userId}:`,
                error,
              );
              const body = {
                subject: `Failed to process refund for losing bidder ${loser.userId}:`,
                title: `Failed to process refund for losing bidder ${loser.userId}:`,
                message1: `This is a test message from alletre backend when error occur at markPendingBidderPaymentAuctionsExpired function 
                               Transaction Failed ${error.message}`,
                Button_text: 'Click here to continue ',
                Button_URL: process.env.FRONT_URL,
              };
              await this.emailService.sendEmail(
                'alletre.auctions@gmail.com',
                'token',
                EmailsType.OTHER,
                body,
              );
            }
          }

          // await Promise.all(
          //   losingBidders.map(async (loser) => {
          //     try {
          //       const lostBidderPaymentData =
          //         await this.paymentService.getAuctionPaymentTransaction(
          //           loser.userId,
          //           loser.auctionId,
          //           PaymentType.BIDDER_DEPOSIT,
          //         );
          //       console.log(
          //         'lostBidderPaymentData ===>',
          //         lostBidderPaymentData,
          //       );
          //       console.log('lostBidderIswallet1',lostBidderPaymentData.isWalletPayment)
          //       if (!lostBidderPaymentData.isWalletPayment) {
          //         await this.stripeService.cancelDepositPaymentIntent(
          //           lostBidderPaymentData.paymentIntentId,
          //         );
          //       } else {
          //         //logic to transfer to the wallet
          //       console.log('lostBidderIswallet2',lostBidderPaymentData.isWalletPayment)

          //         //finding the last transaction balance of the losers
          //         const lastWalletTransactionBalanceOfBidder =
          //           await this.walletService.findLastTransaction(loser.userId);
          //         //finding the last transaction balance of the alletreWallet
          //         const lastBalanceOfAlletre =
          //           await this.walletService.findLastTransactionOfAlletre();
          //         //wallet data for withdraw money from seller wallet

          //         const BidderWalletData = {
          //           status: WalletStatus.DEPOSIT,
          //           transactionType: WalletTransactionType.By_AUCTION,
          //           description: `Return security deposit due to auction lost`,
          //           amount: Number(lostBidderPaymentData.amount),
          //           auctionId: Number(lostBidderPaymentData.auctionId),
          //           balance: lastWalletTransactionBalanceOfBidder
          //             ? Number(lastWalletTransactionBalanceOfBidder) +
          //               Number(lostBidderPaymentData.amount)
          //             : Number(lostBidderPaymentData.amount),
          //         };
          //         // wallet data for deposit to alletre wallet

          //         const alletreWalletData = {
          //           status: WalletStatus.WITHDRAWAL,
          //           transactionType: WalletTransactionType.By_AUCTION,
          //           description: `Return of bidder security deposit due to lost auction`,
          //           amount: Number(lostBidderPaymentData.amount),
          //           auctionId: Number(lostBidderPaymentData.auctionId),
          //           balance:
          //             Number(lastBalanceOfAlletre) -
          //             Number(lostBidderPaymentData.amount),
          //         };
          //         await this.walletService.create(
          //           lostBidderPaymentData.userId,
          //           BidderWalletData,
          //         );
          //         //crete new transaction in alletre wallet
          //         await this.walletService.addToAlletreWallet(
          //           lostBidderPaymentData.userId,
          //           alletreWalletData,
          //         );
          //       }
          //       console.log(
          //         `Canceled payment for losing bidder: ${loser.userId}`,
          //       );
          //     } catch (error) {
          //       console.error(
          //         'Error canceling payment for losing bidder:',
          //         error,
          //       );
          //     }
          //   }),
          // );

          //TODO: Notify user
          await this.userAuctionService.notifyAuctionWinner(
            highestBidForAuction.userId,
          );
          console.log('User notified');
        }
        // Set auction to EXPIRED
        else {
          //if there are zero bidders
          console.log('found zero bidder auction expire');
          const auctionExpairyData = await this.prismaService.auction.update({
            where: {
              id: auction.id,
            },
            data: {
              status: AuctionStatus.EXPIRED, // Update the status of the auction to 'EXPIRED'
              endDate: new Date(), // Set the endDate to the current date and time
            },
            include: {
              user: true,
              product: {
                include: { images: true },
              },
            },
          });
          console.log('auction____', auctionExpairyData);
          if (auctionExpairyData) {
            //send email here
            const sellerPaymentData =
              await this.prismaService.payment.findFirst({
                where: {
                  auctionId: auctionExpairyData.id,
                  type: 'SELLER_DEPOSIT',
                },
              });

              if (sellerPayment.length === 0){
                // this is the case while the user is not pay the security deposit, there are cases when uses can put auction with out security deposite in special categories (ex: car under 5000),  
                const adminMessage = "The auction has been cancelled because the You did not comply with Alletre's guidelines"
                this.userAuctionService.updateAuctionForCancellationByAdmin(auction.id, adminMessage)
                return
              }
            let isSendBackS_D: any;
            // if (!sellerPaymentData.isWalletPayment) {
            //   console.log('canceldeposit*******');
            //   isSendBackS_D =
            //     await this.stripeService.cancelDepositPaymentIntent(
            //       sellerPaymentData.paymentIntentId,
            //     );
            // } else
              {
              try {
                //logic to transfer to the wallet
                //finding the last transaction balance of the Seller
                const lastWalletTransactionBalanceOfBidder =
                  await this.walletService.findLastTransaction(
                    sellerPaymentData.userId,
                  );
                //finding the last transaction balance of the alletreWallet
                const lastBalanceOfAlletre =
                  await this.walletService.findLastTransactionOfAlletre();

                //wallet data for deposit  money to seller wallet
                const sellerWalletData = {
                  status: WalletStatus.DEPOSIT,
                  transactionType: WalletTransactionType.By_AUCTION,
                  description: `Return security deposit due to auction Expired and there is zero bidders`,
                  amount: Number(sellerPaymentData.amount),
                  auctionId: Number(sellerPaymentData.auctionId),
                  balance: lastWalletTransactionBalanceOfBidder
                    ? Number(lastWalletTransactionBalanceOfBidder) +
                      Number(sellerPaymentData.amount)
                    : Number(sellerPaymentData.amount),
                };
                // wallet data for withdraw from alletre wallet

                const alletreWalletData = {
                  status: WalletStatus.WITHDRAWAL,
                  transactionType: WalletTransactionType.By_AUCTION,
                  description: `Return of seller security auction Expired and there is zero bidders`,
                  amount: Number(sellerPaymentData.amount),
                  auctionId: Number(sellerPaymentData.auctionId),
                  balance:
                    Number(lastBalanceOfAlletre) -
                    Number(sellerPaymentData.amount),
                };

                await this.walletService.create(
                  sellerPaymentData.userId,
                  sellerWalletData,
                );
                //crete new transaction in alletre wallet
                await this.walletService.addToAlletreWallet(
                  sellerPaymentData.userId,
                  alletreWalletData,
                );
                isSendBackS_D = true;
              } catch (error) {
                console.log(
                  'Send back Security Deposite of seller Error',
                  error,
                );
              }
            }
            // else {
            //    //this is sinario is reached while the user cancell the auction with no or zero security deposit
            //   //example : if the user cancell the auction which is CAR category, and the start bid amount is less than 5000, the we don't take the security deposit
            //   // so in this situation the security deposite will be zero of the seller, so when we give the compensation to the winner, it will be deducted from the alletre account
            //   isSendBackS_D =
            //   sellerPaymentData.status === 'SUCCESS' ? true : false;
            // }
            if (isSendBackS_D) {
              const body = {
                subject: 'Your Auction Has Ended – Let’s Try Again!',
                title: `Your Auction for ${auctionExpairyData.product.title} Has Ended`,
                Product_Name: auctionExpairyData.product.title,
                img: auctionExpairyData.product.images[0].imageLink,
                userName: `${auctionExpairyData.user.userName}`,
                message1: ` 
                <p>We noticed your auction for ${auctionExpairyData.product.title} has ended without any bids. While this can happen occasionally, don’t worry – we’re here to help!</p>
                <p>${Number(sellerPaymentData.amount) > 0 ? `Good news: your security deposit of ${sellerPaymentData.amount} will be refunded to your account shortly.` :``}</p>
                <p>Here’s what you can do to improve your chances next time:</p>
                <ul>
                  <li>	Adjust Your Starting Bid: A lower starting bid might attract more interest.</li>
                  <li>	Enhance Your Listing: Add more photos or improve your item description.</li>
                  <li>	Promote Your Auction: Share your listing on social media to reach a wider audience.</li>
                  <li>	Refine Your Description: A detailed and appealing description can make a big difference.</li>
                </ul>
                <p>Would you like to relist your auction with ease?</p>`,
                message2: `<p>Thank you for choosing <b>Alletre</b>. Let’s turn this into an opportunity to find the right buyer!</p>
                          <p style="margin-bottom: 0;">Best regards,</p>
                          <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                            <p>P.S. Need help improving your listing? Check out our tips for creating successful auctions: <a href="https://www.alletre.com/">Auction Tips</a></p>
`,
                Button_text: 'Create Auction ',
                Button_URL: ' https://www.alletre.com/',
              };
              await this.emailService.sendEmail(
                auctionExpairyData.user.email,
                'token',
                EmailsType.OTHER,
                body,
              );
              const whatsappBodyForAuctionExpiredWithoutBids = {
                1: `📭 Hi ${auctionExpairyData.user.userName},`,
                2: `Your auction for *${auctionExpairyData.product.title}* has ended without receiving any bids. That happens sometimes but no worries we have got your back.`,
                3: `Good news. Your security deposit of ${sellerPaymentData.amount} will be refunded to your account shortly.`,
                4: `Here are some tips to improve your chances next time.`,
                5: `• Lower your starting bid to attract more interest • Add more photos or improve your item description • Share your auction on social media to get more reach • Write a clear and appealing item description`,
                6: `Would you like to relist your auction easily`,
                7: `Tap below to create a new auction and connect with potential buyers today.`,
                8: `${auctionExpairyData.product.images[0].imageLink}`,
                9: `https://www.alletre.com/`,
              };

              if (auctionExpairyData.user.phone) {
                await this.whatsappService.sendOtherUtilityMessages(
                  whatsappBodyForAuctionExpiredWithoutBids,
                  auctionExpairyData.user.phone,
                  'alletre_common_utility_templet',
                );
              }
            }
            const auctionExpireNotificationData =
              await this.prismaService.notification.create({
                data: {
                  userId: auctionExpairyData.userId,
                  message: `The auction for your product "${auctionExpairyData.product.title}" (Model: ${auctionExpairyData.product.model}) has expired with zero bidders.`,
                  imageLink: auctionExpairyData.product.images[0].imageLink,
                  productTitle: auctionExpairyData.product.title,
                  auctionId: auction.id,
                },
              });
            if (auctionExpireNotificationData) {
              // Send notification to seller
              console.log('auction____', auctionExpireNotificationData);
              const sellerUserId = auctionExpireNotificationData.userId;
              const notification = {
                status: 'ON_AUCTION_EXPIRE_WITH_ZERO_BIDDER',
                userType: 'FOR_SELLER',
                usersId: sellerUserId,
                message: auctionExpireNotificationData.message,
                imageLink: auctionExpireNotificationData.imageLink,
                productTitle: auctionExpireNotificationData.productTitle,
                auctionId: auctionExpireNotificationData.auctionId,
              };
              try {
                this.notificationService.sendNotificationToSpecificUsers(
                  notification,
                );
              } catch (error) {
                console.log('sendNotificationToSpecificUsers error', error);
              }
            }
          }
        }
      }
    // ),);
   } catch (error) {
    console.error('auciton expire error :',error)
   }
  }


  // @Cron(CronExpression.EVERY_5_MINUTES, { timeZone: 'Asia/Dubai' })
  @Cron('0 0 * * MON', { timeZone: 'Asia/Dubai' })   // every Monday 00:00
  async _sendWeeklyAuctionDigest() {
    console.log('Send Weekly Auction Digest logs ')
    // 1. Grab the last 4 auctions
    const [activeAuctions, scheduledAuctions] = await Promise.all([
      this.prismaService.auction.findMany({
        where: { status: AuctionStatus.ACTIVE },
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: {
          id: true,
          startBidAmount: true,
          acceptedAmount: true,
          expiryDate: true,
          startDate: true,
          product: { select: { title: true, images: { select: { imageLink: true } } } },
        },
      }),
      this.prismaService.auction.findMany({
        where: { status: AuctionStatus.IN_SCHEDULED },
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: {
          id: true,
          startBidAmount: true,
          acceptedAmount: true,
          expiryDate: true,
          startDate: true,
          product: { select: { title: true, images: { select: { imageLink: true } } } },
        },
      }),
    ]);
    
    const listedProduct = await this.prismaService.listedProducts.findMany({
      orderBy:{createdAt: 'desc'},
      take: 4,
      select:{
        id:true,
        ProductListingPrice:true,
        product: {
          select: {
            title: true,
            images:{select:{
              imageLink:true,
            }}      // adjust to your actual image‑field name
          },
        },
      }
    })
    console.log('Send Weekly Auction Digest logs ', activeAuctions.length)
    console.log('Send Weekly Auction Digest logs ', scheduledAuctions.length)
    console.log('Send Weekly Auction Digest logs ', listedProduct.length)
    

    if (!activeAuctions.length && !scheduledAuctions.length && !listedProduct.length) return;

    // 2. Render email body
    const html = this.renderDigestHtml(activeAuctions,scheduledAuctions,listedProduct);
    const text =
    'Check out the latest auctions on Alletre! Visit https://alletre.com to see more.';
 // 3️⃣ Page through all eligible users and send in batches
 const batchSize = 800; // safe chunk (< SendGrid 1000 limit)
 for (let skip = 0; ; skip += batchSize) {
   const users = await this.prismaService.user.findMany({
     skip,
     take: batchSize,
     select: { email: true },
   });
   if (!users.length) break;

   // Extract email strings
   const emails = users.map((u) => u.email);

   // 4️⃣ Spawn the existing email worker
   await new Promise<void>((resolve, reject) => {
     const worker = new Worker(
       join(__dirname, '../emails/email.worker.js'), // compiled JS path
       {
         workerData: {
           users: emails,                // <- matches workerData.users
           subject:
             '🔔 Last week on Alletre – Top 4 auctions you missed!',
           text,
           html,                         // <- matches workerData.html
         },
       },
     );
     worker.on('message', (msg) =>
       msg.success ? resolve() : reject(msg.error),
     );
     worker.on('error', reject);
   });
 }
}




private renderDigestHtml(
  activeAuctions: any[],
  scheduledAuctions: any[],
  listedProducts: any[],
) {
  /* ----------  helper to pretty‑print dates in GST  ---------- */
  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Dubai',
      timeZoneName: 'short', // “GST”
    })
      .format(d)
      .replace(',', '');

      

  /* ----------  one auction/listing card  ---------- */
  const makeCard = (
    image: string,
    title: string,
    priceLabel: string,
    timerLabel: string | undefined, // already pre‑formatted in caller
    link: string,
    buttonText : string,
  ) => `
  <tr>
    <td style="padding:0 12px 24px 12px;">
      <table width="100%" cellpadding="0" cellspacing="0"
             style="border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
        <!-- product image -->
        <tr>
          <td style="padding:0;">
            <img src="${image}" width="100%" style="display:block;" alt="${title}" />
          </td>
        </tr>
  
        <!-- price ribbon -->
        <tr>
          <td style="padding:8px 12px 0 12px;">
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="background:#a91d3a;color:#fff;font-size:13px;font-weight:600;padding:4px 8px;border-radius:4px;">
                  ${priceLabel}
                </td>
                <!-- icons placeholder -->
                <td style="text-align:right;font-size:0;">
                  <!-- you could embed small 16×16 SVG icons here -->
                </td>
              </tr>
            </table>
          </td>
        </tr>
  
        <!-- title -->
        <tr>
          <td style="padding:8px 12px 0 12px;">
            <p style="margin:0;font-size:16px;font-weight:600;color:#333;">${title}</p>
          </td>
        </tr>
  
        <!-- timer / bids -->
        ${
          timerLabel
            ? `<tr>
            <td style="padding:8px 12px 0 12px;font-size:13px;color:#555;">
              ⏰ ${timerLabel}
            </td>
          </tr>`
            : ''
        }
  
        <!-- call‑to‑action -->
        <tr>
          <td style="padding:16px 12px 20px 12px;">
            <a href="${link}"
               style="display:block;text-align:center;background:#a91d3a;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:10px 0;border-radius:6px;">
               ${buttonText}
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
  

  /** Split an array into chunks of 2 elements */
const chunk2 = <T,>(arr: T[]) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) out.push(arr.slice(i, i + 2));
  return out;
};


  /* ----------  build each card group  ---------- */
  const activeCardHtmlArray = activeAuctions.map((a) =>
    makeCard(
      a.product?.images?.[0]?.imageLink ?? '',
      a.product?.title ?? '',
      `Starting Amount: <strong>${a.startBidAmount} AED</strong>`,
      `Ends: <strong>${fmtDate(a.expiryDate)}</strong>`,
      process.env.NODE_ENV === 'production'
        ? `https://www.alletre.com/alletre/home/${a.id}/details`
        : `http://localhost:3000/alletre/home/${a.id}/details`,
        'Bid Now'
    ),
  );
  

  const activeCards = chunk2(activeCardHtmlArray)
    .map(
      (pair) => `
    <tr>
      ${pair.join('')}
    </tr>`,
    )
    .join('');

  const scheduledCardHtmlArray = scheduledAuctions.map((a) =>
      makeCard(
        a?.product?.images?.[0]?.imageLink ?? '',
        a?.product?.title ?? '',
        `Starting Amount: <strong>${a.startBidAmount} AED</strong>`,
        `Starts: <strong>${fmtDate(a.startDate)}</strong>`,
        process.env.NODE_ENV === 'production'
          ? `https://www.alletre.com/alletre/home/${a.id}/details`
          : `http://localhost:3000/alletre/home/${a.id}/details`,
          'View Details'
      ),
    )
 

    const scheduledCards = chunk2(scheduledCardHtmlArray)
    .map(
      (pair) => `
    <tr>
      ${pair.join('')}
    </tr>`,
    )
    .join('');


  const directBuyCardsHtmlArray = listedProducts
    .map((p) =>
      makeCard(
        p?.product?.images?.[0]?.imageLink ?? '',
        p?.product?.title ?? '',
        `Price: <strong>${p.ProductListingPrice} AED</strong>`,
        undefined,
        process.env.NODE_ENV === 'production'
          ? `https://www.alletre.com/alletre/my-product/${p.id}/details`
          : `http://localhost:3000/alletre/my-product/${p.id}/details`,
          'View Details',
      ),
    )


    const directBuyCards = chunk2(directBuyCardsHtmlArray)
    .map(
      (pair) => `
    <tr>
      ${pair.join('')}
    </tr>`,
    )
    .join('');

  /* ----------  helper to render a section only when it has cards  ---------- */
  const section = (heading: string, cardsHtml: string) =>
    cardsHtml
      ? `
  <tr>
    <td style="padding:12px 0;font-family:Arial,Helvetica,sans-serif;text-align:left;">
      <h3 style="margin:0;font-size:20px;color:#a91d3a;">${heading}</h3>
    </td>
  </tr>
  ${cardsHtml}`
      : '';

  /* ----------  full email HTML  ---------- */
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:auto;">
  <!-- Logo -->
  <tr>
    <td style="padding:24px 0;text-align:center;font-family:Arial,Helvetica,sans-serif;">
      <img src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/logoForEmail.png?alt=media&token=8e56c373-b4d6-404f-8d2c-a503dfa71052"
           alt="Alletre" width="140" style="display:block;margin:auto;" />
    </td>
  </tr>

  <!-- Main title -->
  <tr>
    <td style="padding:12px 0 24px 0;text-align:center;font-family:Arial,Helvetica,sans-serif;">
      <h2 style="margin:0;font-size:24px;color:#a91d3a;">Last week’s top auctions</h2>
    </td>
  </tr>

  ${section('Active Auctions', activeCards)}
  ${section('Scheduled Auctions', scheduledCards)}
  ${section('Direct‑Buy Products', directBuyCards)}

  <!-- Footer -->
  <tr>
    <td style="padding-top:12px;font-size:12px;color:#888;font-family:Arial,Helvetica,sans-serif;text-align:center;">
      You’re receiving this because you have an Alletre account.<br/>
      <a href="https://alletre.com/settings/notifications" style="color:#888;text-decoration:underline;">Unsubscribe</a>
    </td>
  </tr>
</table>`;
}



  async  processRefundForLosingBidders(lostBidderPaymentData: any, prismaService: PrismaClient) {
    console.log('lostBidderIswallet1',lostBidderPaymentData)
    if (!lostBidderPaymentData.isWalletPayment) {
      await this.stripeService.cancelDepositPaymentIntent(
        lostBidderPaymentData.paymentIntentId,
      );
      return;
    }
    //logic to transfer to the wallet
    console.log('lostBidderIswallet2', lostBidderPaymentData.isWalletPayment);
    await prismaService.$transaction(async (prisma) => {
      const existingRefund = await prisma.wallet.findFirst({
        where: {
          userId: lostBidderPaymentData.userId,
          auctionId: lostBidderPaymentData.auctionId,
          description: 'Return security deposit due to auction lost',
        },
      });
    
      if (existingRefund) {
        console.log('Refund already processed. Skipping...');
        return;
      }
      //finding the last transaction balance of the losers
      const lastWalletTransactionBalanceOfBidder =
        await this.walletService.findLastTransaction(
          lostBidderPaymentData.userId,
        );
      //finding the last transaction balance of the alletreWallet
      const lastBalanceOfAlletre =
        await this.walletService.findLastTransactionOfAlletre();

      //wallet data for withdraw money from seller wallet
      const BidderWalletData = {
        status: WalletStatus.DEPOSIT,
        transactionType: WalletTransactionType.By_AUCTION,
        description: `Return security deposit due to auction lost`,
        amount: Number(lostBidderPaymentData.amount),
        auctionId: Number(lostBidderPaymentData.auctionId),
        balance: lastWalletTransactionBalanceOfBidder
          ? Number(lastWalletTransactionBalanceOfBidder) +
            Number(lostBidderPaymentData.amount)
          : Number(lostBidderPaymentData.amount),
      };
      // wallet data for deposit to alletre wallet

      const alletreWalletData = {
        status: WalletStatus.WITHDRAWAL,
        transactionType: WalletTransactionType.By_AUCTION,
        description: `Return of bidder security deposit due to lost auction`,
        amount: Number(lostBidderPaymentData.amount),
        auctionId: Number(lostBidderPaymentData.auctionId),
        balance:
          Number(lastBalanceOfAlletre) - Number(lostBidderPaymentData.amount),
      };

      await prisma.wallet.create({
        data: {
          userId: lostBidderPaymentData.userId,
          description: BidderWalletData.description,
          amount: BidderWalletData.amount,
          status: BidderWalletData.status,
          transactionType: BidderWalletData.transactionType,
          auctionId: BidderWalletData.auctionId,
          balance: BidderWalletData.balance,
        },
      });
      await prisma.alletreWallet.create({
        data: {
          userId: lostBidderPaymentData.userId,
          description: alletreWalletData.description,
          amount: alletreWalletData.amount,
          status: alletreWalletData.status,
          transactionType: alletreWalletData.transactionType,
          auctionId: alletreWalletData.auctionId,
          balance: alletreWalletData.balance,
        },
      });
      
    })
}

 
}
