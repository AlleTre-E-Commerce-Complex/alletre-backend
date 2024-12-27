import { Body, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import {
  AuctionStatus,
  JoinedAuctionStatus,
  PaymentStatus,
  PaymentType,
  WalletStatus,
  WalletTransactionType,
} from '@prisma/client';
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
        include: { user: true, product: { include: { images: true } } },
      });
      if (updatedAuction) {
        const emailBodyToSeller = {
          subject: 'Your Auction Has Been Successfully Listed!',
          title: 'Your Auction is Live!',
          Product_Name: updatedAuction.product.title,
          img: updatedAuction.product.images[0].imageLink,
          message: `Hi ${updatedAuction.user.userName}, 
        
        Congratulations! Your auction for the product ${updatedAuction.product.title} (Model: ${updatedAuction.product.model}) has been successfully listed on Alletre. 
        
        Your item is now live and available for bidding. Here are the details:
        • Product: ${updatedAuction.product.title} 
        • Model: ${updatedAuction.product.model}
        
        We encourage you to keep an eye on your auction as bids start coming in. 
        You can view and manage your auction through the link below. 
        
        Thank you for choosing Alletre to list your auction. We look forward to helping you get the best possible price for your item!
        
        Good luck,
        The Alletre Team`,
          Button_text: 'Click here to view your Auction',
          Button_URL: process.env.FRONT_URL, // Link to the auction management page
        };
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
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markPendingBidderPaymentAuctionsExpired() {
    // Get pending payment auctions
    const pendingPaymentAuction =
      await this.prismaService.joinedAuction.findMany({
        where: {
          paymentExpiryDate: { lte: new Date() },
          status: JoinedAuctionStatus.PENDING_PAYMENT,
        },
        include: {
          auction: true,
        },
      });

    console.log('pendingPaymentAuction :', pendingPaymentAuction);
    for (const joinedAuction of pendingPaymentAuction) {
      //find the security deposit Of Winned bidder
      const winnerSecurityDeposit = await this.prismaService.payment.findFirst({
        where: {
          auctionId: joinedAuction.auctionId,
          userId: joinedAuction.userId,
          type: 'BIDDER_DEPOSIT',
        },
        include: {
          user: true,
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
      if (winnerSecurityDeposit) {
        try {
          let releaseSecurityDepositOfseller: any = false;
          if (sellerPaymentData.isWalletPayment) {
            // relese security deposit of seller if payment through wallet
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
                'Return Security deposit due to winner Not paid the full amount',
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
                'Return Security deposit of seller due to winner confirmed the delivery',
              amount: Number(sellerPaymentData.amount),
              auctionId: Number(sellerPaymentData.auctionId),
              balance:
                Number(lastWalletTransactionAlletre) -
                Number(sellerPaymentData.amount),
            };
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
          } else {
            console.log('seller payment data ', sellerPaymentData);
            // relese security deposit of seller if payment through stripe
            releaseSecurityDepositOfseller =
              await this.stripeService.cancelDepositPaymentIntent(
                sellerPaymentData.paymentIntentId,
              );
          }

          if (releaseSecurityDepositOfseller) {
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
            const amountToSellerWallet =
              (Number(winnerSecurityDeposit.amount) * compensationPercenatage) /
              100;

            // // calculating the amount that need add to the alletreWallet
            // const amountToAlletreWallet = Number(winnerSecurityDeposit.amount) - amountToSellerWallet

            //tranfering data for the copensation to the higherst bidder wallet.
            const walletData = {
              status: WalletStatus.DEPOSIT,
              transactionType: WalletTransactionType.By_AUCTION,
              description:
                'compensation Due to full payment deley by the winned bidder.',
              amount: amountToSellerWallet,
              auctionId: Number(joinedAuction.auctionId),
              balance: lastWalletTransactionBalance
                ? Number(lastWalletTransactionBalance) + amountToSellerWallet
                : amountToSellerWallet,
            };
            //tranfering data for the alletre fees

            const alletreWalletData = {
              status: WalletStatus.WITHDRAWAL,
              transactionType: WalletTransactionType.By_AUCTION,
              description:
                'compensation Due to full payment delay by the winned bidder.',
              amount: amountToSellerWallet,
              auctionId: Number(joinedAuction.auctionId),
              balance: Number(lastBalanceOfAlletre) + amountToSellerWallet,
            };

            await this.prismaService.$transaction(async (prisma) => {
              // Transfer to the highest bidder wallet
              await this.walletService.create(
                joinedAuction.auction.userId,
                walletData,
                prisma,
              );

              // Transfer to the alletre wallet
              await this.walletService.addToAlletreWallet(
                joinedAuction.userId,
                alletreWalletData,
                prisma,
              );

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
            //sendEmailtoSeller

            const emailBodyForSeller = {
              subject: '⚠️ Auction Closed: Bidder Failed to Pay',
              title: `Important Update About Your Auction`,
              Product_Name: sellerPaymentData.auction.product.title,
              img: sellerPaymentData.auction.product.images[0].imageLink,
              userName: `${sellerPaymentData.auction.user.userName}`,
              message1: ` 
            <p>We’re reaching out to inform you that the winning bidder for your auction ${
              sellerPaymentData.auction.product.title
            } did not complete the payment within the required timeframe. While we understand this may be disappointing, we’ve taken steps to ensure you’re protected.</p>
            <p><b>Here’s what happens next:</b></p>
            <ul>
              <li>Your Security Deposit: ${
                sellerPaymentData.auction.product.category
                  .sellerDepositFixedAmount
              } </li>
     <li>Compensation: ${
       Number(
         sellerPaymentData.auction.product.category.bidderDepositFixedAmount,
       ) * 0.5
     } (50% of the bidder’s security deposit)</li>


            </ul>
            <p>The compensation has been credited to your account and is available for use in future auctions.</p>
            <h3>What’s Next?</h3>
            <p>We encourage you to relist your item to attract new bidders and secure a successful sale.</p>
            `,
              message2: ` 
              <p>Thank you for using <b>Alletre</b>. We’re here to support you every step of the way and are confident your next auction will be a success!</p>
                        <p style="margin-bottom: 0;">Best regards,</p>
                        <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                        <p>Check out our Seller Tips to optimize your listing and attract more bidders!</p>`,
              Button_text: 'Create auction',
              Button_URL: ' https://www.alletre.com/',
            };
            //sendEmailtoBidder
            const auctionEndDate = new Date(
              sellerPaymentData.auction.expiryDate,
            );
            const formattedEndDate = auctionEndDate.toISOString().split('T')[0]; // Extract YYYY-MM-DD
            const formattedEndTime = auctionEndDate.toTimeString().slice(0, 5);
            const emailBodyForBidder = {
              subject: '⚠️ Auction Cancelled: Payment Not Completed',
              title: `Auction Cancelled - Payment Not Received`,
              Product_Name: sellerPaymentData.auction.product.title,
              img: sellerPaymentData.auction.product.images[0].imageLink,
              userName: `${sellerPaymentData.auction.bids[0].user}`,
              message1: ` 
            <p>We regret to inform you that your winning bid for ${sellerPaymentData.auction.product.title} has been cancelled. Unfortunately, we did not receive your payment within the required time frame.</p>
            <p>Auction Details:</p>
            <ul>
              <li>Title: ${sellerPaymentData.auction.product.title} </li>
              <li>Winning Bid: ${sellerPaymentData.auction.bids[0].amount}</li>
              <li>Payment Due By: ${formattedEndDate} & ${formattedEndTime}</li>
            </ul>
            <h3>Consequences:</h3>
            <p>Since payment was not completed on time:</p>
            <ul>
              <li>The auction has been cancelled.</li>
              <li>Your security deposit of ${sellerPaymentData.auction.acceptedAmount} has been confiscated.</li>
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
            const notificationMessageToSeller =` 
                                We are really sorry to say that, unfortunatly, the winner of your Auction of ${sellerPaymentData.auction.product.title}
                                (Model:${sellerPaymentData.auction.product.model}) has not paid the full amount by time. 
                                So we are giving you an amount as a compensation to your wallet and your security deposit has
                                been sent back to your bank account.`
            const notificationBodyToSeller = {
              status: 'ON_PENDING_PAYMENT_TIME_EXPIRED',
              userType: 'FOR_SELLER',
              usersId: sellerPaymentData.userId,
              message: notificationMessageToSeller,
              imageLink: sellerPaymentData.auction.product.images[0].imageLink,
              productTitle: sellerPaymentData.auction.product.title,
              auctionId: sellerPaymentData.auctionId,
            };
            const notificationMessageToBidder =`
             We are really sorry to say that, the time to pay the pending amount of Auction of ${sellerPaymentData.auction.product.title}
                        (Model:${sellerPaymentData.auction.product.model}) has been expired. Due to the delay of the payment you have lost
                        your security deposite`
            const notificationBodyToBidder = {
              status: 'ON_PENDING_PAYMENT_TIME_EXPIRED',
              userType: 'FOR_WINNER',
              usersId: winnerSecurityDeposit.userId,
              message: notificationMessageToBidder,
              imageLink: sellerPaymentData.auction.product.images[0].imageLink,
              productTitle: sellerPaymentData.auction.product.title,
              auctionId: sellerPaymentData.auctionId,
            };
            const createSellerNotificationData =
              await this.prismaService.notification.create({
                data: {
                  userId: sellerPaymentData.userId,
                  message: notificationBodyToSeller.message,
                  imageLink: notificationBodyToSeller.imageLink,
                  productTitle: notificationBodyToSeller.productTitle,
                  auctionId: sellerPaymentData.auctionId,
                },
              });
            const createWinnerNotificationData =
              await this.prismaService.notification.create({
                data: {
                  userId: winnerSecurityDeposit.userId,
                  message: notificationBodyToBidder.message,
                  imageLink: notificationBodyToBidder.imageLink,
                  productTitle: notificationBodyToBidder.productTitle,
                  auctionId: winnerSecurityDeposit.auctionId,
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
                sellerPaymentData.user.email,
                'token',
                EmailsType.OTHER,
                emailBodyForSeller,
              ),
              this.emailService.sendEmail(
                winnerSecurityDeposit.user.email,
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
            message: `This is a test message from alletre backend when error occur at markPendingBidderPaymentAuctionsExpired function 
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

  //Function to send email when the seller is refuse or has any issue to deliver the item.
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async _markPendingDelivery() {
    try {
      const pendingDeliveryAuction = await this.prismaService.auction.findMany({
        where: {
          status: 'SOLD',
          isItemSendForDelivery: false,
        },
        include: {
          user: true,
          product: { include: { images: true } },
          bids: {
            orderBy: { amount: 'desc' },
            include: {
              user: true,
            },
          },
        },
      });
      await Promise.all(
        pendingDeliveryAuction.map(async (auction) => {
          // Calculate expected delivery date
          const expectedDeliveryDate = new Date(auction.expiryDate);
          expectedDeliveryDate.setDate(
            expectedDeliveryDate.getDate() +
              auction.numOfDaysOfExpecetdDelivery,
          );
          const currentDate = new Date();

          // Check if the current date is greater than the expected delivery date
          if (currentDate > expectedDeliveryDate) {
            console.log('Sending email to seller, delivery is delayed.');
            // Email body for the seller
            const emailBodyForSeller = {
              subject: '🚚 Action Needed: Delivery Delay Notification',
              title: 'Delivery Delayed for Auction Purchase',
              Product_Name: auction.product.title,
              img: auction.product.images[0].imageLink,
              userName: `${auction.user}`,
              message1: ` 
            <p>We wanted to bring to your attention that the delivery of  ${auction.product.title} has been delayed.</p>
            <p>Auction Details:</p>
            <ul>
              <li>Title: ${auction.product.title} </li>
              <li>Winning Bid: ${auction.bids[0].amount}</li>
              <li>Winning Name: ${auction.bids[0].user}</li>
            </ul>
            <h3>What You Should Do Next</h3>
            <p>Please take immediate action to fulfill the delivery of this product and ensure the buyer receives their purchase promptly.</p>
                  `,
              message2: ` 
              <p>Thank you for your cooperation. If you have any questions or need assistance, feel free to reach out to us.</p>
                        <p style="margin-bottom: 0;">Best regards,</p>
                        <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                        <p>P.S. Timely delivery ensures a better experience for everyone. Let us know if there’s anything we can do to help!</p>`,
              Button_text: 'View Auction Details',
              Button_URL: ' https://www.alletre.com/',
            };
            await this.emailService.sendEmail(
              auction.user.email,
              'token',
              EmailsType.OTHER,
              emailBodyForSeller,
            );
            const notificationMessageToSeller =`
            It appears that the delivery of your product from the auction "${auction.product.title}"
                  (Model: ${auction.product.model}) has been delayed beyond the expected ${auction.numOfDaysOfExpecetdDelivery} days. 
                  Please take action to fulfill the delivery.`
            const deliveryDelayNotificationData =
              await this.prismaService.notification.create({
                data: {
                  userId: auction.userId,
                  message: notificationMessageToSeller,
                  imageLink: auction.product.images[0].imageLink,
                  productTitle: auction.product.title,
                  auctionId: auction.id,
                },
              });
            if (deliveryDelayNotificationData) {
              // Send notification to seller
              const sellerUserId = deliveryDelayNotificationData.userId;
              const notification = {
                status: 'ON_DELIVERY_DELAY',
                userType: 'FOR_SELLER',
                usersId: sellerUserId,
                message: deliveryDelayNotificationData.message,
                imageLink: deliveryDelayNotificationData.imageLink,
                productTitle: deliveryDelayNotificationData.productTitle,
                auctionId: deliveryDelayNotificationData.auctionId,
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
        }),
      );
    } catch (error) {
      console.log(error);
    }
  }
  //Function will run every minute to check the upcoming Pending payment by bidders and will send a warning email

  @Interval(60000)
  async _markUpcomingPendingPayment() {
    // Get auctions expiring within 24 hours
    const twentyFourHourPendingPaymentAuctions = await this.prismaService.joinedAuction.findMany({
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
          const formattedEndDate = auctionEndDate.toISOString().split('T')[0]; // Extract YYYY-MM-DD
          const formattedEndTime = auctionEndDate.toTimeString().slice(0, 5);
          const body = {
            subject: '⏳ Final Reminder: Complete Your Payment to Secure Your Win',
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
            Button_URL: ' https://www.alletre.com/alletre/profile/my-bids/pending',
          };
          
          // Send email
          await this.emailService.sendEmail(data.user.email, 'token', EmailsType.OTHER, body);
          
          // Update flag to indicate 24-hour warning sent
          await this.prismaService.joinedAuction.update({
            where: { id: data.id },
            data: { isWarningMessageSent24Hours: true },
          });
  
          // Create notification
          const pendingPaymentNotificationData = await this.prismaService.notification.create({
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
              await this.notificationService.sendNotificationToSpecificUsers(notification);
            } catch (error) {
              console.log('sendNotificationToSpecificUsers error', error);
            }
          }
        }),
      );
    }
  
    // Get auctions expiring within 1 hour
    const oneHourPendingPaymentAuctions = await this.prismaService.joinedAuction.findMany({
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
            Button_URL: ' https://www.alletre.com/alletre/profile/my-bids/pending',
          };
  
          // Send email
          await this.emailService.sendEmail(data.user.email, 'token', EmailsType.OTHER, body);
  
          // Update flag to indicate 1-hour warning sent
          await this.prismaService.joinedAuction.update({
            where: { id: data.id },
            data: { isWarningMessageSent1Hour: true },
          });
  
          // Create notification
          const pendingPaymentNotificationData = await this.prismaService.notification.create({
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
              await this.notificationService.sendNotificationToSpecificUsers(notification);
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
    console.log(' Start Expiration Schedular ');

    // Get expiredAuctions
    const auctionsToBeExpired = await this.prismaService.auction.findMany({
      where: {
        expiryDate: {
          lte: new Date(), // Filter auctions where expiryDate is less than or equal to the current date and time
        },
        status: AuctionStatus.ACTIVE,
      },
    });
    console.log(' [IMPORTANT] auctionsToBeExpired: ', auctionsToBeExpired);

    await Promise.all(
      auctionsToBeExpired?.map(async (auction) => {
        //get all bidders on an auction
        const BiddersForAuction = await this.prismaService.bids.findMany({
          where: { auctionId: auction.id },
          orderBy: { amount: 'desc' },
        });

        // Get user with highest bids for auctions

        if (BiddersForAuction.length) {
          const highestBidForAuction = BiddersForAuction[0];
          console.log('Max Bid = ', highestBidForAuction);

          // Get winner winnedBidderAuction
          const winnedBidderAuction =
            await this.prismaService.joinedAuction.findFirst({
              where: {
                userId: highestBidForAuction.userId,
                auctionId: highestBidForAuction.auctionId,
              },
            });

          // Update winner joinedAuction to winner and waiting for payment & Set all joined to LOST
          const today = new Date();
          const newDate = new Date(today.setDate(today.getDate() + 3));
          // const newDate = new Date(today.getTime() + 5 * 60 * 1000); // Adds 5 minutes

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

          console.log(
            '------->',
            isAcutionUpdated,
            isHighestBidder_J_auctionUpdated,
            isLostBidders_J_auctionUpdated,
          );

          const auctionEndDate = new Date(isAcutionUpdated.expiryDate);
          const formattedEndDate = auctionEndDate.toISOString().split('T')[0]; // Extract YYYY-MM-DD
          const formattedEndTime = auctionEndDate.toTimeString().slice(0, 5);

          if (isAcutionUpdated) {
            //sendEmailtoSeller
            console.log('isAuctionUpdated');
            const body = {
              subject: '🏆 Auction Closed: Congratulations, You Have a Winner!',
              title: ': Your Auction Has Ended Successfully!',
              Product_Name: isAcutionUpdated.product.title,
              img: isAcutionUpdated.product.images[0].imageLink,
              userName: `${isAcutionUpdated.user.userName}`,
              message1: ` 
            <p>Exciting news! Your auction for ${isAcutionUpdated.product.title} has officially ended, and we have a winner!</p>
                    <p>Here are the final details:</p>
            <ul>
            <li>•	Winning Bid Amount: ${isAcutionUpdated.bids[0].amount}</li>
              <li>•	Winner: ${isAcutionUpdated.bids[0].user} </li>
              <li>• Auction Ended On: ${formattedEndDate} & ${formattedEndTime} </li>
            </ul>
            <h3>What’s Next? </h3>
            <ul>
              <li>1. Contact the Winner: Our team Coordinate with [Winner’s Username] to finalize payment and delivery details.</li>
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
                ' https://www.alletre.com/alletre/home/${isAcutionUpdated.id}/details',
            };
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
                ': Your Winning Bid is Confirmed – Complete Your Purchase Now',
              Product_Name: isAcutionUpdated.product.title,
              img: isAcutionUpdated.product.images[0].imageLink,
              userName: `${isAcutionUpdated.bids[0].user}`,
              message1: ` 
                <p>Congratulations on winning the auction for ${isAcutionUpdated.product.title}! It’s time to complete the payment and finalize your purchase.</p>
                        <p>Auction Details:</p>
                <ul>
                  <li>•	Item: ${isAcutionUpdated.product.title}</li>
                  <li>•	Winning Bid: ${isAcutionUpdated.bids[0].amount}</li>
                  <li>•	Seller: ${isAcutionUpdated.user.userName}</li>
                  <li>•	Payment Due By:${PaymentEndDate}& ${formattedEndTime}</li>
                </ul>
                <h3>What’s Next? </h3>
                <p>1️⃣<b> Complete Payment:</b></p>
                <p>Secure your item by completing the payment now</p>`,
              message2: ` <p>2️⃣<b> Choose Delivery or Pickup:</b></p>
                <ul>
                  <li>•	<b>Delivery</b>: The item will be shipped to your address after payment. (additional shipping charges may apply).</li>
                  <li>•	<b>Pickup</b>: If you prefer, you can collect the item directly from the seller’s address. (Details will be provided after payment).</li>
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
                    userName: `${isAcutionUpdated.user.userName}`,
                    message1: ` 
                    <p>Thank you for participating in the auction for ${
                      isAcutionUpdated.product.title
                    }. While your bid was competitive, the auction has now ended, and unfortunately, you didn’t win this time. </p>
                            <p>Auction Summary:</p>
                    <ul>
                      <li>•	Item: ${isAcutionUpdated.product.title}</li>
                      <li>•	Your Highest Bid: [Your Bid Amount]:${
                        isAcutionUpdated.bids.find(
                          (bid) => bid.userId === isAcutionUpdated.user.id,
                        )?.amount
                      }</li>
                      <li>•	Winning Bid: ${isAcutionUpdated.bids[0].amount}</li>
                    </ul>
                    <h3>Don’t Give Up! </h3>
                    <p>There are many more exciting auctions waiting for you on [Website Name]. Check here for more exciting auctions:</p>
                    `,
                    message2: `<p>We appreciate your enthusiasm and look forward to seeing you succeed in your next auction. Keep bidding and keep winning!</p>
                                <p>Warm regards,</p>
                                <p>The <b>Alletre</b> Team </p>
                                <p>P.S. Have questions or need assistance? Contact us anytime.</p>`,
                    Button_text: 'Live Auctions',
                    Button_URL: ' https://www.alletre.com/alletre/',
                  };

                  await this.emailService.sendEmail(
                    data.user.email,
                    'token',
                    EmailsType.OTHER,
                    body,
                  );
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

          const winnedBidderPaymentData =
            await this.paymentService.getAuctionPaymentTransaction(
              winnedBidderAuction.userId,
              winnedBidderAuction.auctionId,
              PaymentType.BIDDER_DEPOSIT,
            );

          // Capture the S-D of the winning bidder (if money payed with wallet no need to capture again, it is already in the alletre wallet)
          if (
            !winnedBidderPaymentData.isWalletPayment &&
            winnedBidderPaymentData.paymentIntentId
          ) {
            try {
              const isSellerPaymentCaptured =
                await this.stripeService.captureDepositPaymentIntent(
                  winnedBidderPaymentData.paymentIntentId,
                );
              console.log(
                `Captured payment for winning bidder: ${winnedBidderAuction.userId}`,
              );
              //find the last transaction balane of the alletre
              const lastBalanceOfAlletre =
                await this.walletService.findLastTransactionOfAlletre();
              //tranfering data for the alletre fees
              const alletreWalletData = {
                status: WalletStatus.DEPOSIT,
                transactionType: WalletTransactionType.By_AUCTION,
                description: `Captured payment for winning bidder`,
                amount: Number(isSellerPaymentCaptured.amount) / 100, // Convert from cents to dollars
                auctionId: Number(winnedBidderPaymentData.auctionId),
                balance: lastBalanceOfAlletre
                  ? Number(lastBalanceOfAlletre) +
                    Number(isSellerPaymentCaptured.amount) / 100
                  : Number(isSellerPaymentCaptured.amount) / 100, // Convert from cents to dollars
              };
              await this.walletService.addToAlletreWallet(
                winnedBidderPaymentData.userId,
                alletreWalletData,
              );
            } catch (error) {
              console.error(
                'Error capturing payment for winning bidder:',
                error,
              );
            }
          }

          // Cancel payment authorizations for losing bidders
          const losingBidders = await this.prismaService.joinedAuction.findMany(
            {
              where: {
                auctionId: auction.id,
                id: { not: winnedBidderAuction.id },
                status: JoinedAuctionStatus.LOST,
              },
            },
          );

          await Promise.all(
            losingBidders.map(async (loser) => {
              try {
                const lostBidderPaymentData =
                  await this.paymentService.getAuctionPaymentTransaction(
                    loser.userId,
                    loser.auctionId,
                    PaymentType.BIDDER_DEPOSIT,
                  );
                console.log(
                  'lostBidderPaymentData ===>',
                  lostBidderPaymentData,
                );
                if (!lostBidderPaymentData.isWalletPayment) {
                  await this.stripeService.cancelDepositPaymentIntent(
                    lostBidderPaymentData.paymentIntentId,
                  );
                } else {
                  //logic to transfer to the wallet

                  //finding the last transaction balance of the Seller
                  const lastWalletTransactionBalanceOfBidder =
                    await this.walletService.findLastTransaction(loser.userId);
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
                      Number(lastBalanceOfAlletre) -
                      Number(lostBidderPaymentData.amount),
                  };
                  await this.walletService.create(
                    lostBidderPaymentData.userId,
                    BidderWalletData,
                  );
                  //crete new transaction in alletre wallet
                  await this.walletService.addToAlletreWallet(
                    lostBidderPaymentData.userId,
                    alletreWalletData,
                  );
                }
                console.log(
                  `Canceled payment for losing bidder: ${loser.userId}`,
                );
              } catch (error) {
                console.error(
                  'Error canceling payment for losing bidder:',
                  error,
                );
              }
            }),
          );

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
            let isSendBackS_D: any;
            if (!sellerPaymentData.isWalletPayment) {
              console.log('canceldeposit*******');
              isSendBackS_D =
                await this.stripeService.cancelDepositPaymentIntent(
                  sellerPaymentData.paymentIntentId,
                );
            } else {
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
            if (isSendBackS_D) {
              const body = {
                subject: 'Your Auction Has Ended – Let’s Try Again!',
                title: `Your Auction for ${auctionExpairyData.product.title} Has Ended`,
                Product_Name: auctionExpairyData.product.title,
                img: auctionExpairyData.product.images[0].imageLink,
                userName: `${auctionExpairyData.user.userName}`,
                message1: ` 
                <p>We noticed your auction for ${auctionExpairyData.product.title} has ended without any bids. While this can happen occasionally, don’t worry – we’re here to help!</p>
                <p>Good news: your security deposit of ${sellerPaymentData.amount} will be refunded to your account shortly.</p>
                <p>Here’s what you can do to improve your chances next time:</p>
                <ul>
                  <li>•	Adjust Your Starting Bid: A lower starting bid might attract more interest.</li>
                  <li>•	Enhance Your Listing: Add more photos or improve your item description.</li>
                  <li>•	Promote Your Auction: Share your listing on social media to reach a wider audience.</li>
                  <li>•	Refine Your Description: A detailed and appealing description can make a big difference.</li>
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
      }),
    );
  }
}
