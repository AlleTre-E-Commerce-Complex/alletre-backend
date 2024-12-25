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
import { auctionCreationMessage } from 'src/notificatons/NotificationsContents/auctionCreationMessage';
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
        await this.emailBatchService.sendBulkEmails(updatedAuction);
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
          auction: { include: { product: { include: { images: true } } } },
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
              subject: 'Pending Payment time Expired',
              title: 'Pending Payment time Expired',
              Product_Name: sellerPaymentData.auction.product.title,
              img: sellerPaymentData.auction.product.images[0].imageLink,
              message: ` Hi, ${sellerPaymentData.user.userName}, 
                                 We are really sorry to say that, unfortunatly, the winner of your Auction of ${sellerPaymentData.auction.product.title}
                                (Model:${sellerPaymentData.auction.product.model}) has not paid the full amount by time. 
                                So we are giving you an amount as a compensation to your wallet and your security deposit has
                                been sent back to your bank account. `,
              Button_text: 'Click here to create another Auction',
              Button_URL: process.env.FRONT_URL,
            };
            //sendEmailtoBidder
            const emailBodyForBidder = {
              subject: 'Pending Payment time Expired',
              title: 'Pending Payment time Expired',
              Product_Name: sellerPaymentData.auction.product.title,
              img: sellerPaymentData.auction.product.images[0].imageLink,
              message: ` Hi, ${winnerSecurityDeposit.user.userName}, 
                        We are really sorry to say that, the time to pay the pending amount of Auction of ${sellerPaymentData.auction.product.title}
                        (Model:${sellerPaymentData.auction.product.model}) has been expired. Due to the delay of the payment you have lost
                        your security deposite. 
                        If you would like to participate on another auction, Please click the button below. Thank you. `,
              Button_text: 'Click here',
              Button_URL: process.env.FRONT_URL,
            };
            const notificationBodyToSeller = {
              status: 'ON_PENDING_PAYMENT_TIME_EXPIRED',
              userType: 'FOR_SELLER',
              usersId: sellerPaymentData.userId,
              message: emailBodyForSeller.message,
              imageLink: sellerPaymentData.auction.product.images[0].imageLink,
              productTitle: sellerPaymentData.auction.product.title,
              auctionId: sellerPaymentData.auctionId,
            };
            const notificationBodyToBidder = {
              status: 'ON_PENDING_PAYMENT_TIME_EXPIRED',
              userType: 'FOR_WINNER',
              usersId: winnerSecurityDeposit.userId,
              message: emailBodyForBidder.message,
              imageLink: sellerPaymentData.auction.product.images[0].imageLink,
              productTitle: sellerPaymentData.auction.product.title,
              auctionId: sellerPaymentData.auctionId,
            };
            const createSellerNotificationData =
              await this.prismaService.notification.create({
                data: {
                  userId: sellerPaymentData.userId,
                  message: emailBodyForSeller.message,
                  imageLink: notificationBodyToSeller.imageLink,
                  productTitle: notificationBodyToSeller.productTitle,
                  auctionId: sellerPaymentData.auctionId,
                },
              });
            const createWinnerNotificationData =
              await this.prismaService.notification.create({
                data: {
                  userId: winnerSecurityDeposit.userId,
                  message: emailBodyForBidder.message,
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
        include: { user: true, product: { include: { images: true } } },
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
              subject: 'Delivery Delay Notification',
              title: 'Auction Delivery Delayed',
              Product_Name: auction.product.title,
              img: auction.product.images[0].imageLink,
              message: `Hi, ${auction.user.userName}, 
                  It appears that the delivery of your product from the auction "${auction.product.title}"
                  (Model: ${auction.product.model}) has been delayed beyond the expected ${auction.numOfDaysOfExpecetdDelivery} days. 
                  Please take action to fulfill the delivery.`,
              Button_text: 'Check Auction',
              Button_URL: process.env.FRONT_URL,
            };
            await this.emailService.sendEmail(
              auction.user.email,
              'token',
              EmailsType.OTHER,
              emailBodyForSeller,
            );
            const deliveryDelayNotificationData =
              await this.prismaService.notification.create({
                data: {
                  userId: auction.userId,
                  message: emailBodyForSeller.message,
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
    // Get pending payment auctions
    const pendingPaymentAuction =
      await this.prismaService.joinedAuction.findMany({
        where: {
          paymentExpiryDate: {
            gte: new Date(), // Expiration date is greater than or equal to the current time (i.e., in the future)
            lte: new Date(new Date().getTime() + 2 * 60 * 60 * 1000), // Expiring within the next two hours
            // lte: new Date(new Date().getTime() + 10 * 60 * 1000), // Expiring within the next 10 minutes
          },
          status: JoinedAuctionStatus.PENDING_PAYMENT,
          isWarningMessageSent: false,
        },
        include: {
          auction: { include: { product: { include: { images: true } } } },
          user: true,
        },
      });

    if (pendingPaymentAuction.length) {
      await Promise.all(
        pendingPaymentAuction.map(async (data) => {
          const body = {
            subject: 'Warning.. Pending Payment is going to be expired soon',
            title: 'Pending Payment is going to be expired soon',
            Product_Name: data.auction.product.title,
            img: data.auction.product.images[0].imageLink,
            message: ` Hi, ${data.user.userName}, 
                      Your pending payment on your Auction of ${data.auction.product.title}
                     (Model:${data.auction.product.model}) is going to be expired soon.
                      Notice : If you are refuce to pay, you will lose the security deposite. Thank you. `,
            Button_text: 'Click here to continue your payment',
            Button_URL: process.env.FRONT_URL,
          };
          await this.emailService.sendEmail(
            data.user.email,
            'token',
            EmailsType.OTHER,
            body,
          );
          await this.prismaService.joinedAuction.update({
            where: { id: data.id },
            data: { isWarningMessageSent: true },
          });
          //create notificaion to winner
          const pendingPaymentNotificationData =
            await this.prismaService.notification.create({
              data: {
                userId: data.userId,
                message: body.message,
                imageLink: data.auction.product.images[0].imageLink,
                productTitle: data.auction.product.title,
                auctionId: data.auctionId,
              },
            });
          if (pendingPaymentNotificationData) {
            // Send notification to winner
            const notification = {
              status: 'ON_PENDING_PAYMENT_OF_WINNER',
              userType: 'FOR_WINNER',
              usersId: data.userId,
              message: pendingPaymentNotificationData.message,
              imageLink: pendingPaymentNotificationData.imageLink,
              productTitle: pendingPaymentNotificationData.productTitle,
              auctionId: pendingPaymentNotificationData.auctionId,
            };
            try {
              this.notificationService.sendNotificationToSpecificUsers(
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
          // const newDate = new Date(today.setDate(today.getDate() + 3));
          const newDate = new Date(today.getTime() + 5 * 60 * 1000); // Adds 5 minutes

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
              title: `: Your Auction Has Ended Successfully!`,
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
          if (isHighestBidder_J_auctionUpdated) {
            //sendEmailToHighestBidder
            const body = {
              subject: 'Auction Expired',
              title: 'Your won the auction',
              Product_Name: isAcutionUpdated.product.title,
              img: isAcutionUpdated.product.images[0].imageLink,
              message: ` Hi, ${isHighestBidder_J_auctionUpdated.user.userName}, 
                      Congratulations.. You have won the Auction of ${isAcutionUpdated.product.title}
                      (Model:${isAcutionUpdated.product.model}). Please pay the full amount within 48 hours.
                      Otherwise, you will lose you security deposit.
                      If you would like to do another bid, Please click the button below. Thank you. `,
              Button_text: 'Pay the full amount',
              Button_URL: process.env.FRONT_URL,
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
                    subject: 'Auction Expired',
                    title: 'Your acution is Expired',
                    Product_Name: isAcutionUpdated.product.title,
                    img: isAcutionUpdated.product.images[0].imageLink,
                    message: ` Hi, ${data.user.userName}, 
                        We are really sorry to say that you have lost the Auction of ${isAcutionUpdated.product.title}
                       (Model:${isAcutionUpdated.product.model}). Thank you for choosing the Alletre for your Auction.
                       If you would like to do another Bid, Please click the button below. Thank you. `,
                    Button_text: 'Click here to create another Auction',
                    Button_URL: process.env.FRONT_URL,
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
                            <p>Best regards,</p>
                            <p>The <b>Alletre</b> Team </p>
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
