import {
  Injectable,
  InternalServerErrorException,
  MethodNotAllowedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  ArbonStatus,
  Auction,
  AuctionStatus,
  AuctionType,
  DurationUnits,
  JoinedAuctionStatus,
  PaymentStatus,
  PaymentType,
  Prisma,
  User,
  WalletStatus,
  WalletTransactionType,
} from '@prisma/client';
import { EmailsType } from 'src/auth/enums/emails-type.enum';
import { StripeService } from 'src/common/services/stripe.service';
import { EmailBatchService } from 'src/emails/email-batch.service';
import { EmailSerivce } from 'src/emails/email.service';
import { generateInvoicePDF } from 'src/emails/invoice';
import { PrismaService } from 'src/prisma/prisma.service';
import { WalletService } from 'src/wallet/wallet.service';
import { NotificationsService } from 'src/notificatons/notifications.service';
// import { auctionCreationMessage } from 'src/notificatons/NotificationsContents/auctionCreationMessage';
import { AuctionWebSocketGateway } from 'src/auction/gateway/auction.gateway';
import { AdminWebSocketGateway } from 'src/auction/gateway/admin.gateway';
import { timeout } from 'rxjs';
import { WhatsAppService } from 'src/whatsapp/whatsapp.service';
import { MethodNotAllowedResponse } from 'src/common/errors';
import { BidsWebSocketGateway } from 'src/auction/gateway/bids.gateway';
import { generateArbonContractPDF } from 'src/emails/arbon-contract';
import { FirebaseService } from 'src/firebase/firebase.service';
@Injectable()
export class PaymentsService {
  constructor(
    private readonly stripeService: StripeService,
    private readonly prismaService: PrismaService,
    private readonly emailService: EmailSerivce,
    private readonly walletService: WalletService,
    private readonly emailBatchService: EmailBatchService,
    private readonly notificationsService: NotificationsService,
    private readonly auctionGateway: AuctionWebSocketGateway,
    private readonly adminGateway: AdminWebSocketGateway,
    private readonly whatsappService: WhatsAppService,
    private bidsWebSocketGateway: BidsWebSocketGateway,
    private readonly firebaseService: FirebaseService,
  ) {}

  async walletPayDepositBySeller(
    user: User,
    auctionId: number,
    // currency:number,
    amount: number,
  ) {
    try {
      // Check if seller has already pay a deposit for auction
      const userPaymentForAuction = await this.getAuctionPaymentTransaction(
        user.id,
        auctionId,
        PaymentType.SELLER_DEPOSIT,
      );
      if (userPaymentForAuction) {
        // Check startDate for auction
        const auction = await this.prismaService.auction.findFirst({
          where: { id: userPaymentForAuction.auctionId },
        });
        if (
          auction.type === AuctionType.SCHEDULED &&
          auction.startDate < new Date()
        ) {
          throw new MethodNotAllowedException(
            'Auction Start Date Now Not Valid For Publishing.',
          );
        }

        if (userPaymentForAuction.isWalletPayment) {
          // throw new MethodNotAllowedException('already paid');
          throw new MethodNotAllowedResponse({
            ar: 'تم الدفع بالفعل',
            en: 'Already paid',
          });
        }
        //check previous payment attempt thorugh stripe or not
        if (userPaymentForAuction.paymentIntentId) {
          // Retrieve PaymentIntent and clientSecret for clientSide
          const paymentIntent = await this.stripeService.retrievePaymentIntent(
            userPaymentForAuction.paymentIntentId,
          );

          if (
            paymentIntent.status === 'succeeded' ||
            paymentIntent.status === 'requires_capture'
          ) {
            throw new MethodNotAllowedResponse({
              ar: 'تم الدفع بالفعل',
              en: 'Already paid by stripe',
            });
          }
          // throw new MethodNotAllowedException(
          //   'Wallet payment is not available for this auction. Please select an online payment method to proceed.',
          // );
          return {
            paymentIntentId: userPaymentForAuction.paymentIntentId,
            message:
              'Wallet payment is not available for this auction. Please select an online payment method to proceed.',
          };
        }

        return userPaymentForAuction;
      }

      //finding the last transaction balance of the Seller
      const lastWalletTransactionBalanceOfSeller =
        await this.walletService.findLastTransaction(user.id);
      //finding the last transaction balance of the alletreWallet
      const lastBalanceOfAlletre =
        await this.walletService.findLastTransactionOfAlletre();
      if (Number(lastWalletTransactionBalanceOfSeller) < amount) {
        throw new MethodNotAllowedException('Sorry, Insufficient Balance.');
      }
      //wallet data for withdraw money from seller wallet

      const SellerWalletData = {
        status: WalletStatus.WITHDRAWAL,
        transactionType: WalletTransactionType.By_AUCTION,
        description: `Security deposit for publishing the new auction`,
        amount: amount,
        auctionId: Number(auctionId),
        balance: Number(lastWalletTransactionBalanceOfSeller) - amount,
      };
      // wallet data for deposit to alletre wallet

      const alletreWalletData = {
        status: WalletStatus.DEPOSIT,
        transactionType: WalletTransactionType.By_AUCTION,
        description: `Seller security deposit for publishing new auction `,
        amount: amount,
        auctionId: Number(auctionId),
        balance: lastBalanceOfAlletre
          ? Number(lastBalanceOfAlletre) + amount
          : amount,
      };

      const { paymentData } = await this.prismaService.$transaction(
        async (prisma) => {
          const paymentData = await prisma.payment.create({
            data: {
              userId: user.id,
              auctionId: auctionId,
              amount: amount,
              type: PaymentType.SELLER_DEPOSIT,
              isWalletPayment: true,
              status: 'SUCCESS',
            },
            include: {
              auction: {
                include: { product: { include: { images: true } } },
              },
            },
          });
          return { paymentData };
        },
      );

      if (paymentData) {
        //checking again the wallet balance to avoid issues
        const lastWalletTransactionBalanceOfSeller =
          await this.walletService.findLastTransaction(user.id);
        if (Number(lastWalletTransactionBalanceOfSeller) < amount) {
          throw new MethodNotAllowedException('Sorry, Insufficient Balance.');
        }
        //crete new transaction in seller wallet
        const sellerWallet = await this.walletService.create(
          user.id,
          SellerWalletData,
        );
        //crete new transaction in alletre wallet
        const alletreWallet = await this.walletService.addToAlletreWallet(
          user.id,
          alletreWalletData,
        );
        // create new payment database
        if (!sellerWallet || !alletreWallet) {
          throw new InternalServerErrorException(
            'Failed to process wallet payment',
          );
        }
        if (paymentData.auction.status !== 'ACTIVE') {
          await this.publishAuction(auctionId, user.email);
        }
        if (paymentData.auction.type !== 'SCHEDULED') {
          const usersId = await this.notificationsService.getAllRegisteredUsers(
            user.id,
          );
          const auction = paymentData.auction;
          await this.prismaService.notification.create({
            data: {
              userId: user.id,
              message:
                'Congratulations! Your auction has been published successfully.',
              imageLink: auction.product.images[0].imageLink,
              productTitle: auction.product.title,
              auctionId: paymentData.auctionId,
            },
          });
          const message = 'New Auction has been published.';
          const imageLink = auction.product.images[0].imageLink;
          const productTitle = auction.product.title;
          await this.notificationsService.sendNotifications(
            usersId,
            message,
            imageLink,
            productTitle,
            paymentData.auctionId,
          );
        }
      } else {
        console.error('Payment data not created when walletPayDepositBySeller');
        throw new InternalServerErrorException(
          'Failed to process wallet payment',
        );
      }
      return paymentData;
    } catch (error) {
      console.log('wallet pay deposit by seller error :', error);
      if (error.message) {
        throw new InternalServerErrorException(error.response.message);
      } else {
        throw new InternalServerErrorException(
          'Failed to process wallet payment',
        );
      }
    }
  }
  async payDepositBySeller(
    user: User,
    auctionId: number,
    currency: string,
    amount: number,
  ) {
    try {
      console.log('online payment');
      // Create SripeCustomer if has no account
      let stripeCustomerId: string = user?.stripeId || '';
      if (!user?.stripeId) {
        stripeCustomerId = await this.stripeService.createCustomer(
          user.email,
          user.userName,
        );

        // Add to user stripeCustomerId
        await this.prismaService.user.update({
          where: { id: user.id },
          data: { stripeId: stripeCustomerId },
        });
      }

      // Check if seller has already pay a deposit for auction
      const userPaymentForAuction = await this.getAuctionPaymentTransaction(
        user.id,
        auctionId,
        PaymentType.SELLER_DEPOSIT,
      );
      if (userPaymentForAuction) {
        console.log('***123', userPaymentForAuction);
        // Check startDate for auction
        const auction = await this.prismaService.auction.findFirst({
          where: { id: userPaymentForAuction.auctionId },
        });
        if (
          auction.type === AuctionType.SCHEDULED &&
          auction.startDate < new Date()
        ) {
          throw new MethodNotAllowedException(
            'Auction Start Date Now Not Valid For Publishing.',
          );
        }

        if (userPaymentForAuction.isWalletPayment) {
          // throw new MethodNotAllowedException('already paid');
          throw new MethodNotAllowedResponse({
            ar: 'تم الدفع بالفعل',
            en: 'Already paid by wallet',
          });
        }
        // Retrieve PaymentIntent and clientSecret for clientSide
        const paymentIntent = await this.stripeService.retrievePaymentIntent(
          userPaymentForAuction.paymentIntentId,
        );

        if (
          paymentIntent.status === 'succeeded' ||
          paymentIntent.status === 'requires_capture'
        ) {
          throw new MethodNotAllowedResponse({
            ar: 'تم الدفع بالفعل',
            en: 'Already paid',
          });
        }
        return {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        };
      }
      console.log('stripeCustomerId :', stripeCustomerId);
      // const { clientSecret, paymentIntentId } =
      //   await this.stripeService.createDepositPaymentIntent(
      //     stripeCustomerId,
      //     amount,
      //     currency,
      //   );

      // it will capture the deposite directly
      const { clientSecret, paymentIntentId } =
        await this.stripeService.createPaymentIntent(
          stripeCustomerId,
          amount,
          currency,
        );

      //TODO:  Add currency in payment model
      await this.prismaService.payment.create({
        data: {
          userId: user.id,
          auctionId: auctionId,
          amount: amount,
          paymentIntentId: paymentIntentId,
          type: PaymentType.SELLER_DEPOSIT,
        },
      });
      return { clientSecret, paymentIntentId };
    } catch (error) {
      console.log('stripe pay deposit by seller error :', error);
      if (error.message) {
        throw new InternalServerErrorException(error.response.message);
      } else {
        throw new InternalServerErrorException(
          'Failed to process stripe payment',
        );
      }
    }
  }

  async walletPayDepositByBidder(
    user: User,
    auctionId: number,
    // currency: string,
    amount: number,
    bidAmount: number,
  ) {
    try {
      console.log('test of wallet pay of bidder deposite 1');
      // Check if bidder has already pay deposit for auction
      const bidderPaymentForAuction = await this.getAuctionPaymentTransaction(
        user.id,
        auctionId,
        PaymentType.BIDDER_DEPOSIT,
      );
      if (bidderPaymentForAuction) {
        console.log(
          'pay deposite by bidder (is already paid ?)===>',
          bidderPaymentForAuction,
        );
        console.log('test of wallet pay of bidder deposite 2');
        if (bidderPaymentForAuction.isWalletPayment) {
          throw new MethodNotAllowedException('already paid');
        }

        //check previous payment attempt thorugh stripe or not
        // if (bidderPaymentForAuction.paymentIntentId) {
        //   throw new MethodNotAllowedException(
        //     'Wallet payment is not available for this auction. Please select an online payment method to proceed.',
        //   );
        // }
        // return bidderPaymentForAuction;
      }
      //finding the last transaction balance of the bidder
      const lastWalletTransactionBalanceOfBidder =
        await this.walletService.findLastTransaction(user.id);
      //finding the last transaction balance of the alletreWallet
      const lastBalanceOfAlletre =
        await this.walletService.findLastTransactionOfAlletre();

      const bidderBalance = Number(lastWalletTransactionBalanceOfBidder) || 0;

      if (bidderBalance < amount) {
        throw new MethodNotAllowedException('Sorry, Insufficient Balance.');
      }

      //wallet data for withdraw money from bidder wallet

      const BidderWalletData = {
        status: WalletStatus.WITHDRAWAL,
        transactionType: WalletTransactionType.By_AUCTION,
        description: `Security deposit for for participating with an auction`,
        amount: amount,
        auctionId: Number(auctionId),
        balance: bidderBalance - amount,
      };
      // wallet data for deposit to alletre wallet

      const alletreWalletData = {
        status: WalletStatus.DEPOSIT,
        transactionType: WalletTransactionType.By_AUCTION,
        description: `Security deposit for for participating with an auction`,
        amount: amount,
        auctionId: Number(auctionId),
        balance: lastBalanceOfAlletre
          ? Number(lastBalanceOfAlletre) + amount
          : amount,
      };

      const { paymentData } = await this.prismaService.$transaction(
        async (prisma) => {
          try {
            console.log('test of wallet pay of bidder deposite 3');

            // Check if user already joined the auction
            const existingJoinedAuction =
              await this.prismaService.joinedAuction.findFirst({
                where: {
                  userId: user.id,
                  auctionId: auctionId,
                },
              });
            // Join user to auction
            if (!existingJoinedAuction) {
              await prisma.joinedAuction.create({
                data: {
                  userId: user.id,
                  auctionId: auctionId,
                },
              });
            }
            // await prisma.joinedAuction.create({
            //   data: {
            //     userId: user.id,
            //     auctionId: auctionId,
            //   },
            // });
            console.log('bidAmount :', bidAmount);
            // Create bid for user
            await prisma.bids.create({
              data: {
                userId: user.id,
                auctionId: auctionId,
                amount: bidAmount,
              },
            });
            // create new payment database
            const paymentData = await prisma.payment.create({
              data: {
                userId: user.id,
                auctionId: auctionId,
                amount: amount,
                type: PaymentType.BIDDER_DEPOSIT,
                isWalletPayment: true,
                status: 'SUCCESS',
              },
              include: {
                auction: {
                  include: {
                    user: true,
                    bids: {
                      include: { user: true },
                      orderBy: { amount: 'desc' },
                    },
                    product: { include: { images: true, category: true } },
                    Payment: { where: { type: 'SELLER_DEPOSIT' } },
                  },
                },
                user: true,
              },
            });
            const sellerPayment = paymentData.auction.Payment;
            if (
              paymentData.auction.product.categoryId === 4 &&
              Number(paymentData.auction.startBidAmount) < 5000 &&
              bidAmount >= 5000 &&
              sellerPayment.length === 0
            ) {
              this.notieceTheSellerToCompleteThePayment(
                paymentData.auction.user,
                paymentData.auction,
              );
            }
            return { paymentData };
          } catch (error) {
            console.log(
              'wallet pay deposit error at prisma.$transaction() :',
              error,
            );
            throw new InternalServerErrorException(
              'Failed to process wallet payment for bidder deoposit',
            );
          }
        },
        {
          timeout: 10000,
        },
      );
      if (paymentData) {
        //checking again the wallet balance to avoid issues
        const lastWalletTransactionBalanceOfBidder =
          await this.walletService.findLastTransaction(user.id);
        if (Number(lastWalletTransactionBalanceOfBidder) < amount) {
          throw new MethodNotAllowedException('Sorry, Insufficient Balance.');
        }
        //crete new transaction in bidder wallet
        const sellerWallet = await this.walletService.create(
          user.id,
          BidderWalletData,
        );
        //crete new transaction in alletre wallet
        const alletreWallet = await this.walletService.addToAlletreWallet(
          user.id,
          alletreWalletData,
        );

        // create new payment database
        if (!sellerWallet || !alletreWallet) {
          throw new InternalServerErrorException(
            'Failed to process wallet payment',
          );
        }

        //send email to seller and last bidder
        const joinedBidders = await this.prismaService.bids.findMany({
          where: {
            auctionId: auctionId,
          },
          include: {
            user: true,
            auction: {
              include: {
                user: true,
                bids: {
                  include: { user: true },
                  orderBy: { amount: 'desc' },
                },
                product: { include: { images: true, category: true } },
              },
            },
          },
          orderBy: {
            id: 'desc',
          },
        });
        const auctionEndDate = new Date(paymentData.auction.expiryDate);
        const formattedEndDate = auctionEndDate.toISOString().split('T')[0];
        const formattedEndTime = auctionEndDate.toTimeString().slice(0, 5);
        const emailBodyToSeller = {
          subject: '🎉 Exciting News: Your Auction Just Got Its First Bid!',
          title: 'Your Auction is Officially in Motion!',
          Product_Name: paymentData.auction.product.title,
          img: paymentData.auction.product.images[0].imageLink,
          userName: `${paymentData.auction.user.userName}`,
          message1: ` 
                  <p>Congratulations! Your auction ${
                    paymentData.auction.product.title
                  } has received its first bid! This is an exciting milestone, and the competition has officially begun.</p>
                  <p>Here’s the latest update:</p>
                  <ul>
                  <li>First Bid Amount: ${
                    joinedBidders[joinedBidders.length - 1].amount
                  }</li>
                  <li>Bidder’s Username: ${
                    joinedBidders[joinedBidders.length - 1].user.userName
                  } </li>
                    <li>Auction Ends: ${formattedEndDate} & ${formattedEndTime} </li>
                  </ul>
                     <p>This is just the beginning—more bidders could be on their way!<p>       
                    <h3>What can you do now?</h3>
                      <ul>
                  <li>Share your auction to attract even more bids.</li>
                  <li>Keep an eye on the activity to stay informed about the progress.</li>
                  </ul>
                  `,
          message2: ` 
                               <p>Thank you for choosing <b>Alletre</b>. We can’t wait to see how this unfolds!</p>
                  
             
                               <p style="margin-bottom: 0;">Good luck,</p>
                              <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                              <p>P.S. Stay tuned for more updates as your auction gains momentum.</p>`,
          Button_text: 'View My Auction ',
          Button_URL: `https://www.alletre.com/alletre/home/${paymentData.auction.id}/details`,
        };

        const emailBodyToSecondLastBidder = {
          subject: 'You have been outbid! 🔥 Don’t Let This Slip Away!',
          title: 'Your Bid Just Got Beaten!',
          Product_Name: paymentData.auction.product.title,
          img: paymentData.auction.product.images[0].imageLink,
          userName: `${joinedBidders[1]?.user.userName}`,
          message1: ` 
                  <p>Exciting things are happening on ${
                    paymentData.auction.product.title
                  }! Unfortunately, someone has just placed a higher bid, and you're no longer in the lead.</p>
                  <p>Here’s the current standing:</p>
                  <ul>
                  <li> Current Highest Bid: ${
                    joinedBidders.length > 1
                      ? joinedBidders[0].amount
                      : 'No bids yet'
                  }</li>
                  <li>Your Last Bid: ${joinedBidders[1]?.amount}  </li>
                
                  </ul>
                     <p>Don’t miss your chance to claim this one-of-a-kind ${
                       paymentData.auction.product.title
                     } . The clock is ticking, and every second counts!</p>       
                     <p><b>Reclaim Your Spot as the Top Bidder Now!</b></p>
                  `,
          message2: ` 
                               <p>Stay ahead of the competition and secure your win!</p>
                  
             
                               <p style="margin-bottom: 0;">Good luck,</p>
                              <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                              <p>P.S. Stay tuned for updates—we’ll let you know if there’s more action on this auction.</p>`,
          Button_text: 'Place a Higher Bid',
          Button_URL: `https://www.alletre.com/alletre/home/${paymentData.auction.id}/details`,
        };

        console.log('joinedBidders1111111111111', joinedBidders);
        if (joinedBidders.length === 1) {
          this.emailService.sendEmail(
            joinedBidders[0].auction.user.email,
            'token',
            EmailsType.OTHER,
            emailBodyToSeller,
          );
          const whatsappBodyToLostBidders = {
            1: `${paymentData.auction.user.userName}`,
            2: `Congratulations! Your auction ${paymentData.auction.product.title} has received its first bid! This is an exciting milestone, and the competition has officially begun.`,
            3: `*First Bid Amount:* ${
              joinedBidders[joinedBidders.length - 1].amount
            }`,
            4: `*Bidder Username:* ${
              joinedBidders[joinedBidders.length - 1].user.userName
            }`,
            5: `*Auction Ends:* ${formattedEndDate} & ${formattedEndTime}`,
            6: `This is just the beginning—more bidders could be on their way!`,
            7: `*What can you do now?* -> Share your auction to attract even more bids. Keep an eye on the activity to stay informed about the progress.`,
            8: paymentData.auction.product.images[0].imageLink,
            9: `https://www.alletre.com/alletre/home/${paymentData.auction.id}/details`,
          };
          if (paymentData.auction.user.phone) {
            await this.whatsappService.sendOtherUtilityMessages(
              whatsappBodyToLostBidders,
              paymentData.auction.user.phone,
              'alletre_common_utility_templet',
            );
          }
        }
        if (joinedBidders[1]) {
          console.log('joinedBidders222222', joinedBidders[1]);
          this.emailService.sendEmail(
            joinedBidders[1].user.email,
            'token',
            EmailsType.OTHER,
            emailBodyToSecondLastBidder,
          );

          const whatsappBodyTosecondLastBidders = {
            1: `${joinedBidders[1].user.userName}`,
            2: `Exciting things are happening on ${paymentData.auction.product.title}! Unfortunately, someone has just placed a higher bid, and you're no longer in the lead.`,
            3: `*Here’s the current standing:*`,
            4: `*Current Highest Bid:* ${
              joinedBidders.length > 1 ? joinedBidders[0].amount : 'No bids yet'
            }`,
            5: `*Your Last Bid:* ${joinedBidders[1]?.amount}`,
            6: `Don’t miss your chance to claim this one-of-a-kind ${paymentData.auction.product.title} . The clock is ticking, and every second counts!`,
            7: `*Reclaim Your Spot as the Top Bidder Now!*`,
            8: paymentData.auction.product.images[0].imageLink,
            9: `https://www.alletre.com/alletre/home/${paymentData.auction.id}/details`,
          };
          if (joinedBidders[1].user.phone) {
            await this.whatsappService.sendOtherUtilityMessages(
              whatsappBodyTosecondLastBidders,
              joinedBidders[1].user.phone,
              'alletre_common_utility_templet',
            );
          }
        }
        // create notification for seller
        const auction = paymentData.auction;
        const isCreateNotificationToSeller =
          await this.prismaService.notification.create({
            data: {
              userId: paymentData.auction.userId,
              message: `Mr. ${paymentData.user.userName} has been placed new bid on your auction ${paymentData.auction.product.title} (Model: ${paymentData.auction.product.model})`,
              imageLink: auction.product.images[0].imageLink,
              productTitle: auction.product.title,
              auctionId: paymentData.auctionId,
            },
          });

        const isCreateNotificationToCurrentBidder =
          await this.prismaService.notification.create({
            data: {
              userId: paymentData.userId,
              message: `You have successfully placed a bid on ${paymentData.auction.product.title} (Model: ${paymentData.auction.product.model})`,
              imageLink: auction.product.images[0].imageLink,
              productTitle: auction.product.title,
              auctionId: paymentData.auctionId,
            },
          });

        if (isCreateNotificationToSeller) {
          // Send notification to seller
          const sellerUserId = paymentData.auction.userId;

          const notification = {
            status: 'ON_BIDDING',
            userType: 'FOR_SELLER',
            usersId: sellerUserId,
            message: isCreateNotificationToSeller.message,
            imageLink: auction.product.images[0].imageLink,
            productTitle: auction.product.title,
            auctionId: isCreateNotificationToSeller.auctionId,
          };
          try {
            this.notificationsService.sendNotificationToSpecificUsers(
              notification,
            );
          } catch (error) {
            console.log('sendNotificationToSpecificUsers error', error);
          }
        }

        if (isCreateNotificationToCurrentBidder) {
          try {
            // Send notification to current bidder
            const currentBidderId = paymentData.userId;

            const notification = {
              status: 'ON_BIDDING',
              userType: 'CURRENT_BIDDER',
              usersId: currentBidderId,
              message: isCreateNotificationToCurrentBidder.message,
              imageLink: auction.product.images[0].imageLink,
              productTitle: auction.product.title,
              auctionId: isCreateNotificationToCurrentBidder.auctionId,
            };
            this.notificationsService.sendNotificationToSpecificUsers(
              notification,
            );

            // Send notification other bidders
            const currentUserId = paymentData.userId;
            const joinedAuctionUsers =
              await this.notificationsService.getAllJoinedAuctionUsers(
                paymentData.auctionId,
                currentUserId,
              );
            const imageLink = auction.product.images[0].imageLink;
            const productTitle = auction.product.title;
            const otherBidderMessage = `${paymentData.user.userName} has placed a bid (AED ${bidAmount}) on ${paymentData.auction.product.title} (Model: ${paymentData.auction.product.model})`;
            const isBidders = true;
            await this.notificationsService.sendNotifications(
              joinedAuctionUsers,
              otherBidderMessage,
              imageLink,
              productTitle,
              paymentData.auctionId,
              isBidders,
            );
          } catch (error) {
            console.log('sendNotificationToSpecificUsers error', error);
          }
        }
        console.log('test of wallet pay of bidder deposite 4');
        // emit to all biders using socket instance
        this.bidsWebSocketGateway.userSubmitBidEventHandler(
          auctionId,
          new Prisma.Decimal(bidAmount),
          paymentData.auction.bids.length,
        );
        this.auctionGateway.increaseBid(paymentData.auction);
        return paymentData;
      }
    } catch (error) {
      console.log('wallet pay deposit by bidder error :', error);
      throw new InternalServerErrorException(
        'Failed to process wallet payment for bidder deoposit',
      );
    }
  }

  async payDepositByArbon(
    user: User,
    productId: number,
    currency: string,
    amount: number,
  ) {
    try {
      if (!user) {
        throw new MethodNotAllowedResponse({
          ar: 'يجب تسجيل الدخول لإتمام عملية الدفع',
          en: 'You must be logged in to make a payment',
        });
      }
      console.log('Online Arbon deposit payment');

      // Create StripeCustomer if has no account
      let stripeCustomerId: string = user?.stripeId || '';
      if (!user?.stripeId) {
        stripeCustomerId = await this.stripeService.createCustomer(
          user.email,
          user.userName,
        );
        await this.prismaService.user.update({
          where: { id: user.id },
          data: { stripeId: stripeCustomerId },
        });
      }

      // Check if product already has an active Arbon deposit
      const product = await this.prismaService.product.findUnique({
        where: { id: productId },
      });

      if ((product as any).arbonStatus === 'PAID') {
        throw new MethodNotAllowedResponse({
          ar: 'تم دفع العربون بالفعل لهذا المنتج',
          en: 'Arbon deposit already paid for this product',
        });
      }

      const { clientSecret, paymentIntentId } =
        await this.stripeService.createDepositPaymentIntent(
          stripeCustomerId,
          amount,
          currency,
          { productId, userId: user.id, type: 'ARBON_DEPOSIT' },
        );

      await this.prismaService.payment.create({
        data: {
          userId: user.id,
          productId: productId,
          amount: amount,
          paymentIntentId: paymentIntentId,
          type: PaymentType.ARBON_DEPOSIT,
        },
      });

      return { clientSecret, paymentIntentId };
    } catch (error) {
      console.log('stripe pay arbon deposit error :', error);
      if (error instanceof MethodNotAllowedResponse) throw error;
      throw new InternalServerErrorException(
        error.message || 'Failed to process arbon payment',
      );
    }
  }

  async releaseArbonDeposit(user: User, productId: number) {
    console.log('>>> PAYMENTS SERVICE: releaseArbonDeposit CALLED <<<', {
      userId: user.id,
      productId,
    });
    try {
      const product = await this.prismaService.product.findUnique({
        where: { id: productId },
        include: { user: true, arbonBuyer: true },
      });

      if (!product || product.userId !== user.id) {
        throw new ForbiddenException('You are not the seller of this product');
      }

      if ((product as any).arbonStatus !== 'PAID') {
        throw new BadRequestException('Arbon deposit is not in PAID status');
      }

      // Validity check: 7 days
      const now = new Date();
      const paidAt = new Date((product as any).arbonPaidAt);
      const diffTime = Math.abs(now.getTime() - paidAt.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 7) {
        throw new BadRequestException('Release period of 7 days has expired');
      }

      // Fetch all active payment records for this product
      const payments = await this.prismaService.payment.findMany({
        where: {
          productId,
          type: 'ARBON_DEPOSIT' as any,
          status: { in: [PaymentStatus.HOLD, PaymentStatus.SUCCESS] },
        } as any,
      });

      if (payments.length === 0) {
        throw new BadRequestException('No active arbon payment records found');
      }
      console.log(`Found ${payments.length} payments to release for product ${productId}`);

      // Logic to release (refund to buyer) all payments
      for (const payment of payments) {
        try {
          if (payment.status === PaymentStatus.SUCCESS) {
            await this.stripeService.refundPayment(payment.paymentIntentId);
          } else if (payment.status === PaymentStatus.HOLD) {
            await this.stripeService.cancelDepositPaymentIntent(payment.paymentIntentId);
          }

          // Update payment status to CANCELLED or REFUNDED in DB
          await this.prismaService.payment.update({
            where: { id: payment.id },
            data: { status: PaymentStatus.CANCELLED },
          });
        } catch (err) {
          console.error(`Error during Stripe refund/cancel for payment ${payment.id}:`, err);
        }
      }

      // Update product status once
      await this.prismaService.product.update({
        where: { id: productId },
        data: { arbonStatus: 'REFUNDED' } as any,
      });

      // Send Email to Buyer
      if (product.arbonBuyer?.email) {
        await this.emailService.sendEmail(
          product.arbonBuyer.email,
          'token',
          EmailsType.ARBON_RELEASED,
          { productTitle: product.title },
          product.arbonBuyer.userName,
        );
      }

      return {
        success: true,
        message: `Released ${payments.length} deposit(s) and refunded to buyer successfully`,
      };
    } catch (error) {
      console.log('releaseArbonDeposit error:', error);
      throw error;
    }
  }

  async autoReleaseArbonDeposit(productId: number) {
    console.log('>>> PAYMENTS SERVICE: autoReleaseArbonDeposit CALLED <<<', {
      productId,
    });
    try {
      const product = await this.prismaService.product.findUnique({
        where: { id: productId },
        include: { arbonBuyer: true },
      });

      if (!product) {
        throw new BadRequestException('Product not found');
      }

      if ((product as any).arbonStatus !== 'PAID') {
        throw new BadRequestException('Arbon deposit is not in PAID status');
      }

      // Check if 7 days have passed
      const now = new Date();
      const paidAt = new Date((product as any).arbonPaidAt);
      const diffTime = Math.abs(now.getTime() - paidAt.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 7) {
        throw new BadRequestException(
          'Cannot release deposit yet. 7 days have not passed.',
        );
      }

      // Fetch all active payment records for this product
      const payments = await this.prismaService.payment.findMany({
        where: {
          productId,
          type: 'ARBON_DEPOSIT' as any,
          status: { in: [PaymentStatus.HOLD, PaymentStatus.SUCCESS] },
        } as any,
      });

      if (payments.length === 0) {
        throw new BadRequestException('No active arbon payment records found');
      }

      // Logic to release (refund to buyer) all payments
      for (const payment of payments) {
        try {
          if (payment.status === PaymentStatus.SUCCESS) {
            await this.stripeService.refundPayment(payment.paymentIntentId);
          } else if (payment.status === PaymentStatus.HOLD) {
            await this.stripeService.cancelDepositPaymentIntent(payment.paymentIntentId);
          }

          // Update payment status to CANCELLED in DB
          await this.prismaService.payment.update({
            where: { id: payment.id },
            data: { status: PaymentStatus.CANCELLED },
          });
        } catch (err) {
          console.error(`Error during Stripe refund/cancel for payment ${payment.id}:`, err);
        }
      }

      // Update product status once to RELEASED (system finalized)
      await this.prismaService.product.update({
        where: { id: productId },
        data: { arbonStatus: 'RELEASED' } as any,
      });

      // Send Email to Buyer
      if (product.arbonBuyer?.email) {
        await this.emailService.sendEmail(
          product.arbonBuyer.email,
          'token',
          EmailsType.ARBON_RELEASED,
          { productTitle: product.title },
          product.arbonBuyer.userName,
        );
      }

      return {
        success: true,
        message: 'Deposit auto-released and refunded to buyer successfully',
      };
    } catch (error) {
      console.log('autoReleaseArbonDeposit error:', error);
      throw error;
    }
  }

  async payDepositByBidder(
    user: User,
    auctionId: number,
    currency: string,
    amount: number,
    bidAmount: number,
  ) {
    console.log('test 3');

    // Create SripeCustomer if has no account
    let stripeCustomerId: string = user?.stripeId || '';
    if (!user?.stripeId) {
      stripeCustomerId = await this.stripeService.createCustomer(
        user.email,
        user.userName,
      );

      // Add to user stripeCustomerId
      await this.prismaService.user.update({
        where: { id: user.id },
        data: { stripeId: stripeCustomerId },
      });
    }

    // Check if bidder has already pay deposit for auction
    const bidderPaymentForAuction = await this.getAuctionPaymentTransaction(
      user.id,
      auctionId,
      PaymentType.BIDDER_DEPOSIT,
    );
    console.log('test 4');

    if (bidderPaymentForAuction) {
      console.log('test 5');

      // Retrieve PaymentIntent and clientSecret for clientSide
      const paymentIntent = await this.stripeService.retrievePaymentIntent(
        bidderPaymentForAuction.paymentIntentId,
      );
      if (paymentIntent.status === 'succeeded') {
        throw new MethodNotAllowedException('already paid');
      }
      if (paymentIntent.metadata.bidAmount !== bidAmount.toString()) {
        await this.stripeService.updatePaymentIntent(
          bidderPaymentForAuction.paymentIntentId,
          { bidAmount: bidAmount.toString() },
        );
      }
      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      };
    }
    console.log('test 7');

    // Create PaymentIntent
    // const { clientSecret, paymentIntentId } =
    // await this.stripeService.createPaymentIntent(
    //   stripeCustomerId,
    //   amount,
    //     currency,
    //     { bidAmount: Number(bidAmount) },
    //   );

    // Create PaymentIntent
    // the above is commented out becuase now we are holding (authorizing) the money.
    const { clientSecret, paymentIntentId } =
      await this.stripeService.createDepositPaymentIntent(
        stripeCustomerId,
        amount,
        currency,
        { bidAmount: Number(bidAmount), auctionId, userId: user.id },
      );
    console.log('test 8, bid amount:', bidAmount, 'amount:', amount);

    //TODO:  Add currency in payment model
    await this.prismaService.payment.create({
      data: {
        userId: user.id,
        auctionId: auctionId,
        amount: amount,
        paymentIntentId: paymentIntentId,
        type: PaymentType.BIDDER_DEPOSIT,
      },
    });
    console.log('test 9');

    return { clientSecret, paymentIntentId };
  }

  async payAuctionByBidderWithWallet(
    user: User,
    auctionId: number,
    // currency: string,
    amount: number,
  ) {
    try {
      console.log(
        'test of wallet pay of bidder payment payAuctionByBidderWithWallet 1',
      );
      // Check if bidder has already has transaction for auction
      const bidderPaymentTransaction = await this.getAuctionPaymentTransaction(
        user.id,
        auctionId,
        PaymentType.AUCTION_PURCHASE,
      );
      if (bidderPaymentTransaction) {
        console.log(
          'test of wallet pay of bidder payment payAuctionByBidderWithWallet 2',
        );
        if (bidderPaymentTransaction.status === 'SUCCESS')
          throw new MethodNotAllowedException('already paid');

        //check previous payment attempt thorugh stripe or not
        if (bidderPaymentTransaction.paymentIntentId) {
          throw new MethodNotAllowedException(
            'Wallet payment is not available for this auction. Please select an online payment method to proceed.',
          );
        }
        return bidderPaymentTransaction;
      }

      //finding the last transaction balance of the Seller
      const lastWalletTransactionBalanceOfBidder =
        await this.walletService.findLastTransaction(user.id);
      //finding the last transaction balance of the alletreWallet
      const lastBalanceOfAlletre =
        await this.walletService.findLastTransactionOfAlletre();
      if (Number(lastWalletTransactionBalanceOfBidder) < amount) {
        throw new MethodNotAllowedException('Sorry, Insufficient Balance.');
      }

      const BidderWalletData = {
        status: WalletStatus.WITHDRAWAL,
        transactionType: WalletTransactionType.By_AUCTION,
        description: `Complete Payment of winner bidder`,
        amount: amount,
        auctionId: Number(auctionId),
        balance: Number(lastWalletTransactionBalanceOfBidder) - amount,
      };
      // wallet data for deposit to alletre wallet

      const alletreWalletData = {
        status: WalletStatus.DEPOSIT,
        transactionType: WalletTransactionType.By_AUCTION,
        description: `Complete Payment of winner bidder`,
        amount: amount,
        auctionId: Number(auctionId),
        balance: lastBalanceOfAlletre
          ? Number(lastBalanceOfAlletre) + amount
          : amount,
      };

      const joinedAuction = await this.prismaService.joinedAuction.findFirst({
        where: {
          userId: user.id,
          auctionId: auctionId,
        },
        include: {
          user: true,
        },
      });
      const { paymentData } = await this.prismaService.$transaction(
        async (prisma) => {
          try {
            console.log(
              'test of wallet pay of bidder deposite payAuctionByBidderWithWallet 3',
            );

            // Update joinedAuction for bidder to WAITING_DELIVERY
            await prisma.joinedAuction.update({
              where: { id: joinedAuction.id },
              data: {
                status: JoinedAuctionStatus.WAITING_FOR_DELIVERY,
              },
            });
            // Update auction status to sold
            await prisma.auction.update({
              where: { id: auctionId },
              data: { status: AuctionStatus.SOLD },
            });

            const paymentData = await prisma.payment.create({
              data: {
                userId: user.id,
                auctionId: auctionId,
                amount: amount,
                type: PaymentType.AUCTION_PURCHASE,
                isWalletPayment: true,
                status: 'SUCCESS',
              },
              include: {
                user: true,
                auction: {
                  include: {
                    bids: {
                      include: { user: true },
                      orderBy: { amount: 'desc' },
                    },
                    product: {
                      include: { images: true, category: true },
                    },
                    user: true,
                  },
                },
              },
            });

            console.log(
              'test of wallet pay of bidder deposite payAuctionByBidderWithWallet 4',
            );

            return { paymentData };
          } catch (error) {
            console.log(
              'wallet pay deposit error at prisma.$transaction() :',
              error,
            );
            throw new InternalServerErrorException(
              'Failed to process wallet payment for bidder deoposit',
            );
          }
        },
      );
      if (paymentData) {
        //checking again the wallet balance to avoid issues
        const lastWalletTransactionBalanceOfBidder =
          await this.walletService.findLastTransaction(user.id);
        if (Number(lastWalletTransactionBalanceOfBidder) < amount) {
          throw new MethodNotAllowedException('Sorry, Insufficient Balance.');
        }
        //crete new transaction in bidder wallet
        const sellerWallet = await this.walletService.create(
          user.id,
          BidderWalletData,
        );
        //crete new transaction in alletre wallet
        const alletreWallet = await this.walletService.addToAlletreWallet(
          user.id,
          alletreWalletData,
        );
        // create new payment database
        if (!sellerWallet || !alletreWallet) {
          throw new InternalServerErrorException(
            'Failed to process wallet payment',
          );
        }

        const auctionEndDate = new Date(paymentData.auction.expiryDate);
        const formattedEndTime = auctionEndDate.toTimeString().slice(0, 5);
        auctionEndDate.setDate(auctionEndDate.getDate() + 3);
        const PaymentEndDate = auctionEndDate.toISOString().split('T')[0];
        //here need send the back the security deposit of winner
        const winnedBidderDepositPaymentData =
          await this.getAuctionPaymentTransaction(
            paymentData.userId,
            paymentData.auctionId,
            PaymentType.BIDDER_DEPOSIT,
          );

        // if (
        //   !winnedBidderDepositPaymentData.isWalletPayment &&
        //   winnedBidderDepositPaymentData.paymentIntentId
        // ) {
        //   try {
        //     const is_SD_SendBackToWinner =
        //       await this.stripeService.cancelDepositPaymentIntent(
        //         winnedBidderDepositPaymentData.paymentIntentId,
        //       );
        //     if (is_SD_SendBackToWinner) {
        //       console.log('SD send back to winner - stripe');
        //     }
        //   } catch (error) {
        //     console.error(
        //       'Error when sending back SD  for winning bidder:',
        //       error,
        //     );
        //   }
        // } else
        //  {
        //   try {
        //     //finding the last transaction balance of the winner
        //     const lastWalletTransactionBalanceOfWinner =
        //       await this.walletService.findLastTransaction(
        //         winnedBidderDepositPaymentData.userId,
        //       );
        //     //finding the last transaction balance of the alletreWallet
        //     const lastBalanceOfAlletre =
        //       await this.walletService.findLastTransactionOfAlletre();
        //     //wallet data for the winner bidder
        //     const BidderWalletData = {
        //       status: WalletStatus.DEPOSIT,
        //       transactionType: WalletTransactionType.By_AUCTION,
        //       description: `Return security deposit after auction win`,
        //       amount: Number(winnedBidderDepositPaymentData.amount),
        //       auctionId: Number(winnedBidderDepositPaymentData.auctionId),
        //       balance: lastWalletTransactionBalanceOfWinner
        //         ? Number(lastWalletTransactionBalanceOfWinner) +
        //           Number(winnedBidderDepositPaymentData.amount)
        //         : Number(winnedBidderDepositPaymentData.amount),
        //     };
        //     // wallet data for deposit to alletre wallet

        //     const alletreWalletData = {
        //       status: WalletStatus.WITHDRAWAL,
        //       transactionType: WalletTransactionType.By_AUCTION,
        //       description: `Return of bidder security deposit after auction win`,
        //       amount: Number(winnedBidderDepositPaymentData.amount),
        //       auctionId: Number(winnedBidderDepositPaymentData.auctionId),
        //       balance:
        //         Number(lastBalanceOfAlletre) -
        //         Number(winnedBidderDepositPaymentData.amount),
        //     };
        //     await this.walletService.create(
        //       winnedBidderDepositPaymentData.userId,
        //       BidderWalletData,
        //     );
        //     //crete new transaction in alletre wallet
        //     await this.walletService.addToAlletreWallet(
        //       winnedBidderDepositPaymentData.userId,
        //       alletreWalletData,
        //     );
        //   } catch (error) {
        //     console.error(
        //       'Error when sending back SD  for winning bidder:',
        //       error,
        //     );
        //   }
        // }

        //Email to winning bidder paid amount (wallet)
        const paymentSuccessData = paymentData;
        const invoicePDF = await generateInvoicePDF(paymentSuccessData);
        const emailBodyToWinner = {
          subject: '🎉 Payment Confirmation and Next Steps',
          title:
            'Your Payment is Confirmed – Please Confirm Delivery Upon Completion',
          Product_Name: paymentSuccessData.auction.product.title,
          img: paymentSuccessData.auction.product.images[0].imageLink,
          userName: `${paymentSuccessData.auction.bids[0].user.userName}`,
          message1: `
            <p>We are pleased to inform you that your payment for the auction of <b>${paymentSuccessData.auction.product.title} (Model: ${paymentSuccessData.auction.product.model})</b> has been successfully processed.</p>
            <p>Here are the auction details for your reference:</p>
            <ul>
              <li><b>Item:</b> ${paymentSuccessData.auction.product.title}</li>
              <li><b>Winning Bid:</b> ${paymentSuccessData.auction.bids[0].amount}</li>
              <li><b>Seller:</b> ${paymentSuccessData.auction.user.userName}</li>
            </ul>
            <p>An invoice for this transaction is attached to this email for your records.</p>
          `,
          message2: `
            <h3>What’s Next?</h3>
            <ul>
              <li>Once the delivery is complete, please confirm the delivery by clicking the <b>"Confirm Delivery"</b> button on the <b>MY Bids</b> page under the section <b>"Waiting for Delivery."</b></li>
              <li>If you encounter any issues during the process, feel free to contact our support team for assistance.</li>
            </ul>
            <p>Thank you for choosing <b>Alle Tre</b>. We truly value your trust and look forward to serving you again.</p>
            <p style="margin-bottom: 0;">Best regards,</p>
            <p style="margin-top: 0;">The <b>Alle Tre</b> Team</p>
          `,
          Button_text: 'Go to MY Bids',
          Button_URL:
            'https://www.alletre.com/alletre/profile/my-bids/waiting-for-delivery',
          attachment: invoicePDF,
        };
        //send notification to the winner
        const auction = paymentData.auction;
        const notificationMessageToWinner = `
        We’re excited to inform you that you have won the auction for ${paymentData.auction.product.title}!
        
        Here are the details of your purchase:
        - Auction Title: ${paymentData.auction.product.title}
        - Category: ${paymentData.auction.product.category.nameEn}
        - Winning Bid: ${paymentData.auction.bids[0].amount}
        
        Your payment has been processed successfully.
        `;

        const notificationBodyToWinner = {
          status: 'ON_AUCTION_PURCHASE_SUCCESS',
          userType: 'FOR_WINNER',
          usersId: joinedAuction.userId,
          message: notificationMessageToWinner,
          imageLink: auction.product.images[0].imageLink,
          productTitle: auction.product.title,
          auctionId: paymentData.auctionId,
        };
        //Email to seller when bidder pays amount (wallet)
        const emailBodyToSeller = {
          subject: '🎉 Payment Received! Next Steps for Your Auction',
          title: ' Your Auction Item Has Been Paid For',
          Product_Name: paymentData.auction.product.title,
          img: paymentData.auction.product.images[0].imageLink,
          userName: `${paymentData.auction.user.userName}`,
          message1: `
                  <p>Great news! The winning bidder for your auction, ${paymentData.auction.product.title}, has completed the payment in full.</p>
                  <p>Auction Details:</p>
                  <ul>
                    <li>Item: ${paymentData.auction.product.title}</li>
                    <li>Winning Bid: ${paymentData.auction.bids[0].amount}</li>
                    <li>Buyer:  ${paymentData.auction.bids[0].user.userName}</li>
                    <li>Delivery Option Chosen: ${paymentData.auction.deliveryType} </li>
                    </ul>
                    <h2>What You Need to Do:</h2>
                    <h3>If the buyer chose delivery:</h3>
                    <p>• Our courier will visit your address to collect the item. Please prepare the item for shipment and ensure it’s securely packaged.</p>
                      <h3>If the buyer chose pickup:</h3>
                    <p>• The buyer will visit your address to collect the item. Please ensure they confirm the collection in their account after the item is handed over.</p>
                `,
          message2: `
                  <h3>When Will You Get Paid?</h3>                           
                <p>The winning amount of ${paymentData.auction.bids[0].amount} will be credited to your wallet after the buyer collects the item and confirms receipt.</p>

                <p>Thank you for choosing <b>Alletre</b>!  We’re thrilled to see your auction succeed and look forward to supporting your future listings!</p>
                
                <p style="margin-bottom: 0;">Best regards,</p>
                <p style="margin-top: 0;">The <b>Alletre</b> Team</p> `,
          Button_text: 'Pickup/Delivery Details ',
          Button_URL: 'https://www.alletre.com/alletre/profile/my-auctions',
        };
        //send notification to the seller
        const notificationMessageToSeller = `The winner of your Auction of ${paymentData.auction.product.title}
                   (Model:${paymentData.auction.product.model}) has been paid the full amount. 
                   We would like to let you know that you can hand over the item to the winner. once the winner
                   confirmed the delvery, we will send the money to your wallet.`;
        const notificationBodyToSeller = {
          status: 'ON_AUCTION_PURCHASE_SUCCESS',
          userType: 'FOR_SELLER',
          usersId: paymentData.auction.user.id,
          message: notificationMessageToSeller,
          imageLink: auction.product.images[0].imageLink,
          productTitle: auction.product.title,
          auctionId: paymentData.auctionId,
        };

        await Promise.all([
          this.emailService.sendEmail(
            paymentData.auction.user.email,
            'token',
            EmailsType.OTHER,
            emailBodyToSeller,
          ),
          this.emailService.sendEmail(
            joinedAuction.user.email,
            'token',
            EmailsType.OTHER,
            emailBodyToWinner,
          ),
        ]);

        const whatsappBodyToSeller = {
          1: `${paymentData.auction.user.userName}`,
          2: `Great news! The winning bidder for your auction, ${paymentData.auction.product.title}, has completed the payment in full.`,
          3: `*Item:* ${paymentData.auction.product.title}`,
          4: `*Winning Bid:* ${paymentData.auction.bids[0].amount}`,
          5: `*Buyer:*  ${paymentData.auction.bids[0].user.userName}`,
          6: `*Delivery Option Chosen:* ${paymentData.auction.deliveryType}`,
          7: `*What You Need to Do:* *If the buyer chose delivery:*   Our courier will visit your address to collect the item. Please prepare the item for shipment and ensure it is securely packaged. *If the buyer chose pickup:* The buyer will visit your address to collect the item. Please ensure they confirm the collection in their account after the item is handed over`,
          8: paymentData.auction.product.images[0].imageLink,
          9: `https://www.alletre.com/alletre/profile/my-bids/pending`,
        };
        if (paymentData.auction.user.phone) {
          await this.whatsappService.sendOtherUtilityMessages(
            whatsappBodyToSeller,
            paymentData.auction.user.phone,
            'alletre_common_utility_templet',
          );
        }

        const whatsappBodyToWinner = {
          1: `${paymentSuccessData.auction.bids[0].user.userName}`,
          2: `We are pleased to inform you that your payment for the auction of *${paymentSuccessData.auction.product.title} (Model: ${paymentSuccessData.auction.product.model})* has been successfully processed.`,
          3: `*Item:* ${paymentSuccessData.auction.product.title}`,
          4: `*Winning Bid:* ${paymentSuccessData.auction.bids[0].amount}`,
          5: `*Seller:* ${paymentSuccessData.auction.user.userName}`,
          6: `Once the delivery is complete, please confirm the delivery by clicking the *"Confirm Delivery"* button on the *MY Bids* page under the section *"Waiting for Delivery."* `,
          7: `If you encounter any issues during the process, feel free to contact our support team for assistance.`,
          8: paymentSuccessData.auction.product.images[0].imageLink,
          9: `https://www.alletre.com/alletre/home/${paymentData.auction.id}/details`,
        };
        if (paymentData.auction.user.phone) {
          await this.whatsappService.sendOtherUtilityMessages(
            whatsappBodyToWinner,
            paymentData.auction.user.phone,
            'alletre_common_utility_templet',
          );
        }
        //send notification to the seller
        try {
          const isCreateNotificationToSeller =
            await this.prismaService.notification.create({
              data: {
                userId: paymentData.auction.user.id,
                message: notificationBodyToSeller.message,
                imageLink: auction.product.images[0].imageLink,
                productTitle: auction.product.title,
                auctionId: notificationBodyToSeller.auctionId,
              },
            });
          if (isCreateNotificationToSeller) {
            this.notificationsService.sendNotificationToSpecificUsers(
              notificationBodyToSeller,
            );
          }
        } catch (error) {
          console.log('sendNotificationToSpecificUsers error', error);
        }
        //send notification to the winner
        try {
          const isCreateNotificationToWinner =
            await this.prismaService.notification.create({
              data: {
                userId: joinedAuction.userId,
                message: notificationBodyToWinner.message,
                imageLink: auction.product.images[0].imageLink,
                productTitle: auction.product.title,
                auctionId: notificationBodyToWinner.auctionId,
              },
            });
          if (isCreateNotificationToWinner) {
            this.notificationsService.sendNotificationToSpecificUsers(
              notificationBodyToWinner,
            );
          }
        } catch (error) {
          console.log('sendNotificationToSpecificUsers error', error);
        }
        //Notifying delivery request to admin
        this.adminGateway.emitEventToAdmins(
          'delivery:newNotification',
          paymentData,
        );
      }
      return paymentData;
    } catch (error) {
      console.log('wallet pay deposit error at prisma.$transaction() :', error);
      throw new InternalServerErrorException(
        'Failed to process wallet payment for bidder deoposit',
      );
    }
  }
  async payAuctionByBidder(
    user: User,
    auctionId: number,
    currency: string,
    payingAmount: number,
    stripeAmount: number,
  ) {
    // Create SripeCustomer if has no account
    let stripeCustomerId: string = user?.stripeId || '';
    if (!user?.stripeId) {
      stripeCustomerId = await this.stripeService.createCustomer(
        user.email,
        user.userName,
      );

      // Add to user stripeCustomerId
      await this.prismaService.user.update({
        where: { id: user.id },
        data: { stripeId: stripeCustomerId },
      });
    }

    // Check if bidder has already has transaction for auction
    const bidderPaymentTransaction = await this.getAuctionPaymentTransaction(
      user.id,
      auctionId,
      PaymentType.AUCTION_PURCHASE,
    );
    if (bidderPaymentTransaction) {
      // Retrieve PaymentIntent and clientSecret for clientSide
      const paymentIntent = await this.stripeService.retrievePaymentIntent(
        bidderPaymentTransaction.paymentIntentId,
      );
      console.log('bidderPaymentTransaction data :', bidderPaymentTransaction);
      console.log('paymentIntent.status :', paymentIntent.status);

      if (paymentIntent.status === 'succeeded')
        throw new MethodNotAllowedException('already paid');

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      };
    }

    // Create PaymentIntent
    const { clientSecret, paymentIntentId } =
      await this.stripeService.createPaymentIntent(
        stripeCustomerId,
        stripeAmount,
        currency,
      );

    //TODO:  Add currency in payment model
    await this.prismaService.payment.create({
      data: {
        userId: user.id,
        auctionId: auctionId,
        // amount: payingAmount,
        amount: payingAmount,
        paymentIntentId: paymentIntentId,
        type: PaymentType.AUCTION_PURCHASE,
      },
    });
    return { clientSecret, paymentIntentId };
  }

  async createBuyNowPaymentTransactionWallet(
    user: User,
    auctionId: number,
    payingAmount: number,
    payingAmountWithFees: number,
  ) {
    try {
      // Check if user  already has transaction for auction
      const userPaymentTransaction = await this.getAuctionPaymentTransaction(
        user.id,
        auctionId,
        PaymentType.BUY_NOW_PURCHASE,
      );
      console.log(
        'userPaymentTransaction.paymentIntentId',
        userPaymentTransaction,
      );
      console.log('test 1');
      if (
        userPaymentTransaction &&
        userPaymentTransaction.paymentIntentId !== null
      ) {
        return {
          success: false,
          message_eng:
            'Sorry, you cannot select wallet payment, please choose online payment',
          message_arb:
            'عذرا، لا يمكنك اختيار الدفع عن طريق المحفظة، يرجى اختيار الدفع عبر الإنترنت',
        };
      }
      //finding the last transaction balance of the Seller
      const lastWalletTransactionBalanceOfBidder =
        await this.walletService.findLastTransaction(user.id);
      //finding the last transaction balance of the alletreWallet
      const lastBalanceOfAlletre =
        await this.walletService.findLastTransactionOfAlletre();
      if (Number(lastWalletTransactionBalanceOfBidder) < payingAmountWithFees) {
        throw new MethodNotAllowedException('Sorry, Insufficient Balance.');
      }

      console.log('test 2');

      const buyerWalletData = {
        status: WalletStatus.WITHDRAWAL,
        transactionType: WalletTransactionType.By_AUCTION,
        description: `Purchase Product through buy now`,
        amount: payingAmountWithFees,
        auctionId: Number(auctionId),
        balance:
          Number(lastWalletTransactionBalanceOfBidder) - payingAmountWithFees,
      };
      // wallet data for deposit to alletre wallet

      const alletreWalletData = {
        status: WalletStatus.DEPOSIT,
        transactionType: WalletTransactionType.By_AUCTION,
        description: `Purchase Product through buy now`,
        amount: payingAmountWithFees,
        auctionId: Number(auctionId),
        balance: lastBalanceOfAlletre
          ? Number(lastBalanceOfAlletre) + payingAmountWithFees
          : payingAmountWithFees,
      };
      console.log('test 3');

      const { paymentData } = await this.prismaService.$transaction(
        async (prisma) => {
          console.log('test 4');

          // Update auction status to sold

          await prisma.joinedAuction.updateMany({
            where: {
              auctionId: auctionId,
            },
            data: { status: JoinedAuctionStatus.LOST },
          });

          //here i have created the joinedAuction and bids due to there where no
          //funtionalities has implemented to handle the delevery and any other things track
          //item after buy now completed. by creating the joined auction and bids, it will act as normal bids
          //------------------------------------------------------------
          // Join user to auction
          await prisma.joinedAuction.create({
            data: {
              userId: user.id,
              auctionId: auctionId,
              status: JoinedAuctionStatus.WAITING_FOR_DELIVERY,
            },
          });
          // Create bid for user
          await prisma.bids.create({
            data: {
              userId: user.id,
              auctionId: auctionId,
              amount: payingAmount,
            },
          });

          const paymentData = await prisma.payment.create({
            data: {
              userId: user.id,
              auctionId: auctionId,
              amount: payingAmount,
              type: PaymentType.BUY_NOW_PURCHASE,
              isWalletPayment: true,
              status: 'SUCCESS',
            },
            include: {
              user: true,
              auction: {
                include: {
                  user: true,
                  product: { include: { images: true, category: true } },
                  bids: {
                    orderBy: { amount: 'desc' },
                    include: {
                      user: true,
                    },
                  },
                },
              },
            },
          });
          //------------------------------------------------------------

          await prisma.auction.update({
            where: { id: auctionId },
            data: { status: AuctionStatus.SOLD },
          });
          return { paymentData };
        },
        { timeout: 10000 },
      );
      console.log('test 5');

      if (paymentData) {
        console.log('payment data at buy now ', paymentData);

        //checking again the wallet balance to avoid issues
        const lastWalletTransactionBalanceOfBidder =
          await this.walletService.findLastTransaction(user.id);
        if (
          Number(lastWalletTransactionBalanceOfBidder) < payingAmountWithFees
        ) {
          throw new MethodNotAllowedException('Sorry, Insufficient Balance.');
        }
        //crete new transaction in bidder wallet
        const sellerWallet = await this.walletService.create(
          user.id,
          buyerWalletData,
        );
        //crete new transaction in alletre wallet
        const alletreWallet = await this.walletService.addToAlletreWallet(
          user.id,
          alletreWalletData,
        );
        // create new payment database
        if (!sellerWallet || !alletreWallet) {
          console.error(
            'Failed to create the seller wallet or the alletre wallet when buy now with wallet',
          );
          throw new InternalServerErrorException(
            'Failed to process wallet payment',
          );
        }
        //Email to winner (buy now option used - stripe)
        const invoicePDF = await generateInvoicePDF(paymentData);
        const emailBodyToWinner = {
          subject: '🎉 Congratulations! You Won the Auction',
          title: 'Your Bid Was Successful!',
          Product_Name: paymentData.auction.product.title,
          img: paymentData.auction.product.images[0].imageLink,
          userName: `${paymentData.user.userName}`,
          message1: `
            <p>We’re excited to inform you that you have won the auction for ${paymentData.auction.product.title}!</p>
            <p>Here are the details of your purchase:</p>
            <ul>
              <li> Auction Title: ${paymentData.auction.product.title}</li>
              <li> Category: ${paymentData.auction.product.category.nameEn}</li>
              <li> Winning Bid: ${paymentData.auction.bids[0].amount}</li>
            </ul>
            <p>Your payment has been processed successfully. An invoice for this transaction is attached to this email for your records.</p>
          `,
          message2: `
            <h3>What’s Next?</h3>
            <ul>
              <li>1. <b>Await Shipment</b>: The seller will ship the item to your provided address soon.</li>
              <li>2. <b>Track Your Delivery</b>: Once shipped, track your delivery status from your account.</li>
            </ul>
            <p>Thank you for choosing <b>Alletre</b>! We hope you enjoy your purchase and look forward to seeing you in future auctions.</p>
         
             <p style="margin-bottom: 0;">Best regards,</p>
          <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
            <p>P.S. If you have any questions or need assistance, don’t hesitate to contact our support team.</p>
          `,
          Button_text: 'View My Purchase',
          Button_URL: 'https://www.alletre.com/alletre/profile/purchased',
          attachment: invoicePDF,
        };
        await this.emailService.sendEmail(
          paymentData.user.email,
          'token',
          EmailsType.OTHER,
          emailBodyToWinner,
        );
        const whatsappBodyToWinner = {
          1: `${paymentData.user.userName}`,
          2: `We are excited to inform you that you have won the auction for ${paymentData.auction.product.title}!`,
          3: `*Auction Title:* ${paymentData.auction.product.title}`,
          4: `*Category:* ${paymentData.auction.product.category.nameEn}`,
          5: `*Winning Bid:* ${paymentData.auction.bids[0].amount}`,
          6: `*What is Next?*`,
          7: `1. *Await Shipment:* The seller will ship the item to your provided address soon. *Track Your Delivery:* Once shipped, track your delivery status from your account. `,
          8: paymentData.auction.product.images[0].imageLink,
          9: `https://www.alletre.com/alletre/profile/purchased`,
        };
        if (paymentData.user.phone) {
          await this.whatsappService.sendOtherUtilityMessages(
            whatsappBodyToWinner,
            paymentData.user.phone,
            'alletre_common_utility_templet',
          );
        }
        const auction = paymentData.auction;
        const notificationMessageToWinner = `
        We’re excited to inform you that you have won the auction for ${paymentData.auction.product.title}!
        
        Here are the details of your purchase:
        - Auction Title: ${paymentData.auction.product.title}
        - Category: ${paymentData.auction.product.category.nameEn}
        - Winning Bid: ${paymentData.auction.bids[0].amount}
        
        Your payment has been processed successfully. The seller will ship the item to the address you provided shortly.
        `;

        const notificationBodyToBuyer = {
          status: 'ON_ITEM_BUY_NOW',
          userType: 'FOR_WINNER',
          usersId: paymentData.userId,
          message: notificationMessageToWinner,
          imageLink: auction.product.images[0].imageLink,
          productTitle: auction.product.title,
          auctionId: paymentData.auctionId,
        };
        const createBuyerNotificationData =
          await this.prismaService.notification.create({
            data: {
              userId: paymentData.userId,
              message: notificationBodyToBuyer.message,
              imageLink: auction.product.images[0].imageLink,
              productTitle: auction.product.title,
              auctionId: paymentData.auctionId,
            },
          });
        if (createBuyerNotificationData) {
          try {
            this.notificationsService.sendNotificationToSpecificUsers(
              notificationBodyToBuyer,
            );
          } catch (error) {
            console.log('sendNotificationToSpecificUsers error', error);
          }
        }

        //check is there any bidders on this auction
        const auctionPaymentData = await this.prismaService.payment.findMany({
          where: { auctionId: auctionId },
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
              },
            },
          },
        });
        // await Promise.all(
        //   auctionPaymentData.map(async (payment) => {
        for (const payment of auctionPaymentData) {
          if (payment.type === 'BIDDER_DEPOSIT') {
            let is_SD_SendBackToBidder = false;
            if (payment.isWalletPayment) {
              //implement return security deposit funconality to wallet of bidders
              //finding the last transaction balance of the Seller
              const lastWalletTransactionBalanceOfBidder =
                await this.walletService.findLastTransaction(payment.user.id);
              //finding the last transaction balance of the alletreWallet
              const lastBalanceOfAlletre =
                await this.walletService.findLastTransactionOfAlletre();

              //wallet data for deposit to bidder wallet
              const bidderWalletData = {
                status: WalletStatus.DEPOSIT,
                transactionType: WalletTransactionType.By_AUCTION,
                description: `Return security deposite, Auction ended; item purchased via Buy Now option.`,
                amount: Number(payment.amount),
                auctionId: Number(payment.auctionId),
                balance: Number(lastWalletTransactionBalanceOfBidder)
                  ? Number(lastWalletTransactionBalanceOfBidder) +
                    Number(payment.amount)
                  : Number(payment.amount),
              };
              // wallet data for WITHDRAWAL to alletre wallet

              const alletreWalletData = {
                status: WalletStatus.WITHDRAWAL,
                transactionType: WalletTransactionType.By_AUCTION,
                description: `Return security deposite, Auction ended; item purchased via Buy Now option.`,
                amount: Number(payment.amount),
                auctionId: Number(payment.auctionId),
                balance: Number(lastBalanceOfAlletre) - Number(payment.amount),
              };
              // //crete new transaction in bidder wallet
              // const bidderWalletReuslt = await this.walletService.create(
              //   payment.user.id,
              //   bidderWalletData,
              // );
              // //crete new transaction in alletre wallet
              // const alletreWalletResult =
              //   await this.walletService.addToAlletreWallet(
              //     payment.user.id,
              //     alletreWalletData,
              //   );
              const [bidderWalletReuslt, alletreWalletResult] =
                await this.prismaService.$transaction(async (tx) => {
                  const bidderRes = await this.walletService.create(
                    payment.user.id,
                    bidderWalletData,
                    tx,
                  );
                  const alletreRes =
                    await this.walletService.addToAlletreWallet(
                      payment.user.id,
                      alletreWalletData,
                      tx,
                    );
                  return [bidderRes, alletreRes];
                });

              if (bidderWalletReuslt && alletreWalletResult)
                is_SD_SendBackToBidder = true;
            } else {
              //implement return security deposit funconality to stripe of bidders
              const isPaymentIntentCancelled =
                await this.stripeService.cancelDepositPaymentIntent(
                  payment.paymentIntentId,
                );
              if (isPaymentIntentCancelled) is_SD_SendBackToBidder = true;
            }
            if (is_SD_SendBackToBidder) {
              //Email to lost bidder (buy now option used - stripe)
              const emailBodyToLostBidders = {
                subject: '⏳ Auction Ended – You Missed Out!',
                title: 'The Auction Has Closed',
                Product_Name: payment.auction.product.title,
                img: payment.auction.product.images[0].imageLink,
                userName: `${payment.user.userName}`,
                message1: `
                    <p>The auction for ${payment.auction.product.title} has ended, and unfortunately, your bid didn’t win this time.</p>
                    <p>Here’s a quick recap:</p>
                    <ul>
                      <li>Auction Title: ${payment.auction.product.title}</li>
                      <li>Category: ${payment.auction.product.category.nameEn}</li>
                      <li>Winning Bid: ${payment.auction.bids[0].amount}</li>
                      <li>Winner: ${payment.auction.bids[0].user.userName}</li>
                    </ul>
                    <p>We know it’s disappointing, but there are always more exciting auctions to explore on <b>Alletre</b>.</p>
                  `,
                message2: `
                    <h3>What’s Next?</h3>
                    <ul>
                      <li><b>Explore More Auctions</b>: Browse our platform for more items you’ll love.</li>
                      <li><b>Bid Smarter</b>: Use the “Buy Now” feature or set higher auto-bids to secure your favorite items next time.</li>
                    </ul>
                    <p>Thank you for participating in the auction. We look forward to seeing you in future bids!</p>
                    <p style="margin-bottom: 0;">Best regards,</p>
                <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                    <p>P.S. If you have any questions or need assistance, don’t hesitate to contact our support team.</p>
                  `,
                Button_text: 'Browse Auctions',
                Button_URL: 'https://www.alletre.com/alletre/home',
              };
              await this.emailService.sendEmail(
                payment.user.email,
                'token',
                EmailsType.OTHER,
                emailBodyToLostBidders,
              );
              const notificationMessageToLosers = `
                The auction for ${payment.auction.product.title} has ended, and unfortunately, your bid did not win this time.
                
                Here are the details of your purchase:
                - Auction Title: ${payment.auction.product.title}
                - Category: ${payment.auction.product.category.nameEn}
                - Winning Bid: ${payment.auction.bids[0].amount}
                
                We know it’s disappointing, but there are always more exciting auctions to explore on Alletre.
                `;

              const whatsappBodyToLosers = {
                1: `${payment.user.userName}`,
                2: `The auction for ${payment.auction.product.title} has ended, and unfortunately, your bid did not win this time!`,
                3: `*Auction Title:* ${payment.auction.product.title}`,
                4: `*Category:* ${payment.auction.product.category.nameEn}`,
                5: `*Winning Bid:* ${payment.auction.bids[0].amount}`,
                6: `*We know it is disappointing, but there are always more exciting auctions to explore on Alletre.*`,
                7: `Please visit us to participate in stunning auctions.`,
                8: payment.auction.product.images[0].imageLink,
                9: `https://www.alletre.com/alletre/home`,
              };
              if (payment.user.phone) {
                await this.whatsappService.sendOtherUtilityMessages(
                  whatsappBodyToLosers,
                  payment.user.phone,
                  'alletre_common_utility_templet',
                );
              }
              const auction = payment.auction;
              const notificationBodyToLosers = {
                status: 'ON_ITEM_BUY_NOW',
                userType: 'FOR_LOSERS',
                usersId: payment.userId,
                message: notificationMessageToLosers,
                imageLink: auction.product.images[0].imageLink,
                productTitle: auction.product.title,
                auctionId: payment.auctionId,
              };
              const createLosersNotificationData =
                await this.prismaService.notification.create({
                  data: {
                    userId: payment.userId,
                    message: notificationBodyToLosers.message,
                    imageLink: auction.product.images[0].imageLink,
                    productTitle: auction.product.title,
                    auctionId: payment.auctionId,
                  },
                });
              if (createLosersNotificationData) {
                try {
                  this.notificationsService.sendNotificationToSpecificUsers(
                    notificationBodyToLosers,
                  );
                } catch (error) {
                  console.log('sendNotificationToSpecificUsers error', error);
                }
              }
            }
          } else if (payment.type === 'SELLER_DEPOSIT') {
            //Email to seller (buy now option used - stripe)
            const emailBodyToSeller = {
              subject: '🎉 Sold! Your Auction Ended with a Direct Buys',
              title: 'Congratulations – Your Item Has Been Sold!',
              Product_Name: payment.auction.product.title,
              img: payment.auction.product.images[0].imageLink,
              userName: `${payment.user.userName}`,
              message1: ` 
                  <p>Great news! Your auction ${payment.auction.product.title}, just ended because a buyer used the <b>Buy now</b> option to purchase your item instantly.</p>
                          <p>Here are the details:</p>
                  <ul>
                  <li> Auction Title: ${payment.auction.product.title}</li>
                  <li> Category: ${payment.auction.product.category.nameEn}</li>
                  <li> Sold For:${payment.auction.bids[0].amount} </li>
                  <li> Buyer: ${payment.auction.bids[0].user.userName} </li>
                  </ul>
                  <p>The buyer has completed the payment, and the funds will be processed and transferred to your account shortly.</p>             
                  `,
              message2: ` <h3>What’s Next? </h3>
                  <ul>
                  <li>1.<b>	Ship Your Item</b>: Make sure to package your item securely and ship it to the buyer’s provided address as soon as possible.</li>
                  <li>2.<b> Confirm Shipping</b>:: Update the status in your account once the item has been shipped.</li>
                  </ul>
               <p>Thank you for choosing <b>Alletre</b>! We’re thrilled to see your success and look forward to helping you with your future auctions.</p>
                   
                               <p style="margin-bottom: 0;">Best regards,</p>
                <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                              <p>P.S. If you have any questions or need assistance, don’t hesitate to contact our support team.</p>`,
              Button_text: 'Manage My Sales',
              Button_URL:
                ' https://www.alletre.com/alletre/profile/my-auctions/sold',
            };
            await this.emailService.sendEmail(
              payment.user.email,
              'token',
              EmailsType.OTHER,
              emailBodyToSeller,
            );
            const whatsappBodyToSeller = {
              1: `${payment.user.userName}`,
              2: `Great news! Your auction *${payment.auction.product.title}*, just ended because a buyer used the *Buy now* option to purchase your item instantly`,
              3: `*Auction Title:* ${payment.auction.product.title}`,
              4: `*Category:* ${payment.auction.product.category.nameEn}`,
              5: `*Sold For:* ${payment.auction.bids[0].amount}`,
              6: `*Buyer:* ${payment.auction.bids[0].user.userName}`,
              7: `Please visit us to participate in stunning auctions.`,
              8: payment.auction.product.images[0].imageLink,
              9: `https://www.alletre.com/alletre/profile/my-auctions/sold`,
            };
            if (payment.user.phone) {
              await this.whatsappService.sendOtherUtilityMessages(
                whatsappBodyToSeller,
                payment.user.phone,
                'alletre_common_utility_templet',
              );
            }
            const auction = payment.auction;
            const notificationMessageToSeller = `
              Great news! Your auction ${payment.auction.product.title}, just ended because a buyer used the Buy now option to purchase your item instantly.
              
              Here are the details of your purchase:
              - Auction Title: ${payment.auction.product.title}
              - Category: ${payment.auction.product.category.nameEn}
              - Sold For:${payment.auction.bids[0].amount}
              - Buyer: ${payment.auction.bids[0].user.userName}
              
              Your payment has been processed successfully. The seller will ship the item to the address you provided shortly.
              `;

            const notificationBodyToSeller = {
              status: 'ON_ITEM_BUY_NOW',
              userType: 'FOR_SELLER',
              usersId: payment.userId,
              message: notificationMessageToSeller,
              imageLink: auction.product.images[0].imageLink,
              productTitle: auction.product.title,
              auctionId: payment.auctionId,
            };
            const createLosersNotificationData =
              await this.prismaService.notification.create({
                data: {
                  userId: payment.userId,
                  message: notificationBodyToSeller.message,
                  imageLink: auction.product.images[0].imageLink,
                  productTitle: auction.product.title,
                  auctionId: payment.auctionId,
                },
              });
            if (createLosersNotificationData) {
              try {
                this.notificationsService.sendNotificationToSpecificUsers(
                  notificationBodyToSeller,
                );
              } catch (error) {
                console.log('sendNotificationToSpecificUsers error', error);
              }
            }
          }
        }
        // ),);
        //Notifying delivery request to admin
        this.adminGateway.emitEventToAdmins(
          'delivery:newNotification',
          paymentData,
        );
        this.auctionGateway.buyNowPurchase(auctionId);
      } else {
        throw new MethodNotAllowedException(
          'Faild to complete the buy now payment',
        );
      }
      console.log('test 6');

      return {
        success: true,
        data: { paymentData },
      };
    } catch (error) {
      console.log('wallet pay deposit error at prisma.$transaction() :', error);
      throw new InternalServerErrorException(
        'Failed to process wallet payment for bidder deoposit',
      );
    }
  }

  async createBuyNowPaymentTransaction(
    user: User,
    auctionId: number,
    currency: string,
    payingAmount: number,
    stripeAmount: number,
  ) {
    // Create SripeCustomer if has no account
    let stripeCustomerId: string = user?.stripeId || '';

    if (!user?.stripeId) {
      stripeCustomerId = await this.stripeService.createCustomer(
        user.email,
        user.userName,
      );

      // Add to user stripeCustomerId
      await this.prismaService.user.update({
        where: { id: user.id },
        data: { stripeId: stripeCustomerId },
      });
    }

    // Check if user  already has transaction for auction
    const userPaymentTransaction = await this.getAuctionPaymentTransaction(
      user.id,
      auctionId,
      PaymentType.BUY_NOW_PURCHASE,
    );
    if (userPaymentTransaction) {
      // Retrieve PaymentIntent and clientSecret for clientSide
      const paymentIntent = await this.stripeService.retrievePaymentIntent(
        userPaymentTransaction.paymentIntentId,
      );

      if (paymentIntent.status === 'succeeded')
        throw new MethodNotAllowedException('already paid');

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      };
    }

    // Create PaymentIntent
    const { clientSecret, paymentIntentId } =
      await this.stripeService.createPaymentIntent(
        stripeCustomerId,
        stripeAmount,
        currency,
      );

    //TODO:  Add currency in payment model
    await this.prismaService.payment.create({
      data: {
        userId: user.id,
        auctionId: auctionId,
        amount: payingAmount,
        paymentIntentId: paymentIntentId,
        type: PaymentType.BUY_NOW_PURCHASE,
      },
    });

    return { clientSecret, paymentIntentId };
  }

  async webHookEventHandler(payload: Buffer, stripeSignature: string) {
    console.log('--- STRIPE WEBHOOK RECEIVED ---');
    const { paymentIntent, status } = await this.stripeService.webHookHandler(
      payload,
      stripeSignature,
    );
    console.log('--- WEBHOOK SERVICE HANDLER START ---');
    console.log('Parsed Status:', status, 'PI ID:', paymentIntent?.id);
    if (paymentIntent?.metadata) {
      console.log('Webhook PI Metadata:', paymentIntent.metadata);
    }
    switch (status) {
      case PaymentStatus.CANCELLED:
        console.log('Webhook CANCELLED ...', status);
        // const auctionCancelPaymentTransaction =
        await this.prismaService.payment.update({
          where: { paymentIntentId: paymentIntent.id },
          data: { status: PaymentStatus.CANCELLED },
        });

        break;
      case PaymentStatus.HOLD:
        const holdPaymentTransaction =
          (await this.prismaService.payment.findUnique({
            where: { paymentIntentId: paymentIntent.id },
            include: {
              auction: {
                include: {
                  product: { include: { images: true } },
                  user: true,
                  bids: true,
                  Payment: { where: { type: 'SELLER_DEPOSIT' } },
                },
              },
              product: { include: { images: true, user: true } },
              user: true,
            } as any,
          })) as any;

        if (!holdPaymentTransaction) {
          console.error(`[ERROR] Webhook HOLD: Payment transaction NOT FOUND in DB for PI ID: ${paymentIntent.id}`);
          break;
        }

        console.log('Webhook HOLD: Payment transaction found:', holdPaymentTransaction.id, 'Type:', holdPaymentTransaction.type);

        // Handle ARBON_DEPOSIT Hold
        const pType = holdPaymentTransaction.type;
        if (pType === PaymentType.ARBON_DEPOSIT) {
          console.log('Webhook HOLD: Handling ARBON_DEPOSIT authorization');
          await this.prismaService.$transaction(async (prisma) => {
            // Update payment transaction
            await prisma.payment.update({
              where: { paymentIntentId: paymentIntent.id },
              data: { status: PaymentStatus.HOLD },
            });

            // Update product status
            await prisma.product.update({
              where: { id: Number(holdPaymentTransaction.productId) },
              data: {
                arbonStatus: ArbonStatus.PAID,
                arbonBuyerId: holdPaymentTransaction.userId,
                arbonPaidAt: new Date(),
              } as any,
            });
            console.log('DB UPDATE SUCCESS: Product', holdPaymentTransaction.productId, 'status set to PAID');
          });

          // Trigger email/PDF generation
          console.log(
            'ARBON_DEPOSIT Authorization successful, triggering contract generation...',
          );
          await this.sendArbonContractEmails(
            holdPaymentTransaction,
            holdPaymentTransaction.product,
          );
          break;
        }

        // Handle Auction Holds
        switch (holdPaymentTransaction.type) {
          case PaymentType.BIDDER_DEPOSIT:
            console.log('Webhook BIDDER_DEPOSIT ...');

            // await this.prismaService.$transaction([
            //   // Update payment transaction
            //   this.prismaService.payment.update({
            //     where: { paymentIntentId: paymentIntent.id },
            //     data: { status: PaymentStatus.HOLD },
            //   }),

            //   // Join user to auction

            //   this.prismaService.joinedAuction.create({
            //     data: {
            //       userId: holdPaymentTransaction.userId,
            //       auctionId: holdPaymentTransaction.auctionId,
            //     },
            //   }),

            //   // Create bid for user
            //   this.prismaService.bids.create({
            //     data: {
            //       userId: holdPaymentTransaction.userId,
            //       auctionId: holdPaymentTransaction.auctionId,
            //       amount: paymentIntent.metadata.bidAmount,
            //     },
            //   }),
            // ]);

            await this.prismaService.$transaction(async (prisma) => {
              // Update payment transaction
              await prisma.payment.update({
                where: { paymentIntentId: paymentIntent.id },
                data: { status: PaymentStatus.HOLD },
              });

              // Join user to auction
              const existing = await prisma.joinedAuction.findFirst({
                where: {
                  userId: holdPaymentTransaction.userId,
                  auctionId: holdPaymentTransaction.auctionId,
                },
              });
              if (!existing) {
                await prisma.joinedAuction.create({
                  data: {
                    userId: holdPaymentTransaction.userId,
                    auctionId: holdPaymentTransaction.auctionId,
                  },
                });
              }

              // Create bid for user
              await prisma.bids.create({
                data: {
                  userId: holdPaymentTransaction.userId,
                  auctionId: holdPaymentTransaction.auctionId,
                  amount: paymentIntent.metadata.bidAmount,
                },
              });
            });

            console.log('call notieceTheSellerToCompleteThePayment1');

            const sellerPayment = holdPaymentTransaction.auction.Payment;
            if (
              holdPaymentTransaction.auction.product.categoryId === 4 &&
              Number(holdPaymentTransaction.auction.startBidAmount) < 5000 &&
              paymentIntent.metadata.bidAmount >= 5000 &&
              sellerPayment.length === 0
            ) {
              console.log('call notieceTheSellerToCompleteThePayment2');

              this.notieceTheSellerToCompleteThePayment(
                holdPaymentTransaction.auction.user,
                holdPaymentTransaction.auction,
              );
            }
            const joinedBidders = await this.prismaService.bids.findMany({
              where: {
                auctionId: holdPaymentTransaction.auctionId,
              },
              include: {
                user: true,
                auction: {
                  include: {
                    product: { include: { images: true } },
                    user: true,
                    bids: {
                      include: { user: true },
                      orderBy: { amount: 'desc' },
                    },
                  },
                },
              },
              orderBy: {
                id: 'desc',
              },
            });
            this.auctionGateway.increaseBid(joinedBidders[0].auction);
            // emit to all biders using socket instance
            this.bidsWebSocketGateway.userSubmitBidEventHandler(
              joinedBidders[0].auctionId,
              new Prisma.Decimal(paymentIntent.metadata.bidAmount),
              joinedBidders[0].auction.bids.length,
            );
            const auctionEndDate = new Date(
              holdPaymentTransaction.auction.expiryDate,
            );
            const formattedEndDate = auctionEndDate.toISOString().split('T')[0];
            const formattedEndTime = auctionEndDate.toTimeString().slice(0, 5);
            const emailBodyToSeller = {
              subject: '🎉 Exciting News: Your Auction Just Got Its First Bid!',
              title: 'Your Auction is Officially in Motion!',
              Product_Name: holdPaymentTransaction.auction.product.title,
              img: holdPaymentTransaction.auction.product.images[0].imageLink,
              userName: `${holdPaymentTransaction.auction.user.userName}`,
              message1: ` 
                  <p>Congratulations! Your auction ${
                    holdPaymentTransaction.auction.product.title
                  } has received its first bid! This is an exciting milestone, and the competition has officially begun.</p>
                  <p>Here’s the latest update:</p>
                  <ul>
                  <li>First Bid Amount: ${
                    joinedBidders[joinedBidders.length - 1].amount
                  }</li>
                  <li>Bidder’s Username: ${
                    joinedBidders[joinedBidders.length - 1].user.userName
                  } </li>
                    <li>Auction Ends: ${formattedEndDate} & ${formattedEndTime} </li>
                  </ul>
                     <p>This is just the beginning—more bidders could be on their way!<p>       
                    <h3>What can you do now?</h3>
                      <ul>
                  <li>Share your auction to attract even more bids.</li>
                  <li>Keep an eye on the activity to stay informed about the progress.</li>
                  </ul>
                  `,
              message2: ` 
                               <p>Thank you for choosing <b>Alletre</b>. We can’t wait to see how this unfolds!</p>
                  
             
                               <p style="margin-bottom: 0;">Good luck,</p>
                              <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                              <p>P.S. Stay tuned for more updates as your auction gains momentum.</p>`,
              Button_text: 'View My Auction ',
              Button_URL: `https://www.alletre.com/alletre/home/${holdPaymentTransaction.auctionId}/details`,
            };

            const emailBodyToSecondLastBidder = {
              subject: 'You have been outbid! 🔥 Don’t Let This Slip Away!',
              title: 'Your Bid Just Got Beaten!',
              Product_Name: holdPaymentTransaction.auction.product.title,
              img: holdPaymentTransaction.auction.product.images[0],
              userName: `${joinedBidders[1]?.user.userName}`,
              message1: ` 
                  <p>Exciting things are happening on ${
                    holdPaymentTransaction.auction.product.title
                  }! Unfortunately, someone has just placed a higher bid, and you're no longer in the lead.</p>
                  <p>Here’s the current standing:</p>
                  <ul>
                  <li> Current Highest Bid: ${
                    joinedBidders.length > 1
                      ? joinedBidders[0].amount
                      : 'No bids yet'
                  }</li>
                  <li>Your Last Bid: ${joinedBidders[1]?.amount}  </li>
                
                  </ul>
                     <p>Don’t miss your chance to claim this one-of-a-kind ${
                       holdPaymentTransaction.auction.product.title
                     } . The clock is ticking, and every second counts!</p>       
                     <p><b>Reclaim Your Spot as the Top Bidder Now!</b></p>
                  `,
              message2: ` 
                               <p>Stay ahead of the competition and secure your win!</p>
                  
             
                               <p style="margin-bottom: 0;">Good luck,</p>
                              <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                              <p>P.S. Stay tuned for updates—we’ll let you know if there’s more action on this auction.</p>`,
              Button_text: 'Place a Higher Bid',
              Button_URL: `https://www.alletre.com/alletre/home/${holdPaymentTransaction.auctionId}/details`,
            };

            console.log('joinedBidders1111111111111', joinedBidders);
            if (joinedBidders.length === 1) {
              this.emailService.sendEmail(
                joinedBidders[0].auction.user.email,
                'token',
                EmailsType.OTHER,
                emailBodyToSeller,
              );
            }
            const whatsappBodyToSeller = {
              1: `${holdPaymentTransaction.user.userName}`,
              2: `Congratulations! Your auction *${holdPaymentTransaction.auction.product.title}* has received its first bid! This is an exciting milestone, and the competition has officially begun`,
              3: `*First Bid Amount:* ${
                joinedBidders[joinedBidders.length - 1].amount
              }`,
              4: `*Bidder Username:* ${
                joinedBidders[joinedBidders.length - 1].user.userName
              } `,
              5: `*Auction Ends: ${formattedEndDate} & ${formattedEndTime}`,
              6: `*This is just the beginning—more bidders could be on their way!*`,
              7: `Please visit Now to see my auctions`,
              8: holdPaymentTransaction.auction.product.images[0].imageLink,
              9: `https://www.alletre.com/alletre/home/${holdPaymentTransaction.auctionId}/details`,
            };
            if (holdPaymentTransaction.auction.user.phone) {
              await this.whatsappService.sendOtherUtilityMessages(
                whatsappBodyToSeller,
                holdPaymentTransaction.user.phone,
                'alletre_common_utility_templet',
              );
            }
            if (joinedBidders[1]) {
              console.log('joinedBidders222222', joinedBidders[1]);
              this.emailService.sendEmail(
                joinedBidders[1].user.email,
                'token',
                EmailsType.OTHER,
                emailBodyToSecondLastBidder,
              );
              const whatsappBodyTosecondLastBidders = {
                1: `${joinedBidders[1].user.userName}`,
                2: `Exciting things are happening on *${holdPaymentTransaction.auction.product.title}* ! Unfortunately, someone has just placed a higher bid, and you're no longer in the lead`,
                3: `* Current Highest Bid:* ${
                  joinedBidders.length > 1
                    ? joinedBidders[0].amount
                    : 'No bids yet'
                }`,
                4: `*Your Last Bid*: ${joinedBidders[1]?.amount}`,
                5: `*Auction Ends: ${formattedEndDate} & ${formattedEndTime}`,
                6: `Do not miss your chance to claim this one-of-a-kind *${holdPaymentTransaction.auction.product.title}* . The clock is ticking, and every second counts!`,
                7: `Please visit Now to reclaim Your Spot as the Top Bidder Now!`,
                8: holdPaymentTransaction.auction.product.images[0].imageLink,
                9: `https://www.alletre.com/alletre/home/${holdPaymentTransaction.auctionId}/details`,
              };
              if (joinedBidders[1].user.phone) {
                await this.whatsappService.sendOtherUtilityMessages(
                  whatsappBodyTosecondLastBidders,
                  joinedBidders[1].user.phone,
                  'alletre_common_utility_templet',
                );
              }
            }

            // create notification for seller
            const auction = holdPaymentTransaction.auction;
            const isCreateNotificationToSeller =
              await this.prismaService.notification.create({
                data: {
                  userId: holdPaymentTransaction.auction.user.id,
                  message: `Mr. ${holdPaymentTransaction.user.userName} has placed a new bid on your auction for the product "${holdPaymentTransaction.auction.product.title}" (Model: ${holdPaymentTransaction.auction.product.model}).`,
                  imageLink: auction.product.images[0].imageLink,
                  productTitle: auction.product.title,
                  auctionId: holdPaymentTransaction.auctionId,
                },
              });

            const isCreateNotificationToCurrentBidder =
              await this.prismaService.notification.create({
                data: {
                  userId: holdPaymentTransaction.userId,
                  message: `You have successfully placed a bid on the product "${holdPaymentTransaction.auction.product.title}" (Model: ${holdPaymentTransaction.auction.product.model}).`,
                  imageLink: auction.product.images[0].imageLink,
                  productTitle: auction.product.title,
                  auctionId: holdPaymentTransaction.auctionId,
                },
              });

            if (isCreateNotificationToSeller) {
              // Send notification to seller
              const sellerUserId = holdPaymentTransaction.auction.user.id;

              const notification = {
                status: 'ON_BIDDING',
                userType: 'FOR_SELLER',
                usersId: sellerUserId,
                message: isCreateNotificationToSeller.message,
                imageLink: auction.product.images[0].imageLink,
                productTitle: auction.product.title,
                auctionId: isCreateNotificationToSeller.auctionId,
              };
              try {
                this.notificationsService.sendNotificationToSpecificUsers(
                  notification,
                );
              } catch (error) {
                console.log('sendNotificationToSpecificUsers error', error);
              }
            }

            if (isCreateNotificationToCurrentBidder) {
              try {
                // Send notification to bidder
                const currentBidderId = holdPaymentTransaction.userId;

                const notification = {
                  status: 'ON_BIDDING',
                  userType: 'CURRENT_BIDDER',
                  usersId: currentBidderId,
                  message: isCreateNotificationToCurrentBidder.message,
                  imageLink: auction.product.images[0].imageLink,
                  productTitle: auction.product.title,
                  auctionId: isCreateNotificationToCurrentBidder.auctionId,
                };
                this.notificationsService.sendNotificationToSpecificUsers(
                  notification,
                );

                // Send notification other bidders
                const currentUserId = holdPaymentTransaction.userId;
                const joinedAuctionUsers =
                  await this.notificationsService.getAllJoinedAuctionUsers(
                    holdPaymentTransaction.auctionId,
                    currentUserId,
                  );
                const imageLink = auction.product.images[0].imageLink;
                const productTitle = auction.product.title;
                const otherBidderMessage = `${holdPaymentTransaction.user.userName} has placed a bid of AED ${paymentIntent.metadata.bidAmount} on the product "${holdPaymentTransaction.auction.product.title}" (Model: ${holdPaymentTransaction.auction.product.model}).`;
                const isBidders = true;
                await this.notificationsService.sendNotifications(
                  joinedAuctionUsers,
                  otherBidderMessage,
                  imageLink,
                  productTitle,
                  holdPaymentTransaction.auctionId,
                  isBidders,
                );
              } catch (error) {
                console.log('sendNotificationToSpecificUsers error', error);
              }
            }

            break;
          case PaymentType.SELLER_DEPOSIT:
            console.log('Webhook SELLER_DEPOSIT ...');

            // Update Auction

            // Update payment transaction
            await this.prismaService.payment.update({
              where: { paymentIntentId: paymentIntent.id },
              data: { status: PaymentStatus.HOLD },
            });

            await this.publishAuction(
              holdPaymentTransaction.auctionId,
              holdPaymentTransaction.auction.user.email,
            );
            if (holdPaymentTransaction.auction.type !== 'SCHEDULED') {
              await this.prismaService.notification.create({
                data: {
                  userId: holdPaymentTransaction.userId,
                  message:
                    'Congratulations! Your auction has been published successfully.',
                  imageLink:
                    holdPaymentTransaction.auction.product.images[0].imageLink,
                  productTitle: holdPaymentTransaction.auction.product.title,
                  auctionId: holdPaymentTransaction.auctionId,
                },
              });
              const currentUserId = holdPaymentTransaction.userId;
              const usersId =
                await this.notificationsService.getAllRegisteredUsers(
                  currentUserId,
                );
              const imageLink =
                holdPaymentTransaction.auction.product.images[0].imageLink;
              const productTitle = holdPaymentTransaction.auction.product.title;
              const message = 'New Auction has been published.';
              const isBidders = false;
              await this.notificationsService.sendNotifications(
                usersId,
                message,
                imageLink,
                productTitle,
                holdPaymentTransaction.auctionId,
                isBidders,
              );
            }

            break;
          default:
            break;
        }
        break;

      //==============================================================
      case PaymentStatus.SUCCESS:
        const auctionPaymentTransaction =
          await this.prismaService.payment.findUnique({
            where: { paymentIntentId: paymentIntent.id },
            include: {
              auction: {
                include: {
                  product: { include: { images: true } },
                  user: true,
                  bids: true,
                  Payment: { where: { type: 'SELLER_DEPOSIT' } },
                },
              },
              user: true,
            },
          });
        console.log(
          'auctionPaymentTransaction :',
          auctionPaymentTransaction,
          paymentIntent,
        );
        console.log(
          'EXACT TYPE CHECK:',
          `|${auctionPaymentTransaction.type}|`,
          'LENGTH:',
          auctionPaymentTransaction.type?.length,
        );
        console.log('Webhook SUCCESS: Handling payment type:', auctionPaymentTransaction.type);
        const successPType = auctionPaymentTransaction.type;
        switch (successPType) {
          case PaymentType.ARBON_DEPOSIT:
            try {
              console.log(
                'HANDLING ARBON_DEPOSIT WEBHOOK (TOP)...',
                paymentIntent.id,
              );
              const arbonPayment: any =
                await this.prismaService.payment.findUnique({
                  where: { paymentIntentId: paymentIntent.id },
                  include: {
                    user: true,
                    product: { include: { images: true, user: true } },
                  } as any,
                });

              console.log(
                'ARBON PAYMENT RECORD FOUND:',
                arbonPayment?.id,
                'PRODUCT ID:',
                arbonPayment?.productId,
              );

              if (arbonPayment && arbonPayment.product) {
                const product: any = arbonPayment.product;
                console.log('UPDATING PRODUCT STATUS TO PAID...');

                await this.prismaService.product.update({
                  where: { id: product.id },
                  data: {
                    arbonStatus: ArbonStatus.PAID,
                    arbonBuyerId: arbonPayment.userId,
                    arbonPaidAt: new Date(),
                  } as any,
                });
                console.log('PRODUCT STATUS UPDATED SUCCESSFULLY IN DB.');

                // Generate and send contracts via email
                await this.sendArbonContractEmails(arbonPayment, product);

                // Update Payment status
                console.log('UPDATING PAYMENT RECORD STATUS TO SUCCESS...');
                await this.prismaService.payment.update({
                  where: { id: arbonPayment.id },
                  data: { status: PaymentStatus.SUCCESS },
                });
                console.log('PAYMENT RECORD UPDATED SUCCESSFULLY.');
              } else {
                console.log('ARBON PAYMENT OR PRODUCT NOT FOUND!');
              }
              console.log('ARBON_DEPOSIT WEBHOOK HANDLING FINISHED.');
            } catch (outerError) {
              console.error(
                'FATAL ERROR IN ARBON_DEPOSIT WEBHOOK:',
                outerError,
              );
            }
            break;

          case PaymentType.BIDDER_DEPOSIT:
            try {
              console.log('Webhook BIDDER_DEPOSIT ...');

              await this.prismaService.$transaction([
                // Update payment transaction
                this.prismaService.payment.update({
                  where: { paymentIntentId: paymentIntent.id },
                  data: { status: PaymentStatus.SUCCESS },
                }),
              ]);
            } catch (error) {
              console.error('ERROR IN BIDDER_DEPOSIT WEBHOOK:', error);
            }
            break;

          case PaymentType.SELLER_DEPOSIT:
            try {
              console.log('Webhook SELLER_DEPOSIT ...');

              await this.prismaService.$transaction(async (tx) => {
                const sellerPayment = await tx.payment.update({
                  where: { paymentIntentId: paymentIntent.id },
                  data: { status: PaymentStatus.SUCCESS },
                });

                const existingWalletTransaction =
                  await tx.alletreWallet.findFirst({
                    where: {
                      userId: sellerPayment.userId,
                      auctionId: sellerPayment.auctionId,
                      amount: Number(sellerPayment.amount),
                      transactionType: WalletTransactionType.By_AUCTION,
                      status: WalletStatus.DEPOSIT,
                      transactionReference: sellerPayment.paymentIntentId,
                    },
                  });

                if (!existingWalletTransaction) {
                  const lastBalanceOfAlletre =
                    await this.walletService.findLastTransactionOfAlletre();

                  const alletreWalletData = {
                    status: WalletStatus.DEPOSIT,
                    transactionType: WalletTransactionType.By_AUCTION,
                    description: `Seller security payment to create new auction.`,
                    amount: Number(sellerPayment.amount),
                    auctionId: Number(sellerPayment.auctionId),
                    transactionReference: sellerPayment.paymentIntentId,
                    balance: lastBalanceOfAlletre
                      ? Number(lastBalanceOfAlletre) +
                        Number(sellerPayment.amount)
                      : Number(sellerPayment.amount),
                  };

                  const roundedAmount = Number(
                    Number(alletreWalletData.amount).toFixed(2),
                  );
                  const roundedBalance = Number(
                    Number(alletreWalletData.balance).toFixed(2),
                  );

                  await tx.alletreWallet.create({
                    data: {
                      userId: sellerPayment.userId,
                      description: alletreWalletData.description,
                      amount: roundedAmount,
                      status: alletreWalletData.status,
                      transactionType: alletreWalletData.transactionType,
                      auctionId: alletreWalletData.auctionId,
                      balance: roundedBalance,
                      transactionReference:
                        alletreWalletData?.transactionReference,
                    },
                  });
                } else {
                  console.log('Skipping duplicate wallet transaction...');
                }
              });

              if (auctionPaymentTransaction.auction.status !== 'ACTIVE') {
                await this.publishAuction(
                  auctionPaymentTransaction.auctionId,
                  auctionPaymentTransaction.auction.user.email,
                );
              }
              if (auctionPaymentTransaction.auction.type !== 'SCHEDULED') {
                await this.prismaService.notification.create({
                  data: {
                    userId: auctionPaymentTransaction.userId,
                    message:
                      'Congratulations! Your auction has been published successfully.',
                    imageLink:
                      auctionPaymentTransaction.auction.product.images[0]
                        .imageLink,
                    productTitle:
                      auctionPaymentTransaction.auction.product.title,
                    auctionId: auctionPaymentTransaction.auctionId,
                  },
                });
                const currentUserId = auctionPaymentTransaction.userId;
                const usersId =
                  await this.notificationsService.getAllRegisteredUsers(
                    currentUserId,
                  );
                const imageLink =
                  auctionPaymentTransaction.auction.product.images[0].imageLink;
                const productTitle =
                  auctionPaymentTransaction.auction.product.title;
                const message = 'New Auction has been published.';
                const isBidders = false;
                await this.notificationsService.sendNotifications(
                  usersId,
                  message,
                  imageLink,
                  productTitle,
                  auctionPaymentTransaction.auctionId,
                  isBidders,
                );
              }
            } catch (error) {
              console.error('ERROR IN SELLER_DEPOSIT WEBHOOK:', error);
            }
            break;

          case PaymentType.AUCTION_PURCHASE:
            console.log('Webhook AUCTION_PURCHASE ...');

            const joinedAuction =
              await this.prismaService.joinedAuction.findFirst({
                where: {
                  userId: auctionPaymentTransaction.userId,
                  auctionId: auctionPaymentTransaction.auctionId,
                },
                include: {
                  user: true,
                },
              });

            const { paymentSuccessData } =
              await this.prismaService.$transaction(async (prisma) => {
                // Update payment transaction

                const paymentSuccessData = await prisma.payment.update({
                  where: { paymentIntentId: paymentIntent.id },
                  data: { status: PaymentStatus.SUCCESS },
                  include: {
                    auction: {
                      include: {
                        product: { include: { images: true } },
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

                // Update joinedAuction for bidder to WAITING_DELIVERY
                await prisma.joinedAuction.update({
                  where: { id: joinedAuction.id },
                  data: {
                    status: JoinedAuctionStatus.WAITING_FOR_DELIVERY,
                  },
                });

                // Update auction status to sold
                await prisma.auction.update({
                  where: { id: auctionPaymentTransaction.auctionId },
                  data: { status: AuctionStatus.SOLD },
                });

                return { paymentSuccessData };
              });

            if (paymentSuccessData) {
              const isPaymentAddedToAdminWallet =
                await this.prismaService.alletreWallet.findFirst({
                  where: {
                    transactionReference: paymentSuccessData.paymentIntentId,
                  },
                });

              if (isPaymentAddedToAdminWallet) {
                console.warn(
                  `Duplicate payment webhook received. Skipping wallet update for paymentIntentId: ${paymentSuccessData.paymentIntentId}`,
                );
                return;
              }

              const userId = auctionPaymentTransaction.userId;
              const auctionId = auctionPaymentTransaction.auctionId;
              const winnerSecurityDepositData =
                await this.prismaService.payment.findFirst({
                  where: {
                    userId,
                    auctionId,
                    status: { in: [PaymentStatus.SUCCESS, PaymentStatus.HOLD] },
                    type: PaymentType.BIDDER_DEPOSIT,
                  },
                });

              const lastBalanceOfAlletre =
                await this.walletService.findLastTransactionOfAlletre();
              const baseValue = Number(paymentSuccessData.amount);

              const {
                amountToAlletteWalletInTheStripeWEBHOOK,
                payingAmountWithStripeAndAlletreFees,
              } = this.calculateWinnerPaymentAmount(
                baseValue,
                winnerSecurityDepositData
                  ? Number(winnerSecurityDepositData.amount)
                  : 0,
              );

              const amountToAlletteWalletAfterStripeDeduction =
                amountToAlletteWalletInTheStripeWEBHOOK;

              const alletreWalletData = {
                status: WalletStatus.DEPOSIT,
                transactionType: WalletTransactionType.By_AUCTION,
                description: `Complete Payment of winner bidder  ( paying amount  before stripe stripe deduction ${payingAmountWithStripeAndAlletreFees})`,
                amount: Number(amountToAlletteWalletAfterStripeDeduction),
                auctionId: Number(paymentSuccessData.auctionId),
                transactionReference: paymentSuccessData.paymentIntentId,
                balance: lastBalanceOfAlletre
                  ? Number(lastBalanceOfAlletre) +
                    Number(amountToAlletteWalletAfterStripeDeduction)
                  : Number(amountToAlletteWalletAfterStripeDeduction),
              };

              await this.walletService.addToAlletreWallet(
                paymentSuccessData.userId,
                alletreWalletData,
              );

              //here need send the back the security deposit of winner
              // const winnedBidderDepositPaymentData =
              //   await this.getAuctionPaymentTransaction(
              //     paymentSuccessData.userId,
              //     paymentSuccessData.auctionId,
              //     PaymentType.BIDDER_DEPOSIT,
              //   );

              // if (
              //   !winnedBidderDepositPaymentData.isWalletPayment &&
              //   winnedBidderDepositPaymentData.paymentIntentId
              // ) {
              //   try {
              //     const is_SD_SendBackToWinner =
              //       await this.stripeService.cancelDepositPaymentIntent(
              //         winnedBidderDepositPaymentData.paymentIntentId,
              //       );
              //     if (is_SD_SendBackToWinner) {
              //       console.log('SD send back to winner - stripe');
              //     }
              //   } catch (error) {
              //     console.error(
              //       'Error when sending back SD  for winning bidder:',
              //       error,
              //     );
              //   }
              // } else
              //  {
              //   try {
              //     //finding the last transaction balance of the winner
              //     const lastWalletTransactionBalanceOfWinner =
              //       await this.walletService.findLastTransaction(
              //         winnedBidderDepositPaymentData.userId,
              //       );
              //     //finding the last transaction balance of the alletreWallet
              //     const lastBalanceOfAlletre =
              //       await this.walletService.findLastTransactionOfAlletre();
              //     //wallet data for the winner bidder
              //     const BidderWalletData = {
              //       status: WalletStatus.DEPOSIT,
              //       transactionType: WalletTransactionType.By_AUCTION,
              //       description: `Return security deposit after auction win`,
              //       amount: Number(winnedBidderDepositPaymentData.amount),
              //       auctionId: Number(winnedBidderDepositPaymentData.auctionId),
              //       balance: lastWalletTransactionBalanceOfWinner
              //         ? Number(lastWalletTransactionBalanceOfWinner) +
              //           Number(winnedBidderDepositPaymentData.amount)
              //         : Number(winnedBidderDepositPaymentData.amount),
              //     };
              //     // wallet data for deposit to alletre wallet

              //     const alletreWalletData = {
              //       status: WalletStatus.WITHDRAWAL,
              //       transactionType: WalletTransactionType.By_AUCTION,
              //       description: `Return of bidder security deposit after aution win`,
              //       amount: Number(winnedBidderDepositPaymentData.amount),
              //       auctionId: Number(winnedBidderDepositPaymentData.auctionId),
              //       balance:
              //         Number(lastBalanceOfAlletre) -
              //         Number(winnedBidderDepositPaymentData.amount),
              //     };
              //     await this.walletService.create(
              //       winnedBidderDepositPaymentData.userId,
              //       BidderWalletData,
              //     );
              //     //crete new transaction in alletre wallet
              //     await this.walletService.addToAlletreWallet(
              //       winnedBidderDepositPaymentData.userId,
              //       alletreWalletData,
              //     );
              //   } catch (error) {
              //     console.error(
              //       'Error when sending back SD  for winning bidder:',
              //       error,
              //     );
              //   }
              // }
              // when the winner pays the full amount - to seller
              const emailBodyToSeller = {
                subject: '🎉 Payment Received! Next Steps for Your Auction',
                title: ' Your Auction Item Has Been Paid For',
                Product_Name: paymentSuccessData.auction.product.title,
                img: paymentSuccessData.auction.product.images[0].imageLink,
                userName: `${paymentSuccessData.auction.user.userName}`,
                message1: `
                  <p>Great news! The winning bidder for your auction, ${paymentSuccessData.auction.product.title}, has completed the payment in full.</p>
                  <p>Auction Details:</p>
                  <ul>
                    <li>Item: ${paymentSuccessData.auction.product.title}</li>
                    <li>Winning Bid: ${paymentSuccessData.auction.bids[0].amount}</li>
                    <li>Buyer:  ${paymentSuccessData.auction.bids[0].user.userName}</li>
                    <li>Delivery Option Chosen: ${paymentSuccessData.auction.deliveryType}</li>
                    </ul>
                    <h2>What You Need to Do:</h2>
                    <h3>If the buyer chose delivery:</h3>
                    <p>• Our courier will visit your address to collect the item. Please prepare the item for shipment and ensure it’s securely packaged.</p>
                      <h3>If the buyer chose pickup:</h3>
                    <p>• The buyer will visit your address to collect the item. Please ensure they confirm the collection in their account after the item is handed over.</p>
                `,
                message2: `
                  <h3>When Will You Get Paid?</h3>                           
                <p>The winning amount of ${paymentSuccessData.auction.bids[0].amount} will be credited to your wallet after the buyer collects the item and confirms receipt.</p>

                <p>Thank you for choosing <b>Alletre</b>!  We’re thrilled to see your auction succeed and look forward to supporting your future listings!</p>
                
                <p style="margin-bottom: 0;">Best regards,</p>
                <p style="margin-top: 0;">The <b>Alletre</b> Team</p> `,
                Button_text: 'Pickup/Delivery Details ',
                Button_URL:
                  'https://www.alletre.com/alletre/profile/my-bids/pending',
              };
              //send notification to the seller
              const notificationMessageToSeller = ` The winner of your Auction of ${paymentSuccessData.auction.product.title}
                         (Model:${paymentSuccessData.auction.product.model}) has been paid the full amount. 
                         We would like to let you know that you can hand over the item to the winner. once the winner
                         confirmed the delvery, we will send the money to your wallet. If you refuse to hand over the item, 
                         there is a chance to lose your security deposite`;

              const notificationBodyToSeller = {
                status: 'ON_AUCTION_PURCHASE_SUCCESS',
                userType: 'FOR_SELLER',
                usersId: paymentSuccessData.auction.user.id,
                message: notificationMessageToSeller,
                imageLink:
                  paymentSuccessData.auction.product.images[0].imageLink,
                productTitle: paymentSuccessData.auction.product.title,
                auctionId: paymentSuccessData.auctionId,
              };
              console.log('purchase test5');
              let invoicePDF = null;
              try {
                invoicePDF = await generateInvoicePDF(paymentSuccessData);
              } catch (pdfError) {
                console.error(
                  'Invoice PDF Generation failed, sending email without attachment:',
                  pdfError.message || pdfError,
                );
              }

              const attachments = invoicePDF
                ? [{ filename: 'invoice.pdf', content: invoicePDF }]
                : [];

              // const auctionEndDate = new Date(
              //   paymentSuccessData.auction.expiryDate,
              // );
              // const formattedEndTime = auctionEndDate
              //   .toTimeString()
              //   .slice(0, 5);
              // auctionEndDate.setDate(auctionEndDate.getDate() + 3);
              // const PaymentEndDate = auctionEndDate.toISOString().split('T')[0];
              // when the winner pays the full amount - to winner
              const emailBodyToWinner = {
                subject: '🎉 Payment Confirmation and Next Steps',
                title:
                  'Your Payment is Confirmed – Please Confirm Delivery Upon Completion',
                Product_Name: paymentSuccessData.auction.product.title,
                img: paymentSuccessData.auction.product.images[0].imageLink,
                userName: `${paymentSuccessData.auction.bids[0].user.userName}`,
                message1: `
                  <p>We are pleased to inform you that your payment for the auction of <b>${
                    paymentSuccessData.auction.product.title
                  } (Model: ${
                  paymentSuccessData.auction.product.model
                })</b> has been successfully processed. ${
                  invoicePDF
                    ? 'An invoice for this transaction is attached.'
                    : ''
                }</p>
                  <p>Here are the auction details for your reference:</p>
                  <ul>
                    <li><b>Item:</b> ${
                      paymentSuccessData.auction.product.title
                    }</li>
                    <li><b>Winning Bid:</b> ${
                      paymentSuccessData.auction.bids[0].amount
                    }</li>
                    <li><b>Seller:</b> ${
                      paymentSuccessData.auction.user.userName
                    }</li>
                  </ul>
                `,
                message2: `
                  <h3>What’s Next?</h3>
                  <ul>
                    <li>Once the delivery is complete, please confirm the delivery by clicking the <b>"Confirm Delivery"</b> button on the <b>MY Bids</b> page under the section <b>"Waiting for Delivery."</b></li>
                    <li>If you encounter any issues during the process, feel free to contact our support team for assistance.</li>
                  </ul>
                  <p>Thank you for choosing <b>Alle Tre</b>. We truly value your trust and look forward to serving you again.</p>
                  <p style="margin-bottom: 0;">Best regards,</p>
                  <p style="margin-top: 0;">The <b>Alle Tre</b> Team</p>
                `,
                Button_text: 'Go to MY Bids',
                Button_URL:
                  'https://www.alletre.com/alletre/profile/my-bids/waiting-for-delivery',
                attachments: attachments,
              };
              //send notification to the winner
              const notificationMessageToWinner = `We are pleased to inform you that your payment for the auction of ${paymentSuccessData.auction.product.title} (Model: ${paymentSuccessData.auction.product.model}) has been successfully processed.
              To complete the process, please confirm the delivery once it is completed by clicking the "Confirm Delivery" button on the MY Bids page under the section "Waiting for Delivery."
              Thank you for choosing Alle Tre. We truly value your trust in us and look forward to serving you again.`;
              const notificationBodyToWinner = {
                status: 'ON_AUCTION_PURCHASE_SUCCESS',
                userType: 'FOR_WINNER',
                usersId: joinedAuction.userId,
                message: notificationMessageToWinner,
                imageLink:
                  paymentSuccessData.auction.product.images[0].imageLink,
                productTitle: paymentSuccessData.auction.product.title,
                auctionId: paymentSuccessData.auctionId,
              };
              console.log('purchase test5 3');
              await Promise.all([
                this.emailService.sendEmail(
                  paymentSuccessData.auction.user.email,
                  'token',
                  EmailsType.OTHER,
                  emailBodyToSeller,
                ),
                this.emailService.sendEmail(
                  joinedAuction.user.email,
                  'token',
                  EmailsType.OTHER,
                  emailBodyToWinner,
                ),
              ]);

              const whatsappBodyToSeller = {
                1: `${paymentSuccessData.auction.user.userName}`,
                2: `Great news! The winning bidder for your auction, ${paymentSuccessData.auction.product.title}, has completed the payment in full.`,
                3: `*Item:* ${paymentSuccessData.auction.product.title}`,
                4: `*Winning Bid:* ${paymentSuccessData.auction.bids[0].amount} `,
                5: `*Buyer:*  ${paymentSuccessData.auction.bids[0].user.userName}`,
                6: `*Delivery Option Chosen:* ${paymentSuccessData.auction.deliveryType}`,
                7: `*What You Need to Do:* *If the buyer chose delivery:*   Our courier will visit your address to collect the item. Please prepare the item for shipment and ensure it is securely packaged. *If the buyer chose pickup:* The buyer will visit your address to collect the item. Please ensure they confirm the collection in their account after the item is handed over`,
                8: paymentSuccessData.auction.product.images[0].imageLink,
                9: `https://www.alletre.com/alletre/profile/my-bids/pending`,
              };
              if (paymentSuccessData.auction.user.phone) {
                await this.whatsappService.sendOtherUtilityMessages(
                  whatsappBodyToSeller,
                  paymentSuccessData.auction.user.phone,
                  'alletre_common_utility_templet',
                );
              }

              const whatsappBodyToWinner = {
                1: `${paymentSuccessData.auction.bids[0].user.userName}`,
                2: `🎉 Your payment for *${paymentSuccessData.auction.product.title} (${paymentSuccessData.auction.product.model})* has been confirmed.`,
                3: `*Item:* ${paymentSuccessData.auction.product.title}`,
                4: `*Winning Bid:* ${paymentSuccessData.auction.bids[0].amount}`,
                5: `*Seller:* ${paymentSuccessData.auction.user.userName}`,
                6: `📄 An invoice for this transaction is attached in your email for your records.`,
                7: `📝 *Next Steps:* Once you receive your item, please confirm delivery on the *MY Bids* page under *"Waiting for Delivery"*. If you face any issues, our support team is ready to help.`,
                8: paymentSuccessData.auction.product.images[0].imageLink,
                9: `https://www.alletre.com/alletre/profile/my-bids/waiting-for-delivery`,
              };

              if (paymentSuccessData.auction.bids[0].user.phone) {
                await this.whatsappService.sendOtherUtilityMessages(
                  whatsappBodyToWinner,
                  paymentSuccessData.auction.bids[0].user.phone,
                  'alletre_common_utility_templet',
                );
              }
              console.log('purchase test5 4');

              //send notification to the seller
              try {
                const isCreateNotificationToSeller =
                  await this.prismaService.notification.create({
                    data: {
                      userId: paymentSuccessData.auction.user.id,
                      message: notificationBodyToSeller.message,
                      imageLink: notificationBodyToSeller.imageLink,
                      productTitle: notificationBodyToSeller.productTitle,
                      auctionId: notificationBodyToSeller.auctionId,
                    },
                  });
                if (isCreateNotificationToSeller) {
                  this.notificationsService.sendNotificationToSpecificUsers(
                    notificationBodyToSeller,
                  );
                }
              } catch (error) {
                console.log('sendNotificationToSpecificUsers error', error);
              }
              //send notification to the winner
              console.log('purchase test6');
              try {
                const isCreateNotificationToWinner =
                  await this.prismaService.notification.create({
                    data: {
                      userId: joinedAuction.userId,
                      message: notificationBodyToWinner.message,
                      imageLink: notificationBodyToWinner.imageLink,
                      productTitle: notificationBodyToWinner.productTitle,
                      auctionId: notificationBodyToWinner.auctionId,
                    },
                  });
                if (isCreateNotificationToWinner) {
                  this.notificationsService.sendNotificationToSpecificUsers(
                    notificationBodyToWinner,
                  );
                }
              } catch (error) {
                console.log('sendNotificationToSpecificUsers error', error);
              }
              //Notifying delivery request to admin
              this.adminGateway.emitEventToAdmins(
                'delivery:newNotification',
                paymentSuccessData,
              );
            }
            console.log('purchase test7');
            break;
          case PaymentType.BUY_NOW_PURCHASE:
            console.log('Webhook BUY_NOW_PURCHASE ...');

            // await this.prismaService.$transaction([
            //   // Update payment transaction
            //   this.prismaService.payment.update({
            //     where: { paymentIntentId: paymentIntent.id },
            //     data: { status: PaymentStatus.SUCCESS },
            //   }),

            //   // Update auction status to sold
            //   this.prismaService.auction.update({
            //     where: { id: auctionPaymentTransaction.auctionId },
            //     data: { status: AuctionStatus.SOLD },
            //   }),
            // ]);

            const { isPaymentSuccess } = await this.prismaService.$transaction(
              async (prisma) => {
                // Update payment transaction
                console.log('operation 1 started');
                const isPaymentSuccess = await prisma.payment.update({
                  where: { paymentIntentId: paymentIntent.id },
                  data: { status: PaymentStatus.SUCCESS },
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
                console.log('operation 1 completed');
                console.log('operation 2 started');
                await prisma.joinedAuction.updateMany({
                  where: {
                    auctionId: auctionPaymentTransaction.auctionId,
                  },
                  data: { status: JoinedAuctionStatus.LOST },
                });
                console.log('operation 2 completed');
                //here i have created the joinedAuction and bids due to there where no
                //funtionalities has implemented to handle the delevery and any other things track
                //item after buy now completed. by creating the joined auction and bids, it will act as normal bids
                //------------------------------------------------------------
                // Join user to auction
                console.log('operation 3 started');

                await prisma.joinedAuction.create({
                  data: {
                    userId: isPaymentSuccess.userId,
                    auctionId: auctionPaymentTransaction.auctionId,
                    status: JoinedAuctionStatus.WAITING_FOR_DELIVERY,
                  },
                });
                console.log('operation 3 completed');

                console.log('operation 4 started');
                // Create bid for user
                await prisma.bids.create({
                  data: {
                    userId: isPaymentSuccess.userId,
                    auctionId: auctionPaymentTransaction.auctionId,
                    amount: isPaymentSuccess.amount,
                  },
                });
                console.log('operation 4 started');

                //------------------------------------------------------------

                // Update auction status to sold
                await prisma.auction.update({
                  where: { id: auctionPaymentTransaction.auctionId },
                  data: { status: AuctionStatus.SOLD },
                });
                console.log('operation 4 completed');
                return { isPaymentSuccess };
              },
              { timeout: 10000 },
            );

            if (isPaymentSuccess) {
              const isPaymentAddedToAdminWallet =
                await this.prismaService.alletreWallet.findFirst({
                  where: {
                    transactionReference: isPaymentSuccess.paymentIntentId,
                  },
                });

              if (isPaymentAddedToAdminWallet) {
                console.warn(
                  `Duplicate payment webhook received. Skipping wallet update for paymentIntentId: ${isPaymentSuccess.paymentIntentId}`,
                );
                return;
              }
              console.log(
                'Buy now payment is success :',
                isPaymentSuccess.user.email,
              );
              // adding the buynow purchase money to alletre wallet for
              const lastWalletTransactionAlletre =
                await this.walletService.findLastTransactionOfAlletre();

              const baseValue = Number(isPaymentSuccess.amount);

              const {
                amountToAlletteWalletInTheStripeWEBHOOK,
                payingAmountWithStripeAndAlletreFees,
              } = this.calculateWinnerPaymentAmount(baseValue);

              // const auctionFee = ((baseValue * 0.5) / 100)
              // const stripeFee = (((baseValue * 3) /100) + 1 )// stripe takes 3% of the base value and additionally 1 dirham
              // const payingAmountWithFees = baseValue + auctionFee
              // const payingAmountWithStripeAndAlletreFees =  (payingAmountWithFees+ stripeFee)
              const amountToAlletteWalletAfterStripeDeduction =
                amountToAlletteWalletInTheStripeWEBHOOK;
              const walletDataToAlletre = {
                status: WalletStatus.DEPOSIT,
                transactionType: WalletTransactionType.By_AUCTION,
                description: `Buy Now purchase amount after deducting the amount of stripe fee ( paying amount  before stripe stripe deduction ${payingAmountWithStripeAndAlletreFees})`,
                amount: Number(amountToAlletteWalletAfterStripeDeduction),
                auctionId: Number(isPaymentSuccess.auctionId),
                transactionReference: isPaymentSuccess.paymentIntentId,
                balance: Number(lastWalletTransactionAlletre)
                  ? Number(lastWalletTransactionAlletre) +
                    Number(amountToAlletteWalletAfterStripeDeduction)
                  : Number(amountToAlletteWalletAfterStripeDeduction),
              };

              await this.walletService.addToAlletreWallet(
                isPaymentSuccess.userId,
                walletDataToAlletre,
              );
              //Email to winner (buy now option used - wallet)
              const invoicePDF = await generateInvoicePDF(isPaymentSuccess);
              const emailBodyToWinner = {
                subject: '🎉 Congratulations! You Won the Auction',
                title: 'Your Bid Was Successful!',
                Product_Name: isPaymentSuccess.auction.product.title,
                img: isPaymentSuccess.auction.product.images[0].imageLink,
                userName: `${isPaymentSuccess.user.userName}`,
                message1: `
                  <p>We’re excited to inform you that you have won the auction for ${isPaymentSuccess.auction.product.title}!</p>
                  <p>Here are the details of your purchase:</p>
                  <ul>
                    <li> Auction Title: ${isPaymentSuccess.auction.product.title}</li>
                    <li> Category: ${isPaymentSuccess.auction.product.category.nameEn}</li>
                    <li> Winning Bid: ${isPaymentSuccess.amount}</li>
                  </ul>
                  <p>Your payment has been processed successfully. An invoice for this transaction is attached to this email for your records.</p>
                `,
                message2: `
                  <h3>What’s Next?</h3>
                  <ul>
                    <li>1. <b>Await Shipment</b>: The seller will ship the item to your provided address soon.</li>
                    <li>2. <b>Track Your Delivery</b>: Once shipped, track your delivery status from your account.</li>
                  </ul>
                  <p>Thank you for choosing <b>Alletre</b>! We hope you enjoy your purchase and look forward to seeing you in future auctions.</p>
                
                   <p style="margin-bottom: 0;">Best regards,</p>
                   <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                   <p>P.S. If you have any questions or need assistance, don’t hesitate to contact our support team.</p>
                `,
                Button_text: 'View My Purchase',
                Button_URL: 'https://www.alletre.com/alletre/profile/purchased',
                attachment: invoicePDF,
              };

              const whatsappBodyToWinnerAuction = {
                1: `${isPaymentSuccess.user.userName}`,
                2: `🎉 Congratulations! You have won the auction for *${isPaymentSuccess.auction.product.title}*!`,
                3: `*Auction Title:* ${isPaymentSuccess.auction.product.title}`,
                4: `*Category:* ${isPaymentSuccess.auction.product.category.nameEn}`,
                5: `*Winning Bid:* ${isPaymentSuccess.amount}`,
                6: `✅ Your payment was successful. Check your email for the invoice.`,
                7: `🚚 *What’s Next:* - *1 - Await Shipment - The seller will ship the item to your address. 2- Track Delivery - You can track delivery status in your account once it is shipped.*`,
                8: isPaymentSuccess.auction.product.images[0].imageLink,
                9: `https://www.alletre.com/alletre/profile/purchased`,
              };
              if (isPaymentSuccess.user.phone) {
                await this.whatsappService.sendOtherUtilityMessages(
                  whatsappBodyToWinnerAuction,
                  isPaymentSuccess.user.phone,
                  'alletre_common_utility_templet',
                );
              }

              const notificationMessageToBuyer = `
              We’re excited to inform you that you have won the auction for ${isPaymentSuccess.auction.product.title}!
              
              Here are the details of your purchase:
              - Auction Title: ${isPaymentSuccess.auction.product.title}
              - Category: ${isPaymentSuccess.auction.product.category.nameEn}
              - Winning Bid: ${isPaymentSuccess.amount}
              
              Your payment has been processed successfully. The seller will ship the item to the address you provided shortly.
              `;

              const notificationBodyToBuyer = {
                status: 'ON_ITEM_BUY_NOW',
                userType: 'FOR_WINNER',
                usersId: isPaymentSuccess.userId,
                message: notificationMessageToBuyer,
                imageLink: isPaymentSuccess.auction.product.images[0].imageLink,
                productTitle: isPaymentSuccess.auction.product.title,
                auctionId: isPaymentSuccess.auctionId,
              };
              const createBuyerNotificationData =
                await this.prismaService.notification.create({
                  data: {
                    userId: isPaymentSuccess.userId,
                    message: notificationBodyToBuyer.message,
                    imageLink: notificationBodyToBuyer.imageLink,
                    productTitle: notificationBodyToBuyer.productTitle,
                    auctionId: isPaymentSuccess.auctionId,
                  },
                });
              if (createBuyerNotificationData) {
                try {
                  this.notificationsService.sendNotificationToSpecificUsers(
                    notificationBodyToBuyer,
                  );
                } catch (error) {
                  console.log('sendNotificationToSpecificUsers error', error);
                }
              }
              await this.emailService.sendEmail(
                isPaymentSuccess.user.email,
                'token',
                EmailsType.OTHER,
                emailBodyToWinner,
              );

              //check is there any bidders on this auction
              const auctionPaymentData =
                await this.prismaService.payment.findMany({
                  where: { auctionId: auctionPaymentTransaction.auctionId },
                  include: {
                    user: true,
                    auction: {
                      include: {
                        bids: {
                          include: { user: true },
                          orderBy: { amount: 'desc' },
                        },
                        product: {
                          include: { images: true, category: true },
                        },
                        user: true,
                      },
                    },
                  },
                });
              console.log('auctionPaymentData', auctionPaymentData);
              // await Promise.all(
              //   auctionPaymentData.map(async (payment) =>
              for (const payment of auctionPaymentData) {
                if (payment.type === 'BIDDER_DEPOSIT') {
                  let is_SD_SendBackToBidder = false;
                  if (payment.isWalletPayment) {
                    //implement return security deposit funconality to wallet of bidders
                    //finding the last transaction balance of the Seller
                    const lastWalletTransactionBalanceOfBidder =
                      await this.walletService.findLastTransaction(
                        payment.user.id,
                      );
                    //finding the last transaction balance of the alletreWallet
                    const lastBalanceOfAlletre =
                      await this.walletService.findLastTransactionOfAlletre();

                    //wallet data for deposit to bidder wallet
                    const bidderWalletData = {
                      status: WalletStatus.DEPOSIT,
                      transactionType: WalletTransactionType.By_AUCTION,
                      description: `Return security deposite, Auction ended; item purchased via Buy Now option.`,
                      amount: Number(payment.amount),
                      auctionId: Number(payment.auctionId),
                      balance: Number(lastWalletTransactionBalanceOfBidder)
                        ? Number(lastWalletTransactionBalanceOfBidder) +
                          Number(payment.amount)
                        : Number(payment.amount),
                    };
                    // wallet data for WITHDRAWAL to alletre wallet

                    const alletreWalletData = {
                      status: WalletStatus.WITHDRAWAL,
                      transactionType: WalletTransactionType.By_AUCTION,
                      description: `Return security deposite, Auction ended; item purchased via Buy Now option.`,
                      amount: Number(payment.amount),
                      auctionId: Number(payment.auctionId),
                      balance:
                        Number(lastBalanceOfAlletre) - Number(payment.amount),
                    };
                    //crete new transaction in bidder wallet
                    const bidderWalletReuslt = await this.walletService.create(
                      payment.user.id,
                      bidderWalletData,
                    );
                    //crete new transaction in alletre wallet
                    const alletreWalletResult =
                      await this.walletService.addToAlletreWallet(
                        payment.user.id,
                        alletreWalletData,
                      );
                    if (bidderWalletReuslt && alletreWalletResult)
                      is_SD_SendBackToBidder = true;
                  } else {
                    //implement return security deposit funconality to stripe of bidders
                    const isPaymentIntentCancelled =
                      await this.stripeService.cancelDepositPaymentIntent(
                        payment.paymentIntentId,
                      );
                    if (isPaymentIntentCancelled) is_SD_SendBackToBidder = true;
                  }
                  if (is_SD_SendBackToBidder) {
                    //Email to lost bidder (buy now option used - stripe)
                    const emailBodyToLostBidders = {
                      subject: '⏳ Auction Ended – You Missed Out!',
                      title: 'The Auction Has Closed',
                      Product_Name: payment.auction.product.title,
                      img: payment.auction.product.images[0].imageLink,
                      userName: `${payment.user.userName}`,
                      message1: `
                          <p>The auction for ${payment.auction.product.title} has ended, and unfortunately, your bid didn’t win this time.</p>
                          <p>Here’s a quick recap:</p>
                          <ul>
                            <li> Auction Title: ${payment.auction.product.title}</li>
                            <li> Category: ${payment.auction.product.category.nameEn}</li>
                            <li> Winning Bid: ${payment.auction.bids[0].amount}</li>
                            <li> Winner: ${payment.auction.bids[0].user.userName}</li>
                          </ul>
                          <p>We know it’s disappointing, but there are always more exciting auctions to explore on <b>Alletre</b>.</p>
                        `,
                      message2: `
                          <h3>What’s Next?</h3>
                          <ul>
                            <li>1. <b>Explore More Auctions</b>: Browse our platform for more items you’ll love.</li>
                            <li>2. <b>Bid Smarter</b>: Use the “Buy Now” feature or set higher auto-bids to secure your favorite items next time.</li>
                          </ul>
                          <p>Thank you for participating in the auction. We look forward to seeing you in future bids!</p>
                           <p style="margin-bottom: 0;">Best regards,</p>
                       <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                          <p>P.S. If you have any questions or need assistance, don’t hesitate to contact our support team.</p>
                        `,
                      Button_text: 'Browse Auctions',
                      Button_URL: 'https://www.alletre.com/alletre/home/',
                    };
                    const whatsappBodyToLostBidders = {
                      1: `${payment.user.userName}`,
                      2: `The auction for *${payment.auction.product.title}* has ended, and unfortunately, your bid didn’t win this time`,
                      3: `*Auction Title:* ${payment.auction.product.title}`,
                      4: `*Category:* ${payment.auction.product.category.nameEn}`,
                      5: `*Winning Bid:* ${payment.auction.bids[0].amount}`,
                      6: `*Winner:* ${payment.auction.bids[0].user.userName}`,
                      7: `We know it’s disappointing, but there are always more exciting auctions to explore on *Alletre*`,
                      8: payment.auction.product.images[0].imageLink,
                      9: `https://www.alletre.com/alletre/home/`,
                    };
                    if (payment.user.phone) {
                      await this.whatsappService.sendOtherUtilityMessages(
                        whatsappBodyToLostBidders,
                        payment.user.phone,
                        'alletre_common_utility_templet',
                      );
                    }
                    await this.emailService.sendEmail(
                      payment.user.email,
                      'token',
                      EmailsType.OTHER,
                      emailBodyToLostBidders,
                    );

                    const notificationMessageToLosers = `
                      The auction for ${payment.auction.product.title} has ended, and unfortunately, your bid didn’t win this time.
                      
                      Here are the details of your purchase:
                      - Auction Title: ${payment.auction.product.title}
                      - Category: ${payment.auction.product.category.nameEn}
                      - Winning Bid: ${payment.auction.bids[0].amount}
                      - Winner: ${payment.auction.bids[0].user.userName}
                      
                      Your payment has been processed successfully. The seller will ship the item to the address you provided shortly.
                      `;

                    const notificationBodyToLosers = {
                      status: 'ON_ITEM_BUY_NOW',
                      userType: 'FOR_LOSERS',
                      usersId: payment.userId,
                      message: notificationMessageToLosers,
                      imageLink: payment.auction.product.images[0].imageLink,
                      productTitle: payment.auction.product.title,
                      auctionId: payment.auctionId,
                    };
                    const createLosersNotificationData =
                      await this.prismaService.notification.create({
                        data: {
                          userId: payment.userId,
                          message: notificationBodyToLosers.message,
                          imageLink: notificationBodyToLosers.imageLink,
                          productTitle: notificationBodyToLosers.productTitle,
                          auctionId: payment.auctionId,
                        },
                      });
                    if (createLosersNotificationData) {
                      try {
                        this.notificationsService.sendNotificationToSpecificUsers(
                          notificationBodyToLosers,
                        );
                      } catch (error) {
                        console.log(
                          'sendNotificationToSpecificUsers error',
                          error,
                        );
                      }
                    }
                  }
                } else if (payment.type === 'SELLER_DEPOSIT') {
                  //Email to seller (buy now option used - stripe)
                  const emailBodyToSeller = {
                    subject: '🎉 Sold! Your Auction Ended with a Direct Buys',
                    title: 'Congratulations – Your Item Has Been Sold!',
                    Product_Name: payment.auction.product.title,
                    img: payment.auction.product.images[0].imageLink,
                    userName: `${payment.user.userName}`,
                    message1: ` 
                  <p>Great news! Your auction ${payment.auction.product.title}, just ended because a buyer used the <b>Buy now</b> option to purchase your item instantly.</p>
                          <p>Here are the details:</p>
                  <ul>
                  <li>	Auction Title: ${payment.auction.product.title}</li>
                  <li>	Category: ${payment.auction.product.category.nameEn}</li>
                  <li>	Sold For:${payment.auction.bids[0].amount} </li>
                  <li>	Buyer: ${payment.auction.bids[0].user.userName} </li>
                  </ul>
                  <p>The buyer has completed the payment, and the funds will be processed and transferred to your account shortly.</p>             
                  `,
                    message2: ` <h3>What’s Next? </h3>
                  <ul>
                  <li>1.<b>	Ship Your Item</b>: Make sure to package your item securely and ship it to the buyer’s provided address as soon as possible.</li>
                  <li>2.<b> Confirm Shipping</b>:: Update the status in your account once the item has been shipped.</li>
                  </ul>
                  <p>Thank you for choosing <b>Alletre</b>! We’re thrilled to see your success and look forward to helping you with your future auctions.</p>
                     <p style="margin-bottom: 0;">Best regards,</p>
                   <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                              <p>P.S. If you have any questions or need assistance, don’t hesitate to contact our support team.</p>`,
                    Button_text: 'Manage My Sales',
                    Button_URL:
                      ' https://www.alletre.com/alletre/profile/my-auctions/sold',
                  };
                  await this.emailService.sendEmail(
                    payment.user.email,
                    'token',
                    EmailsType.OTHER,
                    emailBodyToSeller,
                  );
                  const whatsappBodyToSellerDirectBuy = {
                    1: `${payment.user.userName}`,
                    2: `🎉 Great news! Your auction item *${payment.auction.product.title}* has been sold instantly through the Buy Now option.`,
                    3: `*Auction Title:* ${payment.auction.product.title}`,
                    4: `*Sold For:* ${payment.auction.bids[0].amount}`,
                    5: `*Buyer:* ${payment.auction.bids[0].user.userName}`,
                    6: `✅ The buyer has completed the payment. The funds will be transferred to your account shortly.`,
                    7: `📦 What is Next: 1. Ship Your Item - Package it securely and ship to the buyer address. 2. Confirm Shipping - Update the status in your account once shipped.`,
                    8: payment.auction.product.images[0].imageLink,
                    9: `https://www.alletre.com/alletre/profile/my-auctions/sold`,
                  };

                  if (payment.user.phone) {
                    await this.whatsappService.sendOtherUtilityMessages(
                      whatsappBodyToSellerDirectBuy,
                      payment.user.phone,
                      'alletre_common_utility_templet',
                    );
                  }

                  const notificationMessageToSeller = `
                    Great news! Your auction ${payment.auction.product.title}, just ended because a buyer used the Buy now option to purchase your item instantly.
                    
                    Here are the details of your purchase:
                    - Auction Title: ${payment.auction.product.title}
                    - Category: ${payment.auction.product.category.nameEn}
                    - Sold For:${payment.auction.bids[0].amount}
                    - Buyer: ${payment.auction.bids[0].user.userName}
                    
                   The buyer has completed the payment, and the funds will be processed and transferred to your account shortly..
                    `;

                  const notificationBodyToSeller = {
                    status: 'ON_ITEM_BUY_NOW',
                    userType: 'FOR_SELLER',
                    usersId: payment.userId,
                    message: notificationMessageToSeller,
                    imageLink: payment.auction.product.images[0].imageLink,
                    productTitle: payment.auction.product.title,
                    auctionId: payment.auctionId,
                  };
                  const createLosersNotificationData =
                    await this.prismaService.notification.create({
                      data: {
                        userId: payment.userId,
                        message: notificationBodyToSeller.message,
                        imageLink: notificationBodyToSeller.imageLink,
                        productTitle: notificationBodyToSeller.productTitle,
                        auctionId: payment.auctionId,
                      },
                    });
                  if (createLosersNotificationData) {
                    try {
                      this.notificationsService.sendNotificationToSpecificUsers(
                        notificationBodyToSeller,
                      );
                    } catch (error) {
                      console.log(
                        'sendNotificationToSpecificUsers error',
                        error,
                      );
                    }
                  }
                }
              }
              // ),);
              //Notifying delivery request to admin
              this.adminGateway.emitEventToAdmins(
                'delivery:newNotification',
                isPaymentSuccess,
              );
              this.auctionGateway.buyNowPurchase(isPaymentSuccess.auctionId);
            } else {
              throw new MethodNotAllowedException(
                'Faild to complete the buy now payment',
              );
            }
            break;

          default:
            console.log(
              'UNHANDLED PAYMENT TYPE:',
              auctionPaymentTransaction.type,
            );
            break;
        }

        break;
      case PaymentStatus.FAILED:
        console.log('Payment Intent Failed ..');
        // Update Payment
        await this.prismaService.payment.update({
          where: { paymentIntentId: paymentIntent.id },
          data: { status: PaymentStatus.FAILED },
        });
        break;
      default:
        break;
    }
  }

  async getAuctionPaymentTransaction(
    userId: number,
    auctionId: number,
    type: PaymentType,
  ) {
    try {
      return await this.prismaService.payment.findFirst({
        where: {
          userId,
          auctionId,
          type: type,
        },
      });
    } catch (error) {
      console.log('get auction payment transaction error :', error);
    }
  }
  async publishAuction(auctionId: number, currentUserEmail?: string) {
    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
    });

    switch (auction.durationUnit) {
      case DurationUnits.DAYS:
        if (auction.type === AuctionType.ON_TIME) {
          // Set ON_TIME Daily auction ACTIVE
          const today = new Date();
          const expiryDate = this.addDays(new Date(), auction.durationInDays);
          const updatedAuction = await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.ACTIVE,
              startDate: today,
              expiryDate: expiryDate,
            },

            include: {
              bids: true,
              user: true,
              product: { include: { images: true, category: true } },
            },
          });
          const auctionEndDate = new Date(updatedAuction.expiryDate);
          const formattedEndDate = auctionEndDate.toISOString().split('T')[0];
          const formattedEndTime = auctionEndDate.toTimeString().slice(0, 5);
          if (updatedAuction) {
            //emiting the new auction to all online users
            this.auctionGateway.listingNewAuction(updatedAuction);

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
                      <li>	Auction Ends: ${formattedEndDate} & ${formattedEndTime} </li>
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
            await this.emailService.sendEmail(
              updatedAuction.user.email,
              'token',
              EmailsType.OTHER,
              emailBodyToSeller,
            );
            const applisxNotificationData = {
              notification_title: `Title : ${updatedAuction.product.title}`,
              notification_body: `Starting Bid: ${updatedAuction.startBidAmount}`,
              open_link_url: `https://www.alletre.com/alletre/home/${updatedAuction.id}/details`,
              notification_image: updatedAuction.product.images[0].imageLink,
            };
            await this.notificationsService.sendPushNotificationToApplixUser(
              applisxNotificationData,
            );
            const whatsappBodyToSellerAuctionLive = {
              1: `${updatedAuction.user.userName}`,
              2: `🎉 Congratulations! Your auction listing *${updatedAuction.product.title}* is now live on Alletre. Buyers can now find and bid on your item.`,
              3: `*Title:* ${updatedAuction.product.title}`,
              4: `*Starting Bid:* ${updatedAuction.startBidAmount}`,
              5: `*Auction Ends:* ${formattedEndDate} & ${formattedEndTime}`,
              6: `🚀 Tip: Share your auction link with friends or on social media to get more visibility.`,
              7: `You can track bids and view your auction anytime.`,
              8: updatedAuction.product.images[0].imageLink,
              9: `https://www.alletre.com/alletre/home/${updatedAuction.id}/details`,
            };

            if (updatedAuction.user.phone) {
              await this.whatsappService.sendOtherUtilityMessages(
                whatsappBodyToSellerAuctionLive,
                updatedAuction.user.phone,
                'alletre_common_utility_templet',
              );
            }

            await this.emailBatchService.sendBulkEmails(
              updatedAuction,
              currentUserEmail,
            );
            //sending whatsapp messages to all users
            await this.whatsappService.sendAuctionToUsers(
              auctionId,
              process.env.NODE_ENV === 'production'
                ? 'EXISTING_USER'
                : 'NON_EXISTING_USER',
            );
          }
        } else if (auction.type === AuctionType.SCHEDULED) {
          // Set Schedule Daily auction
          const startDate = auction.startDate;
          const expiryDate = this.addDays(startDate, auction.durationInDays);

          const updatedAuction = await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.IN_SCHEDULED,
              expiryDate: expiryDate,
            },
            include: {
              bids: true,
              user: true,
              product: { include: { images: true, category: true } },
            },
          });
          const auctionEndDate = new Date(updatedAuction.expiryDate);
          const formattedEndDate = auctionEndDate.toISOString().split('T')[0];
          const formattedEndTime = auctionEndDate.toTimeString().slice(0, 5);
          if (updatedAuction) {
            //emiting the new auction to all online users
            this.auctionGateway.listingNewAuction(updatedAuction);

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
                      <li>	Auction Ends: ${formattedEndDate} & ${formattedEndTime} </li>
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
            await this.emailService.sendEmail(
              updatedAuction.user.email,
              'token',
              EmailsType.OTHER,
              emailBodyToSeller,
            );

            const whatsappBodyToSellerAuctionLive = {
              1: `${updatedAuction.user.userName}`,
              2: `🎉 Congratulations! Your auction listing *${updatedAuction.product.title}* is now live on Alletre. Buyers can now find and bid on your item.`,
              3: `*Title:* ${updatedAuction.product.title}`,
              4: `*Starting Bid:* ${updatedAuction.startBidAmount}`,
              5: `*Auction Ends:* ${formattedEndDate} & ${formattedEndTime}`,
              6: `🚀 Tip: Share your auction link with friends or on social media to get more visibility.`,
              7: `You can track bids and view your auction anytime.`,
              8: updatedAuction.product.images[0].imageLink,
              9: `https://www.alletre.com/alletre/home/${updatedAuction.id}/details`,
            };

            if (updatedAuction.user.phone) {
              await this.whatsappService.sendOtherUtilityMessages(
                whatsappBodyToSellerAuctionLive,
                updatedAuction.user.phone,
                'alletre_common_utility_templet',
              );
            }

            await this.emailBatchService.sendBulkEmails(
              updatedAuction,
              currentUserEmail,
            );
            //sending whatsapp messages to all users
            await this.whatsappService.sendAuctionToUsers(
              auctionId,
              process.env.NODE_ENV === 'production'
                ? 'EXISTING_USER'
                : 'NON_EXISTING_USER',
            );
          }
        }
        break;

      case DurationUnits.HOURS:
        if (auction.type === AuctionType.ON_TIME) {
          // Set ON_TIME hours auction ACTIVE
          const today = new Date();
          console.log('auction duration in hours :', auction.durationInHours);
          const expiryDate = this.addHours(new Date(), auction.durationInHours);

          const updatedAuction = await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.ACTIVE,
              startDate: today,
              expiryDate: expiryDate,
            },

            include: {
              bids: true,
              user: true,
              product: { include: { images: true, category: true } },
            },
          });
          const auctionEndDate = new Date(updatedAuction.expiryDate);
          const formattedEndDate = auctionEndDate.toISOString().split('T')[0];
          const formattedEndTime = auctionEndDate.toTimeString().slice(0, 5);
          if (updatedAuction) {
            //emiting the new auction to all online users
            this.auctionGateway.listingNewAuction(updatedAuction);
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
                      <li>Title: ${updatedAuction.product.title}</li>                      <li>Category: ${updatedAuction.product.category.nameEn}</li>
                      <li>Starting Bid: ${updatedAuction.startBidAmount}</li>
                      <li>	Auction Ends: ${formattedEndDate} & ${formattedEndTime} </li>
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
            await this.emailService.sendEmail(
              updatedAuction.user.email,
              'token',
              EmailsType.OTHER,
              emailBodyToSeller,
            );
            const whatsappBodyToSellerAuctionLive = {
              1: `${updatedAuction.user.userName}`,
              2: `🎉 Your auction listing *${updatedAuction.product.title}* is now live on Alletre. Buyers can now find and bid on your item.`,
              3: `*Title:* ${updatedAuction.product.title}`,
              4: `*Starting Bid:* ${updatedAuction.startBidAmount}`,
              5: `*Auction Ends:* ${formattedEndDate} & ${formattedEndTime}`,
              6: `🚀 To boost your listing visibility, share it with your friends or on social media.`,
              7: `You can track bids and view your auction using the link below.`,
              8: updatedAuction.product.images[0].imageLink,
              9: `https://www.alletre.com/alletre/home/${updatedAuction.id}/details`,
            };

            if (updatedAuction.user.phone) {
              await this.whatsappService.sendOtherUtilityMessages(
                whatsappBodyToSellerAuctionLive,
                updatedAuction.user.phone,
                'alletre_common_utility_templet',
              );
            }

            await this.emailBatchService.sendBulkEmails(
              updatedAuction,
              currentUserEmail,
            );
            await this.whatsappService.sendAuctionToUsers(
              auctionId,
              process.env.NODE_ENV === 'production'
                ? 'EXISTING_USER'
                : 'NON_EXISTING_USER',
            );
          }
        } else if (auction.type === AuctionType.SCHEDULED) {
          // Set Schedule hours auction
          const startDate = auction.startDate;
          const expiryDate = this.addHours(startDate, auction.durationInHours);

          const updatedAuction = await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.IN_SCHEDULED,
              expiryDate: expiryDate,
            },
            include: {
              bids: true,
              user: true,
              product: { include: { images: true, category: true } },
            },
          });

          const auctionEndDate = new Date(updatedAuction.expiryDate);
          const formattedEndDate = auctionEndDate.toISOString().split('T')[0];
          const formattedEndTime = auctionEndDate.toTimeString().slice(0, 5);
          if (updatedAuction) {
            //emiting the new auction to all online users
            this.auctionGateway.listingNewAuction(updatedAuction);

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
                      <li>	Auction Ends: ${formattedEndDate} & ${formattedEndTime} </li>
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
            await this.emailService.sendEmail(
              updatedAuction.user.email,
              'token',
              EmailsType.OTHER,
              emailBodyToSeller,
            );

            const whatsappBodyToSellerAuctionLive = {
              1: `${updatedAuction.user.userName}`,
              2: `🎉 Congratulations! Your auction listing *${updatedAuction.product.title}* is now live on Alletre. Buyers can now find and bid on your item.`,
              3: `*Title:* ${updatedAuction.product.title}`,
              4: `*Starting Bid:* ${updatedAuction.startBidAmount}`,
              5: `*Auction Ends:* ${formattedEndDate} & ${formattedEndTime}`,
              6: `🚀 Tip: Share your auction link with friends or on social media to get more visibility.`,
              7: `You can track bids and view your auction anytime.`,
              8: updatedAuction.product.images[0].imageLink,
              9: `https://www.alletre.com/alletre/home/${updatedAuction.id}/details`,
            };

            if (updatedAuction.user.phone) {
              await this.whatsappService.sendOtherUtilityMessages(
                whatsappBodyToSellerAuctionLive,
                updatedAuction.user.phone,
                'alletre_common_utility_templet',
              );
            }

            await this.emailBatchService.sendBulkEmails(
              updatedAuction,
              currentUserEmail,
            );
            //sending whatsapp messages to all users
            await this.whatsappService.sendAuctionToUsers(
              auctionId,
              process.env.NODE_ENV === 'production'
                ? 'EXISTING_USER'
                : 'NON_EXISTING_USER',
            );
          }
        }
    }
  }

  async notieceTheSellerToCompleteThePayment(user: User, auction: any) {
    console.log('call notieceTheSellerToCompleteThePayment3');

    const auctionEndDate = new Date(auction.expiryDate);
    const formattedEndDate = auctionEndDate.toISOString().split('T')[0];
    const formattedEndTime = auctionEndDate.toTimeString().slice(0, 5);
    //notify by sending email
    const emailBodyToSeller = {
      subject:
        'Action Required: Pay Security Deposit to Keep Your Auction Live!',
      title: 'Your Auction Has Reached AED 5000!',
      Product_Name: auction.product.title,
      img: auction.product.images[0].imageLink,
      userName: `${auction.user.userName}`,
      message1: ` 
        <p>Great news! Your auction <b>${auction.product.title}</b> has reached a bid of <b>AED 5000</b>.</p>
        <p>To keep your auction running and allow more bids, you are now required to pay the <b>Security Deposit</b>. If the deposit is not paid before the auction ends on <b>${formattedEndDate}</b> at <b>${formattedEndTime}</b>, the auction will be <span style="color: red;"><b>automatically cancelled</b></span>.</p>
        <p>Please make the payment as soon as possible to continue enjoying the auction momentum.</p>
        <ul>
          <li>Product Name: ${auction.product.title}</li>
          <li>Auction Ends: ${formattedEndDate} at ${formattedEndTime}</li>
        </ul>
      `,
      message2: ` 
        <p>Thank you for using <b>Alletre</b>. We're here to help your auction succeed!</p>
        <p style="margin-bottom: 0;">Best regards,</p>
        <p style="margin-top: 0;"><b>The Alletre Team</b></p>
      `,
      Button_text: 'Pay Deposit',
      Button_URL:
        process.env.NODE_ENV === 'production'
          ? `https://www.alletre.com/alletre/home/create-auction/product-details/auction-details/shipping-details/payment-details?auctionId=${auction.id}`
          : `http://localhost:3000/alletre/home/create-auction/product-details/auction-details/shipping-details/payment-details?auctionId=${auction.id}`,
    };

    this.emailService.sendEmail(
      auction.user.email,
      'token',
      EmailsType.OTHER,
      emailBodyToSeller,
    );

    //notify by sending notification
    const isCreateNotificationToSeller =
      await this.prismaService.notification.create({
        data: {
          userId: user.id,
          message: `Your auction "${auction.product.title}" has reached AED 5000. Please pay the security deposit now to keep it running. Auction will be cancelled if the deposit is not paid before expiry.`,
          imageLink: auction.product.images[0].imageLink,
          productTitle: auction.product.title,
          auctionId: auction.id,
        },
      });

    if (isCreateNotificationToSeller) {
      // Send notification to seller
      const sellerUserId = auction.userId;

      const notification = {
        status: 'ON_BIDDING',
        userType: 'FOR_SELLER',
        usersId: sellerUserId,
        message: isCreateNotificationToSeller.message,
        imageLink: auction.product.images[0].imageLink,
        productTitle: auction.product.title,
        auctionId: isCreateNotificationToSeller.auctionId,
      };
      try {
        this.notificationsService.sendNotificationToSpecificUsers(notification);
      } catch (error) {
        console.log('sendNotificationToSpecificUsers error', error);
      }
    }

    //notify by sending whatsapp messages
    const whatsappBodyToSeller = {
      1: `${auction.user.userName}`,
      2: `🚨 Your auction *${auction.product.title}* has reached a bid of *AED 5000*!`,
      3: `To continue the auction and allow more bids, please pay the *Security Deposit* immediately.`,
      4: `If the deposit is not paid before the auction ends on *${formattedEndDate} at ${formattedEndTime}*, your auction will be *automatically cancelled*.`,
      5: `*Auction Ends*: ${formattedEndDate} at ${formattedEndTime}`,
      6: `Don not miss out—keep the momentum going!`,
      7: `Click the Button below to complete your deposit and manage the auction:`,
      8: auction.product.images[0].imageLink,
      9: `https://www.alletre.com/alletre/home/${auction.id}/details`,
    };

    if (auction.user.phone) {
      await this.whatsappService.sendOtherUtilityMessages(
        whatsappBodyToSeller,
        auction.user.phone,
        'alletre_common_utility_templet',
      );
    }
  }

  addHours(date: Date, hours: number) {
    const newDate =
      process.env.NODE_ENV === 'production'
        ? new Date(date.getTime() + hours * 60 * 60 * 1000)
        : new Date(date.getTime() + 5 * 60 * 1000);
    // const newDate = new Date(date.getTime() + 6 * 60 * 1000);

    return newDate;
  }

  addDays(date: Date, days: number) {
    const currentDate = date;
    const newDate = new Date(currentDate.setDate(currentDate.getDate() + days));
    return newDate;
  }

  calculateWinnerPaymentAmount(lastBid: number, winnerSecurityDeposit = 0) {
    const lastBidAmount = lastBid;
    const auctionFee = (lastBidAmount * 0.5) / 100;
    const payingAmountWithAlletreFee = lastBidAmount + auctionFee;
    const stripeCardFee = (payingAmountWithAlletreFee * 3) / 100 + 4; // stripe takes 3% of the base value and additionally 1 USD(4 dirham)
    const AmountOfStripePayment = payingAmountWithAlletreFee + stripeCardFee;
    const payingAmountOfStripe = AmountOfStripePayment - winnerSecurityDeposit;
    const amountToAlletteWalletInTheStripeWEBHOOK =
      payingAmountOfStripe - ((payingAmountOfStripe * 3) / 100 + 4);
    return {
      payingAmountOfWallet: payingAmountWithAlletreFee - winnerSecurityDeposit,
      payingAmountOfStripe,
      amountToAlletteWalletInTheStripeWEBHOOK,
      payingAmountWithStripeAndAlletreFees: payingAmountOfStripe,
    };
  }

  async sendArbonContractEmails(arbonPayment: any, product: any) {
    console.log('--- sendArbonContractEmails CALLED ---');
    try {
      const contractData = {
        buyerName:
          arbonPayment?.user?.userName || arbonPayment?.user?.email || 'Buyer',
        buyerEmail: arbonPayment?.user?.email || 'N/A',
        sellerName: product?.user?.userName || product?.user?.email || 'Seller',
        sellerEmail: product?.user?.email || 'N/A',
        productTitle: product?.title || 'Product',
        productDescription: product?.description || '',
        productPrice: (product?.ProductListingPrice || 0).toString(),
        arbonAmount: (arbonPayment?.amount || 0).toString(),
        lang: arbonPayment?.user?.lang || 'en',
      };

      console.log(
        'STARTING PDF GENERATION...',
        JSON.stringify(contractData, null, 2),
      );
      let pdfBuffer = null;
      try {
        pdfBuffer = await generateArbonContractPDF(contractData);
        console.log(
          'PDF GENERATED SUCCESSFULLY. Buffer length:',
          pdfBuffer?.length,
        );
      } catch (pdfError) {
        console.error(
          'PDF Generation failed, sending email without attachment:',
          pdfError.message || pdfError,
        );
      }

      const emailBody = {
        subject: 'Arbon Deposit Confirmation & Contract',
        title: 'Transaction Successful',
        Product_Name: product.title,
        img: product.images[0]?.imageLink,
        userName: arbonPayment?.user?.userName,
        message1: `You have successfully paid the Arbon deposit for "${
          product.title
        }". ${pdfBuffer ? 'A copy of the contract is attached.' : ''}`,
        message2:
          'The deposit is held securely. The seller has 7 days to release it if needed.',
        Button_text: 'View Product',
        Button_URL: `https://www.3arbon.com/my-product/${product.id}/details`,
      };

      const attachments = pdfBuffer
        ? [{ filename: 'contract.pdf', content: pdfBuffer }]
        : [];

      // Send email to buyer
      if (arbonPayment?.user?.email) {
        await this.emailService.sendEmail(
          arbonPayment.user.email,
          'token',
          EmailsType.OTHER,
          {
            ...emailBody,
            subject: `Arbon Contract for "${product.title}"`,
            userName: arbonPayment.user.userName,
            attachments: attachments,
          },
          arbonPayment.user.userName,
        );
      }

      // Send email to seller
      if (product?.user?.email) {
        await this.emailService.sendEmail(
          product.user.email,
          'token',
          EmailsType.OTHER,
          {
            ...emailBody,
            subject: `Arbon Deposit Received for "${product.title}"`,
            userName: product.user.userName,
            message1: `An Arbon deposit has been paid for your product "${
              product.title
            }" by ${arbonPayment?.user?.userName || 'a buyer'}. ${
              pdfBuffer ? 'A copy of the contract is attached.' : ''
            }`,
            message2:
              'The deposit is held securely. You can release it to the buyer within 7 days if needed.',
            Button_text: 'Release Deposit',
            Button_URL: `https://www.3arbon.com/my-product/${product.id}/details`,
            attachments: attachments,
          },
          product.user.userName,
        );
      }
      console.log('EMAILS SENT SUCCESSFULLY.');
    } catch (error) {
      console.error(
        'CRITICAL ERROR in sendArbonContractEmails:',
        error.message || error,
      );
    }
  }

  async getDepositDetails(user: User) {
    const products = await this.prismaService.product.findMany({
      where: {
        isArbon: true,
        OR: [{ userId: user.id }, { arbonBuyerId: user.id }],
      },
      include: {
        user: {
          select: { id: true, userName: true, email: true, phone: true },
        },
        arbonBuyer: {
          select: { id: true, userName: true, email: true, phone: true },
        },
        images: { take: 1 },
        objections: {
          select: {
            id: true,
            reason: true,
            description: true,
            status: true,
            createdAt: true,
            repliedAt: true,
            replyReason: true,
            replyDescription: true,
            userId: true,
            finalDecision: true,
            finalDecisionAt: true,
            finalDecisionDocuments: {
              select: {
                id: true,
                imageLink: true,
                imagePath: true,
              },
            },
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    // Auto-finalize if 7 days passed
    const now = new Date();
    for (const product of products) {
      if (
        (product as any).arbonStatus === 'PAID' &&
        (product as any).arbonPaidAt
      ) {
        const paidAt = new Date((product as any).arbonPaidAt);
        const diffTime = Math.abs(now.getTime() - paidAt.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 7) {
          console.log(
            `Auto-finalizing Arbon for product ${product.id} to company...`,
          );
          await this.autoReleaseArbonDeposit(product.id).catch((err) =>
            console.error(
              `Auto-finalize failed for product ${product.id}:`,
              err,
            ),
          );
          // Update the local object status so it reflects in the response immediately
          (product as any).arbonStatus = 'RELEASED';
        }
      }
    }
    return products;
  }

  async createObjection(user: User, data: any, files?: Array<Express.Multer.File>) {
    const { productId, reason, description } = data;

    const objection = await this.prismaService.productObjection.create({
      data: {
        productId: Number(productId),
        userId: user.id,
        reason,
        description,
      },
    });

    if (files?.length) {
      for (const file of files) {
        const uploadedFile = await this.firebaseService.uploadImage(file);
        await this.prismaService.productObjectionImage.create({
          data: {
            objectionId: objection.id,
            imageLink: uploadedFile.fileLink,
            imagePath: uploadedFile.filePath,
          },
        });
      }
    }

    // Update product status to DISPUTED
    await this.prismaService.product.update({
      where: { id: Number(productId) },
      data: { arbonStatus: 'DISPUTED' },
    });

    // Capture any active HOLD payments to company account immediately
    // The admin will decide later what to do with the funds
    try {
      const activePayments = await this.prismaService.payment.findMany({
        where: {
          productId: Number(productId),
          type: 'ARBON_DEPOSIT' as any,
          status: PaymentStatus.HOLD,
        } as any,
      });

      for (const payment of activePayments) {
        console.log(`OBJECTION: Capturing payment ${payment.paymentIntentId} for product ${productId}`);
        await this.stripeService.capturePayment(payment.paymentIntentId);
        
        // Update payment status in DB to SUCCESS (Captured)
        await this.prismaService.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.SUCCESS },
        });

        // Record in Alletre Wallet (Company Account) so admin can track it
        const lastAlletreTransaction = await this.prismaService.alletreWallet.findFirst({
          orderBy: { id: 'desc' },
        });

        const currentBalance = lastAlletreTransaction ? Number(lastAlletreTransaction.balance) : 0;
        const newBalance = currentBalance + Number(payment.amount);

        await this.prismaService.alletreWallet.create({
          data: {
            userId: user.id, // Who triggered the capture (the person raising the objection)
            amount: payment.amount,
            balance: newBalance,
            status: 'DEPOSIT',
            transactionType: 'BY_DIRECT_SELL',
            description: `Safety Capture: Arbon deposit moved to company account due to Objection on product #${productId}.`,
          } as any,
        });
      }
    } catch (err) {
      console.error('Error capturing payment during objection:', err);
      // We don't throw error here to not block the objection creation
    }

    // Send emails to seller and buyer
    try {
      const product = await this.prismaService.product.findUnique({
        where: { id: Number(productId) },
        include: {
          user: true, // Seller
          arbonBuyer: true, // Buyer
        },
      });

      if (product) {
        // 1. Email to Seller (the person who raised the objection)
        await this.emailService.sendEmail(
          product.user.email,
          '',
          EmailsType.OBJECTION_RAISED,
          {
            productTitle: product.title,
            objectionId: objection.id,
          },
          product.user.userName,
        );

        // 2. Email to Buyer (the other party)
        if (product.arbonBuyer) {
          await this.emailService.sendEmail(
            product.arbonBuyer.email,
            '',
            EmailsType.OBJECTION_RECEIVED,
            {
              productTitle: product.title,
              reason: reason,
              description: description,
              objectionId: objection.id,
            },
            product.arbonBuyer.userName,
          );
        }
      }
    } catch (emailErr) {
      console.error('Error sending objection emails:', emailErr);
    }

    return objection;
  }

  async getObjection(id: number) {
    const result = await this.prismaService.productObjection.findUnique({
      where: { id: Number(id) },
      include: {
        documents: true,
        replyDocuments: true,
        finalDecisionDocuments: true,
        product: {
          include: {
            user: true,
            arbonBuyer: true,
            images: true,
          },
        },
        user: true,
        repliedBy: {
          select: { id: true, userName: true, email: true, phone: true, imageLink: true },
        },
      },
    });
    console.log(`[DEBUG getObjection] id=${id} finalDecision=`, result?.finalDecision, 'docs=', result?.finalDecisionDocuments?.length || 0);
    return result;
  }

  async replyToObjection(user: User, objectionId: number, data: any, files?: Array<Express.Multer.File>) {
    const { replyReason, replyDescription } = data;

    // Fetch the objection to check creation date
    const existingObjection = await this.prismaService.productObjection.findUnique({
      where: { id: Number(objectionId) },
    });

    if (!existingObjection) {
      throw new BadRequestException("Objection not found");
    }

    // Check if already replied
    if (existingObjection.repliedAt) {
      throw new MethodNotAllowedException("This objection has already been replied to");
    }

    // Validation for 2 days (48 hours)
    const createdAt = new Date(existingObjection.createdAt);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - createdAt.getTime());
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    if (diffDays > 2) {
      throw new MethodNotAllowedException("The 2-day period for replying to this objection has expired.");
    }

    const objection = await this.prismaService.productObjection.update({
      where: { id: Number(objectionId) },
      data: {
        replyReason,
        replyDescription,
        repliedAt: new Date(),
        repliedById: user.id,
        status: 'IN_PROGRESS',
      },
      include: {
        product: true,
        user: true,
        repliedBy: true,
      },
    });

    if (files?.length) {
      for (const file of files) {
        const uploadedFile = await this.firebaseService.uploadImage(file);
        await this.prismaService.productObjectionReplyImage.create({
          data: {
            objectionId: objection.id,
            imageLink: uploadedFile.fileLink,
            imagePath: uploadedFile.filePath,
          },
        });
      }
    }

    try {
      // Notify the person who raised the objection
      await this.emailService.sendEmail(
        objection.user.email,
        "",
        EmailsType.OBJECTION_REPLY_RECEIVED,
        {
          productTitle: objection.product.title,
          objectionId: objection.id,
        },
        objection.user.userName,
      );

      // Notify the person who replied (confirmation)
      await this.emailService.sendEmail(
        user.email,
        "",
        EmailsType.OBJECTION_REPLY_SENT,
        {
          productTitle: objection.product.title,
          objectionId: objection.id,
        },
        user.userName,
      );
    } catch (err) {
      console.error('Error sending objection reply emails:', err);
    }

    return objection;
  }
}
