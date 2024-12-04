import { Injectable, Logger } from '@nestjs/common';
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
        include: { product: { include: { images: true } } },
      });
      if (updatedAuction) {
        await this.emailBatchService.sendBulkEmails(updatedAuction);
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
              );

              // Transfer to the alletre wallet
              await this.walletService.addToAlletreWallet(
                joinedAuction.userId,
                alletreWalletData,
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
                                been sent back to your bank account. 
                                If you would like to do another auction, Please click the button below. Thank you. `,
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
                      Notice : If you are refuce to pay, you will lose the security deposite.
                     If you would like to do another auction, Please click the button below. Thank you. `,
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
          // const newDate = new Date(today.getTime() + 10 * 60 * 1000); // Adds 10 minutes

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
              include: { user: true, product: { include: { images: true } } },
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

          if (isAcutionUpdated) {
            //sendEmailtoSeller
            const body = {
              subject: 'Auction Expired',
              title: 'Your acution is Expired',
              Product_Name: isAcutionUpdated.product.title,
              img: isAcutionUpdated.product.images[0].imageLink,
              message: ` Hi, ${isAcutionUpdated.user.userName}, 
                      your Auction of ${isAcutionUpdated.product.title}
                     (Model:${isAcutionUpdated.product.model}) has been expired. Please wait until the winner pay the full amount.
                     Once the winner pay the full amount, you need to delevery the product with in two days
                     If you would like to do another auction, Please click the button below. Thank you. `,
              Button_text: 'Click here to create another Auction',
              Button_URL: process.env.FRONT_URL,
            };
            await this.emailService.sendEmail(
              isAcutionUpdated.user.email,
              'token',
              EmailsType.OTHER,
              body,
            );
          }
          if (isHighestBidder_J_auctionUpdated) {
            //sendEmailToHighestBidder
            const body = {
              subject: 'Auction Expired',
              title: 'Your acution is Expired',
              Product_Name: isAcutionUpdated.product.title,
              img: isAcutionUpdated.product.images[0].imageLink,
              message: ` Hi, ${isHighestBidder_J_auctionUpdated.user.userName}, 
                      Congratulations.. You have won the Auction of ${isAcutionUpdated.product.title}
                      (Model:${isAcutionUpdated.product.model}). Please pay the full amount within 48 hours.
                      Otherwise, you will lose you security deposit.
                      If you would like to do another bid, Please click the button below. Thank you. `,
              Button_text: 'Click here to create another Auction',
              Button_URL: process.env.FRONT_URL,
            };
            await this.emailService.sendEmail(
              isHighestBidder_J_auctionUpdated.user.email,
              'token',
              EmailsType.OTHER,
              body,
            );
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
                       (Model:${isAcutionUpdated.product.model}). Thank you for choosing the Alle Tre for your Auction.
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
                subject: 'Auction Expired',
                title: 'Your Auction has been expired',
                Product_Name: auctionExpairyData.product.title,
                img: auctionExpairyData.product.images[0].imageLink,
                message: ` Hi ${auctionExpairyData.user.userName}, Your Acution of ${auctionExpairyData.product.title}
                     (Model:${auctionExpairyData.product.model}) has been expired. 
                     Your Security Deposit has been sent back to you account. 
                     If you would like to do another auction, Please click the button below. Thank you. `,
                Button_text: 'Click here to create another Auction',
                Button_URL: process.env.FRONT_URL,
              };
              await this.emailService.sendEmail(
                auctionExpairyData.user.email,
                'token',
                EmailsType.OTHER,
                body,
              );
            }
          }
        }
      }),
    );
  }
}
