import {
  Injectable,
  InternalServerErrorException,
  MethodNotAllowedException,
} from '@nestjs/common';
import {
  AuctionStatus,
  AuctionType,
  DurationUnits,
  JoinedAuctionStatus,
  PaymentStatus,
  PaymentType,
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
import { auctionCreationMessage } from 'src/notificatons/NotificationsContents/auctionCreationMessage';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly stripeService: StripeService,
    private readonly prismaService: PrismaService,
    private readonly emailService: EmailSerivce,
    private readonly walletService: WalletService,
    private readonly emailBatchService: EmailBatchService,
    private readonly notificationsService: NotificationsService,
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
          throw new MethodNotAllowedException('already paid');
        }
        //check previous payment attempt thorugh stripe or not
        if (userPaymentForAuction.paymentIntentId) {
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
          //checking again the wallet balance to avoid issues
          const lastWalletTransactionBalanceOfSeller =
            await this.walletService.findLastTransaction(user.id, prisma);
          if (Number(lastWalletTransactionBalanceOfSeller) < amount) {
            throw new MethodNotAllowedException('Sorry, Insufficient Balance.');
          }
          //crete new transaction in seller wallet
          const sellerWallet = await this.walletService.create(
            user.id,
            SellerWalletData,
            prisma,
          );
          //crete new transaction in alletre wallet
          const alletreWallet = await this.walletService.addToAlletreWallet(
            user.id,
            alletreWalletData,
            prisma,
          );
          // create new payment database
          if (!sellerWallet || !alletreWallet) {
            throw new InternalServerErrorException(
              'Failed to process wallet payment',
            );
          }

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
        await this.publishAuction(auctionId);
        const usersId = await this.notificationsService.getAllRegisteredUsers(
          user.id,
        );
        await this.prismaService.notification.create({
          data: {
            userId: user.id,
            message:
              'Congratulations! Your auction has been successfully published.',
            html: auctionCreationMessage(paymentData.auction),
            auctionId: paymentData.auctionId,
          },
        });
        const html = auctionCreationMessage(paymentData.auction);
        const message = 'New Auction has been published.';
        await this.notificationsService.sendNotifications(
          usersId,
          message,
          html,
          paymentData.auctionId,
        );
      } else {
        throw new InternalServerErrorException(
          'Failed to process wallet payment',
        );
      }
      return paymentData;
    } catch (error) {
      console.log('wallet pay deposit by seller error :', error);
      throw new InternalServerErrorException(
        'Failed to process wallet payment',
      );
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

        // Retrieve PaymentIntent and clientSecret for clientSide
        const paymentIntent = await this.stripeService.retrievePaymentIntent(
          userPaymentForAuction.paymentIntentId,
        );

        if (paymentIntent.status === 'succeeded')
          throw new MethodNotAllowedException('already paid');

        return {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        };
      }
      console.log('stripeCustomerId :', stripeCustomerId);
      const { clientSecret, paymentIntentId } =
        await this.stripeService.createDepositPaymentIntent(
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
      throw new InternalServerErrorException(
        'Failed to process stripe payment',
      );
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
        if (bidderPaymentForAuction.paymentIntentId) {
          throw new MethodNotAllowedException(
            'Wallet payment is not available for this auction. Please select an online payment method to proceed.',
          );
        }
        return bidderPaymentForAuction;
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

            //checking again the wallet balance to avoid issues
            const lastWalletTransactionBalanceOfBidder =
              await this.walletService.findLastTransaction(user.id, prisma);
            if (Number(lastWalletTransactionBalanceOfBidder) < amount) {
              throw new MethodNotAllowedException(
                'Sorry, Insufficient Balance.',
              );
            }
            //crete new transaction in bidder wallet
            await this.walletService.create(user.id, BidderWalletData, prisma);
            //crete new transaction in alletre wallet
            await this.walletService.addToAlletreWallet(
              user.id,
              alletreWalletData,
              prisma,
            );
            // Join user to auction
            await prisma.joinedAuction.create({
              data: {
                userId: user.id,
                auctionId: auctionId,
              },
            });
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
            });

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
      console.log('test of wallet pay of bidder deposite 4');
      return paymentData;
    } catch (error) {
      console.log('wallet pay deposit by bidder error :', error);
      throw new InternalServerErrorException(
        'Failed to process wallet payment for bidder deoposit',
      );
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
        { bidAmount: Number(bidAmount) },
      );
    console.log('test 8');

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

            //checking again the wallet balance to avoid issues
            const lastWalletTransactionBalanceOfBidder =
              await this.walletService.findLastTransaction(user.id, prisma);
            if (Number(lastWalletTransactionBalanceOfBidder) < amount) {
              throw new MethodNotAllowedException(
                'Sorry, Insufficient Balance.',
              );
            }
            //crete new transaction in bidder wallet
            await this.walletService.create(user.id, BidderWalletData, prisma);
            //crete new transaction in alletre wallet
            await this.walletService.addToAlletreWallet(
              user.id,
              alletreWalletData,
              prisma,
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
    amount: number,
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
        type: PaymentType.AUCTION_PURCHASE,
      },
    });
    return { clientSecret, paymentIntentId };
  }

  async createBuyNowPaymentTransactionWallet(
    user: User,
    auctionId: number,
    // currency: string,
    amount: number,
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
      if (Number(lastWalletTransactionBalanceOfBidder) < amount) {
        throw new MethodNotAllowedException('Sorry, Insufficient Balance.');
      }

      console.log('test 2');

      const buyerWalletData = {
        status: WalletStatus.WITHDRAWAL,
        transactionType: WalletTransactionType.By_AUCTION,
        description: `Purchase Product through buy now`,
        amount: amount,
        auctionId: Number(auctionId),
        balance: Number(lastWalletTransactionBalanceOfBidder) - amount,
      };
      // wallet data for deposit to alletre wallet

      const alletreWalletData = {
        status: WalletStatus.DEPOSIT,
        transactionType: WalletTransactionType.By_AUCTION,
        description: `Purchase Product through buy now`,
        amount: amount,
        auctionId: Number(auctionId),
        balance: lastBalanceOfAlletre
          ? Number(lastBalanceOfAlletre) + amount
          : amount,
      };
      console.log('test 3');

      const { paymentData } = await this.prismaService.$transaction(
        async (prisma) => {
          console.log('test 4');

          //checking again the wallet balance to avoid issues
          const lastWalletTransactionBalanceOfBidder =
            await this.walletService.findLastTransaction(user.id, prisma);
          if (Number(lastWalletTransactionBalanceOfBidder) < amount) {
            throw new MethodNotAllowedException('Sorry, Insufficient Balance.');
          }
          //crete new transaction in bidder wallet
          await this.walletService.create(user.id, buyerWalletData, prisma);
          //crete new transaction in alletre wallet
          await this.walletService.addToAlletreWallet(
            user.id,
            alletreWalletData,
            prisma,
          );
          // Update auction status to sold

          const paymentData = await prisma.payment.create({
            data: {
              userId: user.id,
              auctionId: auctionId,
              amount: amount,
              type: PaymentType.BUY_NOW_PURCHASE,
              isWalletPayment: true,
              status: 'SUCCESS',
            },
            include: {
              user: true,
              auction: { include: { product: { include: { images: true } } } },
            },
          });

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
              amount: amount,
            },
          });
          //------------------------------------------------------------

          await prisma.auction.update({
            where: { id: auctionId },
            data: { status: AuctionStatus.SOLD },
          });
          return { paymentData };
        },
      );
      console.log('test 5');

      if (paymentData) {
        //send an email to the buyer
        const emailBodyToBuyer = {
          subject: 'Congratulations on Your Purchase - Auction Concluded!',
          title: 'Purchase Successful',
          Product_Name: paymentData.auction.product.title,
          img: paymentData.auction.product.images[0].imageLink,
          message: `Hi ${paymentData.user.userName}, 
                        Congratulations! You have successfully purchased the ${paymentData.auction.product.title} 
                        (Model: ${paymentData.auction.product.model}) using the "Buy Now" option. 
                        The item is now yours, and we are excited to finalize the process for you.
                        The seller has been notified and will begin preparing the item for delivery. 
                        If you have any questions, feel free to reach out to us. 
                        Thank you for your purchase, and we hope you enjoy your new product!`,
          Button_text: 'View Your Purchase',
          Button_URL: process.env.FRONT_URL, // Link to the buyer's purchase history or auction page
        };
        await this.emailService.sendEmail(
          paymentData.user.email,
          'token',
          EmailsType.OTHER,
          emailBodyToBuyer,
        );

        //check is there any bidders on this auction
        const auctionPaymentData = await this.prismaService.payment.findMany({
          where: { auctionId: auctionId },
          include: {
            user: true,
            auction: { include: { product: { include: { images: true } } } },
          },
        });
        await Promise.all(
          auctionPaymentData.map(async (payment) => {
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
                  description: `Auction ended; item purchased via Buy Now option.`,
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
                  description: `Auction ended; item purchased via Buy Now option.`,
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
                //send email to the seller
                const emailBodyToLostBidders = {
                  subject: 'Auction Concluded - Buy Now Option Used',
                  title: 'Auction Concluded',
                  Product_Name: payment.auction.product.title,
                  img: payment.auction.product.images[0].imageLink,
                  message: `Hi ${payment.user.userName}, 
                          We regret to inform you that the auction for ${
                            payment.auction.product.title
                          } 
                          (Model: ${
                            payment.auction.product.model
                          }) has concluded. 
                          Another user has successfully purchased the item using the "Buy Now" option. 
                          We will send back the security deopsit to your ${
                            payment.isWalletPayment ? 'wallet' : 'bank account'
                          }
                          We appreciate your interest in the auction and encourage you to participate in future auctions. 
                          You can find more auctions listed on our platform. 
                          Thank you for being a valued member of our community!`,
                  Button_text: 'Click here to view more Auctions',
                  Button_URL: process.env.FRONT_URL, // Link to the auction page
                };
                await this.emailService.sendEmail(
                  payment.user.email,
                  'token',
                  EmailsType.OTHER,
                  emailBodyToLostBidders,
                );
              }
            } else if (payment.type === 'SELLER_DEPOSIT') {
              //email to the seller
              // let is_SD_SendBackToSeller : boolean = false
              // if(payment.isWalletPayment){
              //   //implement return security deposit funconality to wallet of seller
              //   //finding the last transaction balance of the Seller
              //   const lastWalletTransactionBalanceOfBidder = await this.walletService.findLastTransaction(payment.user.id)
              //   //finding the last transaction balance of the alletreWallet
              //   const lastBalanceOfAlletre = await this.walletService.findLastTransactionOfAlletre()

              //   //wallet data for deposit to seller wallet
              //   let sellerWalletData = {
              //     status:WalletStatus.DEPOSIT,
              //     transactionType:WalletTransactionType.By_AUCTION,
              //     description:`Auction ended; item purchased via Buy Now option.`,
              //     amount:Number(payment.amount),
              //     auctionId:Number(payment.auctionId),
              //     balance:Number(lastWalletTransactionBalanceOfBidder) ?
              //     Number(lastWalletTransactionBalanceOfBidder) + Number(payment.amount) : Number(payment.amount)

              //   }
              //   // wallet data for WITHDRAWAL to alletre wallet

              //   let alletreWalletData = {
              //     status:WalletStatus.WITHDRAWAL,
              //     transactionType:WalletTransactionType.By_AUCTION,
              //     description:`Auction ended; item purchased via Buy Now option.`,
              //     amount:Number(payment.amount),
              //     auctionId:Number(payment.auctionId),
              //     balance:(Number(lastBalanceOfAlletre) - Number(payment.amount))
              //   }
              //    //crete new transaction in bidder wallet
              //    const bidderWalletReuslt =  await this.walletService.create(payment.user.id,sellerWalletData)
              //    //crete new transaction in alletre wallet
              //  const alletreWalletResult =  await this.walletService.addToAlletreWallet(payment.user.id,alletreWalletData)
              //    if(bidderWalletReuslt && alletreWalletResult)
              //      is_SD_SendBackToSeller = true
              // }else{
              //   //implement return security deposit funconality to stripe of seller
              //   const isPaymentIntentCancelled = await this.stripeService.cancelDepositPaymentIntent(payment.paymentIntentId)
              //   if(isPaymentIntentCancelled)
              //     is_SD_SendBackToSeller = true
              // }
              // if(is_SD_SendBackToSeller){}

              //send email to the seller
              const emailBodyToSeller = {
                subject: 'Auction Concluded - Buy Now Option Used',
                title: 'Auction Concluded',
                Product_Name: payment.auction.product.title,
                img: payment.auction.product.images[0].imageLink,
                message: `Hi ${payment.user.userName}, 
                              We are glad to inform you that the auction for ${
                                payment.auction.product.title
                              } 
                              (Model: ${
                                payment.auction.product.model
                              }) has concluded. 
                              One user has successfully purchased the item using the "Buy Now" option. 
                              We will send back the security deopsit to your ${
                                payment.isWalletPayment
                                  ? 'wallet '
                                  : 'bank account '
                              }
                              and we send the full amount to the your wallet once you delevered the item to the buyer.
                              We appreciate your interest in the auction and encourage you to participate in future auctions. 
                              You can find more auctions listed on our platform. 
                              Thank you for being a valued member of our community!`,
                Button_text: 'Click here to view more Auctions',
                Button_URL: process.env.FRONT_URL, // Link to the auction page
              };
              await this.emailService.sendEmail(
                payment.user.email,
                'token',
                EmailsType.OTHER,
                emailBodyToSeller,
              );
            }
          }),
        );
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
    amount: number,
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
        type: PaymentType.BUY_NOW_PURCHASE,
      },
    });

    return { clientSecret, paymentIntentId };
  }

  async webHookEventHandler(payload: Buffer, stripeSignature: string) {
    const { paymentIntent, status } = await this.stripeService.webHookHandler(
      payload,
      stripeSignature,
    );
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
        const auctionHoldPaymentTransaction =
          await this.prismaService.payment.findUnique({
            where: { paymentIntentId: paymentIntent.id },
            include: {
              auction: {
                include: { product: { include: { images: true } }, user: true },
              },
              user: true,
            },
          });

        switch (auctionHoldPaymentTransaction.type) {
          case PaymentType.BIDDER_DEPOSIT:
            console.log('Webhook BIDDER_DEPOSIT ...');

            await this.prismaService.$transaction([
              // Update payment transaction
              this.prismaService.payment.update({
                where: { paymentIntentId: paymentIntent.id },
                data: { status: PaymentStatus.HOLD },
              }),

              // Join user to auction
              this.prismaService.joinedAuction.create({
                data: {
                  userId: auctionHoldPaymentTransaction.userId,
                  auctionId: auctionHoldPaymentTransaction.auctionId,
                },
              }),

              // Create bid for user
              this.prismaService.bids.create({
                data: {
                  userId: auctionHoldPaymentTransaction.userId,
                  auctionId: auctionHoldPaymentTransaction.auctionId,
                  amount: paymentIntent.metadata.bidAmount,
                },
              }),
            ]);
            const joinedBidders = await this.prismaService.bids.findMany({
              where: {
                auctionId: auctionHoldPaymentTransaction.auctionId,
              },
              include: {
                user: true,
                auction: {
                  include: {
                    product: { include: { images: true } },
                    user: true,
                  },
                },
              },
              orderBy: {
                id: 'desc',
              },
            });
            const emailBodyToSecondLastBidder = {
              subject: 'You have been outbid! 🔥 Don’t Let This Slip Away!',
              title: 'Your Bid Just Got Beaten!',
              Product_Name: auctionHoldPaymentTransaction.auction.product.title,
              img: auctionHoldPaymentTransaction.auction.product.images[0]
                .imageLink,
              message: `Hi, ${auctionHoldPaymentTransaction.user.userName}, 
                        Exciting things are happening on ${
                          auctionHoldPaymentTransaction.auction.product.title
                        }! Unfortunately, someone has just placed a higher bid, and you're no longer in the lead.
                        Here’s the current standing:
                        • Current Highest Bid: ${
                          joinedBidders.length > 1
                            ? joinedBidders[0].amount
                            : 'No bids yet'
                        }
                        • Your Last Bid: ${joinedBidders[1]?.amount}  
                        Don’t miss your chance to claim this one-of-a-kind auction item. The clock is ticking, and every second counts!
                        Reclaim Your Spot as the Top Bidder Now!
                        Stay ahead of the competition and secure your win!
                        Good luck,
                        The Alletre Team`,
              Button_text: 'View Auction',
              Button_URL: process.env.FRONT_URL,
            };

            console.log('joinedBidders1111111111111', joinedBidders);
            if (joinedBidders[1]) {
              console.log('joinedBidders222222', joinedBidders[1]);
              this.emailService.sendEmail(
                joinedBidders[1].user.email,
                'token',
                EmailsType.OTHER,
                emailBodyToSecondLastBidder,
              );
            }
            // create notification for seller
            const isCreateNotificationToSeller =
              await this.prismaService.notification.create({
                data: {
                  userId: auctionHoldPaymentTransaction.auction.user.id,
                  message: `Mr. ${auctionHoldPaymentTransaction.user.userName} has been placed new bid on your auction ${auctionHoldPaymentTransaction.auction.product.title} (Model: ${auctionHoldPaymentTransaction.auction.product.model})`,
                  html: auctionCreationMessage(
                    auctionHoldPaymentTransaction.auction,
                  ),
                  auctionId: auctionHoldPaymentTransaction.auctionId,
                },
              });

            const isCreateNotificationToCurrentBidder =
              await this.prismaService.notification.create({
                data: {
                  userId: auctionHoldPaymentTransaction.userId,
                  message: `You have successfully placed a bid on ${auctionHoldPaymentTransaction.auction.product.title} (Model: ${auctionHoldPaymentTransaction.auction.product.model})`,
                  html: auctionCreationMessage(
                    auctionHoldPaymentTransaction.auction,
                  ),
                  auctionId: auctionHoldPaymentTransaction.auctionId,
                },
              });

            if (isCreateNotificationToSeller) {
              // Send notification to seller
              const sellerUserId =
                auctionHoldPaymentTransaction.auction.user.id;

              const notification = {
                status: 'ON_BIDDING',
                userType: 'FOR_SELLER',
                usersId: sellerUserId,
                message: isCreateNotificationToSeller.message,
                html: isCreateNotificationToSeller.html,
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
                // Send notification to seller
                const currentBidderId = auctionHoldPaymentTransaction.userId;

                const notification = {
                  status: 'ON_BIDDING',
                  userType: 'CURRENT_BIDDER',
                  usersId: currentBidderId,
                  message: isCreateNotificationToCurrentBidder.message,
                  html: isCreateNotificationToCurrentBidder.html,
                  auctionId: isCreateNotificationToCurrentBidder.auctionId,
                };
                this.notificationsService.sendNotificationToSpecificUsers(
                  notification,
                );

                // Send notification other bidders
                const currentUserId = auctionHoldPaymentTransaction.userId;
                const joinedAuctionUsers =
                  await this.notificationsService.getAllJoinedAuctionUsers(
                    auctionHoldPaymentTransaction.auctionId,
                    currentUserId,
                  );
                const html = auctionCreationMessage(
                  auctionHoldPaymentTransaction.auction,
                );
                const otherBidderMessage = `${auctionHoldPaymentTransaction.user.userName} has placed a bid (AED ${paymentIntent.metadata.bidAmount}) on ${auctionHoldPaymentTransaction.auction.product.title} (Model: ${auctionHoldPaymentTransaction.auction.product.model})`;
                const isBidders = true;
                await this.notificationsService.sendNotifications(
                  joinedAuctionUsers,
                  otherBidderMessage,
                  html,
                  auctionHoldPaymentTransaction.auctionId,
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

            await this.publishAuction(auctionHoldPaymentTransaction.auctionId);

            await this.prismaService.notification.create({
              data: {
                userId: auctionHoldPaymentTransaction.userId,
                message:
                  'Congratulations! Your auction has been successfully published.',
                html: auctionCreationMessage(
                  auctionHoldPaymentTransaction.auction,
                ),
                auctionId: auctionHoldPaymentTransaction.auctionId,
              },
            });
            const currentUserId = auctionHoldPaymentTransaction.userId;
            const usersId =
              await this.notificationsService.getAllRegisteredUsers(
                currentUserId,
              );
            const html = auctionCreationMessage(
              auctionHoldPaymentTransaction.auction,
            );
            const message = 'New Auction has been published.';
            const isBidders = false;
            await this.notificationsService.sendNotifications(
              usersId,
              message,
              html,
              auctionHoldPaymentTransaction.auctionId,
              isBidders,
            );
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
          });
        console.log(
          'auctionPaymentTransaction :',
          auctionPaymentTransaction,
          paymentIntent,
        );
        switch (auctionPaymentTransaction.type) {
          case PaymentType.BIDDER_DEPOSIT:
            console.log('Webhook BIDDER_DEPOSIT ...');

            await this.prismaService.$transaction([
              // Update payment transaction
              this.prismaService.payment.update({
                where: { paymentIntentId: paymentIntent.id },
                data: { status: PaymentStatus.SUCCESS },
              }),

              // // Join user to auction
              // this.prismaService.joinedAuction.create({
              //   data: {
              //     userId: auctionPaymentTransaction.userId,
              //     auctionId: auctionPaymentTransaction.auctionId,
              //   },
              // }),

              // // Create bid for user
              // this.prismaService.bids.create({
              //   data: {
              //     userId: auctionPaymentTransaction.userId,
              //     auctionId: auctionPaymentTransaction.auctionId,
              //     amount: paymentIntent.metadata.bidAmount,
              //   },
              // }),
            ]);

            break;

          case PaymentType.SELLER_DEPOSIT:
            console.log('Webhook SELLER_DEPOSIT ...');

            // Update Auction
            // await this.publishAuction(auctionPaymentTransaction.auctionId);

            // Update payment transaction
            await this.prismaService.payment.update({
              where: { paymentIntentId: paymentIntent.id },
              data: { status: PaymentStatus.SUCCESS },
            });
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
              const lastBalanceOfAlletre =
                await this.walletService.findLastTransactionOfAlletre();
              const alletreWalletData = {
                status: WalletStatus.DEPOSIT,
                transactionType: WalletTransactionType.By_AUCTION,
                description: `Complete Payment of winner bidder`,
                amount: Number(paymentSuccessData.amount),
                auctionId: Number(paymentSuccessData.auctionId),
                balance: lastBalanceOfAlletre
                  ? Number(lastBalanceOfAlletre) +
                    Number(paymentSuccessData.amount)
                  : Number(paymentSuccessData.amount),
              };
              await this.walletService.addToAlletreWallet(
                paymentSuccessData.auction.user.id,
                alletreWalletData,
              );
              //send email to the seller
              const emailBodyToSeller = {
                subject: 'Payment successful',
                title: 'Your auction winner has paid the full amount',
                Product_Name: paymentSuccessData.auction.product.title,
                img: paymentSuccessData.auction.product.images[0].imageLink,
                message: ` Hi, ${paymentSuccessData.auction.user.userName}, 
                          The winner of your Auction of ${paymentSuccessData.auction.product.title}
                         (Model:${paymentSuccessData.auction.product.model}) has been paid the full amount. 
                         We would like to let you know that you can hand over the item to the winner. once the winner
                         confirmed the delvery, we will send the money to your wallet. If you refuse to hand over the item, 
                         there is a chance to lose your security deposite.
                         If you would like to participate another auction, Please click the button below. Thank you. `,
                Button_text: 'Click here to create another Auction',
                Button_URL: process.env.FRONT_URL,
              };
              const invoicePDF = await generateInvoicePDF(paymentSuccessData);
              const emailBodyToWinner = {
                subject: 'Payment successful',
                title: 'Payment successful',
                Product_Name: paymentSuccessData.auction.product.title,
                img: paymentSuccessData.auction.product.images[0].imageLink,
                message: ` Hi, ${joinedAuction.user.userName}, 
                          You have successfully paid the full amount of Auction of ${paymentSuccessData.auction.product.title}
                         (Model:${paymentSuccessData.auction.product.model}). Please confirm the delivery once the delivery is completed 
                         by clicking the confirm delivery button from the page : MY Bids -> waiting for delivery. 
                          We would like to thank you and appreciate you for choosing Alle Tre.  
                          If you would like to participate another auction, Please click the button below. Thank you. `,
                Button_text: 'Click here to create another Auction',
                Button_URL: process.env.FRONT_URL,
                attachment: invoicePDF,
              };
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
            }
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
                const isPaymentSuccess = await prisma.payment.update({
                  where: { paymentIntentId: paymentIntent.id },
                  data: { status: PaymentStatus.SUCCESS },
                  include: {
                    user: true,
                    auction: {
                      include: { product: { include: { images: true } } },
                    },
                  },
                });
                await prisma.joinedAuction.updateMany({
                  where: {
                    auctionId: auctionPaymentTransaction.auctionId,
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
                    userId: isPaymentSuccess.userId,
                    auctionId: auctionPaymentTransaction.auctionId,
                    status: JoinedAuctionStatus.WAITING_FOR_DELIVERY,
                  },
                });
                // Create bid for user
                await prisma.bids.create({
                  data: {
                    userId: isPaymentSuccess.userId,
                    auctionId: auctionPaymentTransaction.auctionId,
                    amount: isPaymentSuccess.amount,
                  },
                });
                //------------------------------------------------------------

                // Update auction status to sold
                await prisma.auction.update({
                  where: { id: auctionPaymentTransaction.auctionId },
                  data: { status: AuctionStatus.SOLD },
                });
                return { isPaymentSuccess };
              },
            );

            if (isPaymentSuccess) {
              // adding the buynow purchase money to alletre wallet for
              const lastWalletTransactionAlletre =
                await this.walletService.findLastTransactionOfAlletre();
              const walletDataToAlletre = {
                status: WalletStatus.DEPOSIT,
                transactionType: WalletTransactionType.By_AUCTION,
                description: 'Buy Now purchase',
                amount: Number(isPaymentSuccess.amount),
                auctionId: Number(isPaymentSuccess.auctionId),
                balance: Number(lastWalletTransactionAlletre)
                  ? Number(lastWalletTransactionAlletre) +
                    Number(isPaymentSuccess.amount)
                  : Number(isPaymentSuccess.amount),
              };

              await this.walletService.addToAlletreWallet(
                isPaymentSuccess.userId,
                walletDataToAlletre,
              );

              //send an email to the buyer
              const emailBodyToBuyer = {
                subject:
                  'Congratulations on Your Purchase - Auction Concluded!',
                title: 'Purchase Successful',
                Product_Name: isPaymentSuccess.auction.product.title,
                img: isPaymentSuccess.auction.product.images[0].imageLink,
                message: `Hi ${isPaymentSuccess.user.userName}, 
                          Congratulations! You have successfully purchased the ${isPaymentSuccess.auction.product.title} 
                          (Model: ${isPaymentSuccess.auction.product.model}) using the "Buy Now" option. 
                          The item is now yours, and we are excited to finalize the process for you.
                          The seller has been notified and will begin preparing the item for delivery. 
                          If you have any questions, feel free to reach out to us. 
                          Thank you for your purchase, and we hope you enjoy your new product!`,
                Button_text: 'View Your Purchase',
                Button_URL: process.env.FRONT_URL, // Link to the buyer's purchase history or auction page
              };
              await this.emailService.sendEmail(
                isPaymentSuccess.user.email,
                'token',
                EmailsType.OTHER,
                emailBodyToBuyer,
              );

              //check is there any bidders on this auction
              const auctionPaymentData =
                await this.prismaService.payment.findMany({
                  where: { auctionId: auctionPaymentTransaction.auctionId },
                  include: {
                    user: true,
                    auction: {
                      include: { product: { include: { images: true } } },
                    },
                  },
                });
              await Promise.all(
                auctionPaymentData.map(async (payment) => {
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
                        description: `Auction ended; item purchased via Buy Now option.`,
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
                        description: `Auction ended; item purchased via Buy Now option.`,
                        amount: Number(payment.amount),
                        auctionId: Number(payment.auctionId),
                        balance:
                          Number(lastBalanceOfAlletre) - Number(payment.amount),
                      };
                      //crete new transaction in bidder wallet
                      const bidderWalletReuslt =
                        await this.walletService.create(
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
                      if (isPaymentIntentCancelled)
                        is_SD_SendBackToBidder = true;
                    }
                    if (is_SD_SendBackToBidder) {
                      //send email to the seller
                      const emailBodyToLostBidders = {
                        subject: 'Auction Concluded - Buy Now Option Used',
                        title: 'Auction Concluded',
                        Product_Name: payment.auction.product.title,
                        img: payment.auction.product.images[0].imageLink,
                        message: `Hi ${payment.user.userName}, 
                              We regret to inform you that the auction for ${
                                payment.auction.product.title
                              } 
                              (Model: ${
                                payment.auction.product.model
                              }) has concluded. 
                              Another user has successfully purchased the item using the "Buy Now" option. 
                              We will send back the security deopsit to your ${
                                payment.isWalletPayment
                                  ? 'wallet'
                                  : 'bank account'
                              }
                              We appreciate your interest in the auction and encourage you to participate in future auctions. 
                              You can find more auctions listed on our platform. 
                              Thank you for being a valued member of our community!`,
                        Button_text: 'Click here to view more Auctions',
                        Button_URL: process.env.FRONT_URL, // Link to the auction page
                      };
                      await this.emailService.sendEmail(
                        payment.user.email,
                        'token',
                        EmailsType.OTHER,
                        emailBodyToLostBidders,
                      );
                    }
                  } else if (payment.type === 'SELLER_DEPOSIT') {
                    //email to the seller
                    // let is_SD_SendBackToSeller : boolean = false
                    // if(payment.isWalletPayment){
                    //   //implement return security deposit funconality to wallet of seller
                    //   //finding the last transaction balance of the Seller
                    //   const lastWalletTransactionBalanceOfBidder = await this.walletService.findLastTransaction(payment.user.id)
                    //   //finding the last transaction balance of the alletreWallet
                    //   const lastBalanceOfAlletre = await this.walletService.findLastTransactionOfAlletre()

                    //   //wallet data for deposit to seller wallet
                    //   let sellerWalletData = {
                    //     status:WalletStatus.DEPOSIT,
                    //     transactionType:WalletTransactionType.By_AUCTION,
                    //     description:`Auction ended; item purchased via Buy Now option.`,
                    //     amount:Number(payment.amount),
                    //     auctionId:Number(payment.auctionId),
                    //     balance:Number(lastWalletTransactionBalanceOfBidder) ?
                    //     Number(lastWalletTransactionBalanceOfBidder) + Number(payment.amount) : Number(payment.amount)

                    //   }
                    //   // wallet data for WITHDRAWAL to alletre wallet

                    //   let alletreWalletData = {
                    //     status:WalletStatus.WITHDRAWAL,
                    //     transactionType:WalletTransactionType.By_AUCTION,
                    //     description:`Auction ended; item purchased via Buy Now option.`,
                    //     amount:Number(payment.amount),
                    //     auctionId:Number(payment.auctionId),
                    //     balance:(Number(lastBalanceOfAlletre) - Number(payment.amount))
                    //   }
                    //    //crete new transaction in bidder wallet
                    //    const bidderWalletReuslt =  await this.walletService.create(payment.user.id,sellerWalletData)
                    //    //crete new transaction in alletre wallet
                    //  const alletreWalletResult =  await this.walletService.addToAlletreWallet(payment.user.id,alletreWalletData)
                    //    if(bidderWalletReuslt && alletreWalletResult)
                    //      is_SD_SendBackToSeller = true
                    // }else{
                    //   //implement return security deposit funconality to stripe of seller
                    //   const isPaymentIntentCancelled = await this.stripeService.cancelDepositPaymentIntent(payment.paymentIntentId)
                    //   if(isPaymentIntentCancelled)
                    //     is_SD_SendBackToSeller = true
                    // }
                    // if(is_SD_SendBackToSeller){}

                    //send email to the seller
                    const emailBodyToSeller = {
                      subject: 'Auction Concluded - Buy Now Option Used',
                      title: 'Auction Concluded',
                      Product_Name: payment.auction.product.title,
                      img: payment.auction.product.images[0].imageLink,
                      message: `Hi ${payment.user.userName}, 
                                  We are glad to inform you that the auction for ${
                                    payment.auction.product.title
                                  } 
                                  (Model: ${
                                    payment.auction.product.model
                                  }) has concluded. 
                                  One user has successfully purchased the item using the "Buy Now" option. 
                                  We will send back the security deopsit to your ${
                                    payment.isWalletPayment
                                      ? 'wallet '
                                      : 'bank account '
                                  }
                                  and we send the full amount to the your wallet once you delevered the item to the buyer.
                                  We appreciate your interest in the auction and encourage you to participate in future auctions. 
                                  You can find more auctions listed on our platform. 
                                  Thank you for being a valued member of our community!`,
                      Button_text: 'Click here to view more Auctions',
                      Button_URL: process.env.FRONT_URL, // Link to the auction page
                    };
                    await this.emailService.sendEmail(
                      payment.user.email,
                      'token',
                      EmailsType.OTHER,
                      emailBodyToSeller,
                    );
                  }
                }),
              );
            } else {
              throw new MethodNotAllowedException(
                'Faild to complete the buy now payment',
              );
            }

          default:
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
    return await this.prismaService.payment.findFirst({
      where: {
        userId,
        auctionId,
        type: type,
      },
    });
  }
  async publishAuction(auctionId: number) {
    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
    });
    console.log('publish auction for checking 1:-->', auction);

    switch (auction.durationUnit) {
      case DurationUnits.DAYS:
        if (auction.type === AuctionType.ON_TIME) {
          // Set ON_TIME Daily auction ACTIVE
          const today = new Date();
          const expiryDate = this.addDays(today, auction.durationInDays);

          const updatedAuction = await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.ACTIVE,
              startDate: today,
              expiryDate: expiryDate,
            },
            include: { product: { include: { images: true } } },
          });

          if (updatedAuction) {
            await this.emailBatchService.sendBulkEmails(updatedAuction);
          }
        } else if (auction.type === AuctionType.SCHEDULED) {
          // Set Schedule Daily auction
          const startDate = auction.startDate;
          const expiryDate = this.addDays(startDate, auction.durationInDays);

          await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.IN_SCHEDULED,
              expiryDate: expiryDate,
            },
          });
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
            include: { product: { include: { images: true } } },
          });
          if (updatedAuction) {
            await this.emailBatchService.sendBulkEmails(updatedAuction);
          }
        } else if (auction.type === AuctionType.SCHEDULED) {
          // Set Schedule hours auction
          const startDate = auction.startDate;
          const expiryDate = this.addHours(startDate, auction.durationInHours);

          await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.IN_SCHEDULED,
              expiryDate: expiryDate,
            },
          });
        }
    }
  }

  addHours(date: Date, hours: number) {
    const newDate = new Date(date.getTime() + hours * 60 * 60 * 1000);
    // const newDate = new Date(date.getTime() + 6 * 60 * 1000);

    return newDate;
  }

  addDays(date: Date, days: number) {
    const currentDate = date;
    const newDate = new Date(currentDate.setDate(currentDate.getDate() + days));
    return newDate;
  }
}
