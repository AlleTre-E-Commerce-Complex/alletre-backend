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
// import { auctionCreationMessage } from 'src/notificatons/NotificationsContents/auctionCreationMessage';
import { AuctionWebSocketGateway } from 'src/auction/gateway/auction.gateway';
import { AdminWebSocketGateway } from 'src/auction/gateway/admin.gateway';
import { timeout } from 'rxjs';
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
            SellerWalletData);
          //crete new transaction in alletre wallet
          const alletreWallet = await this.walletService.addToAlletreWallet(
            user.id,
            alletreWalletData);
          // create new payment database
          if (!sellerWallet || !alletreWallet) {
            throw new InternalServerErrorException(
              'Failed to process wallet payment',
            );
          }
        await this.publishAuction(auctionId);
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
        console.error('Payment data not created when walletPayDepositBySeller')
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
              include: {
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
                user: true,
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
        {
          timeout:10000
        }
      );
      if (paymentData) {
         //checking again the wallet balance to avoid issues
         const lastWalletTransactionBalanceOfBidder =
         await this.walletService.findLastTransaction(user.id);
       if (Number(lastWalletTransactionBalanceOfBidder) < amount) {
         throw new MethodNotAllowedException(
           'Sorry, Insufficient Balance.',
         );
       }
       //crete new transaction in bidder wallet
       const sellerWallet =  await this.walletService.create(user.id, BidderWalletData);
       //crete new transaction in alletre wallet
       const alletreWallet = await this.walletService.addToAlletreWallet(
         user.id,
         alletreWalletData);

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
        Button_URL:
          'https://www.alletre.com/alletre/home/${auctionHoldPaymentTransaction.auctionId}/details',
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
        Button_URL:
          'https://www.alletre.com/alletre/home/${auctionHoldPaymentTransaction.auctionId}/details',
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
          const otherBidderMessage = `${paymentData.user.userName} has placed a bid (AED ${paymentData.amount}) on ${paymentData.auction.product.title} (Model: ${paymentData.auction.product.model})`;
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
      this.auctionGateway.increaseBid(paymentData.auction)
      return paymentData;
    }
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
         throw new MethodNotAllowedException(
           'Sorry, Insufficient Balance.',
         );
       }
       //crete new transaction in bidder wallet
       const sellerWallet = await this.walletService.create(user.id, BidderWalletData);
       //crete new transaction in alletre wallet
       const alletreWallet = await this.walletService.addToAlletreWallet(
         user.id,
         alletreWalletData);
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

        if (
          !winnedBidderDepositPaymentData.isWalletPayment &&
          winnedBidderDepositPaymentData.paymentIntentId
        ) {
          try {
            const is_SD_SendBackToWinner =
              await this.stripeService.cancelDepositPaymentIntent(
                winnedBidderDepositPaymentData.paymentIntentId,
              );
            if (is_SD_SendBackToWinner) {
              console.log('SD send back to winner - stripe');
            }
          } catch (error) {
            console.error(
              'Error when sending back SD  for winning bidder:',
              error,
            );
          }
        } else {
          try {
            //finding the last transaction balance of the winner
            const lastWalletTransactionBalanceOfWinner =
              await this.walletService.findLastTransaction(
                winnedBidderDepositPaymentData.userId,
              );
            //finding the last transaction balance of the alletreWallet
            const lastBalanceOfAlletre =
              await this.walletService.findLastTransactionOfAlletre();
            //wallet data for the winner bidder
            const BidderWalletData = {
              status: WalletStatus.DEPOSIT,
              transactionType: WalletTransactionType.By_AUCTION,
              description: `Return security deposit after auction win`,
              amount: Number(winnedBidderDepositPaymentData.amount),
              auctionId: Number(winnedBidderDepositPaymentData.auctionId),
              balance: lastWalletTransactionBalanceOfWinner
                ? Number(lastWalletTransactionBalanceOfWinner) +
                  Number(winnedBidderDepositPaymentData.amount)
                : Number(winnedBidderDepositPaymentData.amount),
            };
            // wallet data for deposit to alletre wallet

            const alletreWalletData = {
              status: WalletStatus.WITHDRAWAL,
              transactionType: WalletTransactionType.By_AUCTION,
              description: `Return of bidder security deposit after auction win`,
              amount: Number(winnedBidderDepositPaymentData.amount),
              auctionId: Number(winnedBidderDepositPaymentData.auctionId),
              balance:
                Number(lastBalanceOfAlletre) -
                Number(winnedBidderDepositPaymentData.amount),
            };
            await this.walletService.create(
              winnedBidderDepositPaymentData.userId,
              BidderWalletData,
            );
            //crete new transaction in alletre wallet
            await this.walletService.addToAlletreWallet(
              winnedBidderDepositPaymentData.userId,
              alletreWalletData,
            );
          } catch (error) {
            console.error(
              'Error when sending back SD  for winning bidder:',
              error,
            );
          }
        }
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
                  <p>Great news! The winning bidder for your auction, [Auction Title], has completed the payment in full.</p>
                  <p>Auction Details:</p>
                  <ul>
                    <li>Item: ${paymentData.auction.product.title}</li>
                    <li>Winning Bid: ${paymentData.auction.bids[0].amount}</li>
                    <li>Buyer:  ${paymentData.auction.bids[0].user.userName}</li>
                    <li>Delivery Option Chosen: [Delivery/Pickup] </li>
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
          Button_URL: 'https://www.alletre.com/alletre/profile/my-bids/pending',
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
    stripeAmount:number,
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
    payingAmount:number,
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
        balance: Number(lastWalletTransactionBalanceOfBidder) - payingAmountWithFees,
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
       if (Number(lastWalletTransactionBalanceOfBidder) < payingAmountWithFees) {
         throw new MethodNotAllowedException('Sorry, Insufficient Balance.');
       }
       //crete new transaction in bidder wallet
       const sellerWallet = await this.walletService.create(user.id, buyerWalletData);
       //crete new transaction in alletre wallet
       const alletreWallet = await this.walletService.addToAlletreWallet(
         user.id,
         alletreWalletData,);
          // create new payment database
          if (!sellerWallet || !alletreWallet) {
            console.error('Failed to create the seller wallet or the alletre wallet when buy now with wallet')
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
                  Button_URL: 'https://www.alletre.com/alletre/',
                };
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
                
                We know it’s disappointing, but there are always more exciting auctions to explore on Alletre.
                `;

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
          }),
        );
        //Notifying delivery request to admin
        this.adminGateway.emitEventToAdmins(
          'delivery:newNotification',
          paymentData,
        );
        this.auctionGateway.buyNowPurchase(auctionId)
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
    stripeAmount:number,
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
                include: { product: { include: { images: true } }, user: true, bids:true, },
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
            const auctionEndDate = new Date(
              auctionHoldPaymentTransaction.auction.expiryDate,
            );
            const formattedEndDate = auctionEndDate.toISOString().split('T')[0];
            const formattedEndTime = auctionEndDate.toTimeString().slice(0, 5);
            const emailBodyToSeller = {
              subject: '🎉 Exciting News: Your Auction Just Got Its First Bid!',
              title: 'Your Auction is Officially in Motion!',
              Product_Name: auctionHoldPaymentTransaction.auction.product.title,
              img: auctionHoldPaymentTransaction.auction.product.images[0]
                .imageLink,
              userName: `${auctionHoldPaymentTransaction.auction.user.userName}`,
              message1: ` 
                  <p>Congratulations! Your auction ${
                    auctionHoldPaymentTransaction.auction.product.title
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
              Button_URL:
                'https://www.alletre.com/alletre/home/${auctionHoldPaymentTransaction.auctionId}/details',
            };

            const emailBodyToSecondLastBidder = {
              subject: 'You have been outbid! 🔥 Don’t Let This Slip Away!',
              title: 'Your Bid Just Got Beaten!',
              Product_Name: auctionHoldPaymentTransaction.auction.product.title,
              img: auctionHoldPaymentTransaction.auction.product.images[0],
              userName: `${joinedBidders[1]?.user.userName}`,
              message1: ` 
                  <p>Exciting things are happening on ${
                    auctionHoldPaymentTransaction.auction.product.title
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
                       auctionHoldPaymentTransaction.auction.product.title
                     } . The clock is ticking, and every second counts!</p>       
                     <p><b>Reclaim Your Spot as the Top Bidder Now!</b></p>
                  `,
              message2: ` 
                               <p>Stay ahead of the competition and secure your win!</p>
                  
             
                               <p style="margin-bottom: 0;">Good luck,</p>
                              <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                              <p>P.S. Stay tuned for updates—we’ll let you know if there’s more action on this auction.</p>`,
              Button_text: 'Place a Higher Bid',
              Button_URL:
                'https://www.alletre.com/alletre/home/${auctionHoldPaymentTransaction.auctionId}/details',
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
            const auction = auctionHoldPaymentTransaction.auction;
            const isCreateNotificationToSeller =
              await this.prismaService.notification.create({
                data: {
                  userId: auctionHoldPaymentTransaction.auction.user.id,
                  message: `Mr. ${auctionHoldPaymentTransaction.user.userName} has placed a new bid on your auction for the product "${auctionHoldPaymentTransaction.auction.product.title}" (Model: ${auctionHoldPaymentTransaction.auction.product.model}).`,
                  imageLink: auction.product.images[0].imageLink,
                  productTitle: auction.product.title,
                  auctionId: auctionHoldPaymentTransaction.auctionId,
                },
              });

            const isCreateNotificationToCurrentBidder =
              await this.prismaService.notification.create({
                data: {
                  userId: auctionHoldPaymentTransaction.userId,
                  message: `You have successfully placed a bid on the product "${auctionHoldPaymentTransaction.auction.product.title}" (Model: ${auctionHoldPaymentTransaction.auction.product.model}).`,
                  imageLink: auction.product.images[0].imageLink,
                  productTitle: auction.product.title,
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
                // Send notification to seller
                const currentBidderId = auctionHoldPaymentTransaction.userId;

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
                const currentUserId = auctionHoldPaymentTransaction.userId;
                const joinedAuctionUsers =
                  await this.notificationsService.getAllJoinedAuctionUsers(
                    auctionHoldPaymentTransaction.auctionId,
                    currentUserId,
                  );
                const imageLink = auction.product.images[0].imageLink;
                const productTitle = auction.product.title;
                const otherBidderMessage = `${auctionHoldPaymentTransaction.user.userName} has placed a bid of AED ${paymentIntent.metadata.bidAmount} on the product "${auctionHoldPaymentTransaction.auction.product.title}" (Model: ${auctionHoldPaymentTransaction.auction.product.model}).`;
                const isBidders = true;
                await this.notificationsService.sendNotifications(
                  joinedAuctionUsers,
                  otherBidderMessage,
                  imageLink,
                  productTitle,
                  auctionHoldPaymentTransaction.auctionId,
                  isBidders,
                );
              } catch (error) {
                console.log('sendNotificationToSpecificUsers error', error);
              }
            }
            this.auctionGateway.increaseBid(joinedBidders[0].auction)

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
              auctionHoldPaymentTransaction.auctionId,
              auctionHoldPaymentTransaction.auction.user.email,
            );
            if (auctionHoldPaymentTransaction.auction.type !== 'SCHEDULED') {
              await this.prismaService.notification.create({
                data: {
                  userId: auctionHoldPaymentTransaction.userId,
                  message:
                    'Congratulations! Your auction has been published successfully.',
                  imageLink:
                    auctionHoldPaymentTransaction.auction.product.images[0]
                      .imageLink,
                  productTitle:
                    auctionHoldPaymentTransaction.auction.product.title,
                  auctionId: auctionHoldPaymentTransaction.auctionId,
                },
              });
              const currentUserId = auctionHoldPaymentTransaction.userId;
              const usersId =
                await this.notificationsService.getAllRegisteredUsers(
                  currentUserId,
                );
              const imageLink =
                auctionHoldPaymentTransaction.auction.product.images[0]
                  .imageLink;
              const productTitle =
                auctionHoldPaymentTransaction.auction.product.title;
              const message = 'New Auction has been published.';
              const isBidders = false;
              await this.notificationsService.sendNotifications(
                usersId,
                message,
                imageLink,
                productTitle,
                auctionHoldPaymentTransaction.auctionId,
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
              const lastBalanceOfAlletre =
                await this.walletService.findLastTransactionOfAlletre();
                const baseValue = Number(paymentSuccessData.amount);
                const auctionFee = ((baseValue * 0.5) / 100)
                const stripeFee = (((baseValue * 3) /100) + 1 )// stripe takes 3% of the base value and additionally 1 dirham
                const payingAmountWithFees = baseValue + auctionFee
                const payingAmountWithStripeAndAlletreFees =  (payingAmountWithFees+ stripeFee) 
              const amountToAlletteWalletAfterStripeDeduction = payingAmountWithStripeAndAlletreFees - (((payingAmountWithStripeAndAlletreFees * 3)/100)+1)   
              const alletreWalletData = {
                status: WalletStatus.DEPOSIT,
                transactionType: WalletTransactionType.By_AUCTION,
                description: `Complete Payment of winner bidder`,
                amount: Number(amountToAlletteWalletAfterStripeDeduction),
                auctionId: Number(paymentSuccessData.auctionId),
                balance: lastBalanceOfAlletre
                  ? Number(lastBalanceOfAlletre) +
                    Number(amountToAlletteWalletAfterStripeDeduction)
                  : Number(amountToAlletteWalletAfterStripeDeduction),
              };
              await this.walletService.addToAlletreWallet(
                paymentSuccessData.auction.user.id,
                alletreWalletData,
              );
              //here need send the back the security deposit of winner
              const winnedBidderDepositPaymentData =
                await this.getAuctionPaymentTransaction(
                  paymentSuccessData.userId,
                  paymentSuccessData.auctionId,
                  PaymentType.BIDDER_DEPOSIT,
                );

              if (
                !winnedBidderDepositPaymentData.isWalletPayment &&
                winnedBidderDepositPaymentData.paymentIntentId
              ) {
                try {
                  const is_SD_SendBackToWinner =
                    await this.stripeService.cancelDepositPaymentIntent(
                      winnedBidderDepositPaymentData.paymentIntentId,
                    );
                  if (is_SD_SendBackToWinner) {
                    console.log('SD send back to winner - stripe');
                  }
                } catch (error) {
                  console.error(
                    'Error when sending back SD  for winning bidder:',
                    error,
                  );
                }
              } else {
                try {
                  //finding the last transaction balance of the winner
                  const lastWalletTransactionBalanceOfWinner =
                    await this.walletService.findLastTransaction(
                      winnedBidderDepositPaymentData.userId,
                    );
                  //finding the last transaction balance of the alletreWallet
                  const lastBalanceOfAlletre =
                    await this.walletService.findLastTransactionOfAlletre();
                  //wallet data for the winner bidder
                  const BidderWalletData = {
                    status: WalletStatus.DEPOSIT,
                    transactionType: WalletTransactionType.By_AUCTION,
                    description: `Return security deposit after auction win`,
                    amount: Number(winnedBidderDepositPaymentData.amount),
                    auctionId: Number(winnedBidderDepositPaymentData.auctionId),
                    balance: lastWalletTransactionBalanceOfWinner
                      ? Number(lastWalletTransactionBalanceOfWinner) +
                        Number(winnedBidderDepositPaymentData.amount)
                      : Number(winnedBidderDepositPaymentData.amount),
                  };
                  // wallet data for deposit to alletre wallet

                  const alletreWalletData = {
                    status: WalletStatus.WITHDRAWAL,
                    transactionType: WalletTransactionType.By_AUCTION,
                    description: `Return of bidder security deposit after aution win`,
                    amount: Number(winnedBidderDepositPaymentData.amount),
                    auctionId: Number(winnedBidderDepositPaymentData.auctionId),
                    balance:
                      Number(lastBalanceOfAlletre) -
                      Number(winnedBidderDepositPaymentData.amount),
                  };
                  await this.walletService.create(
                    winnedBidderDepositPaymentData.userId,
                    BidderWalletData,
                  );
                  //crete new transaction in alletre wallet
                  await this.walletService.addToAlletreWallet(
                    winnedBidderDepositPaymentData.userId,
                    alletreWalletData,
                  );
                } catch (error) {
                  console.error(
                    'Error when sending back SD  for winning bidder:',
                    error,
                  );
                }
              }
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
                    <li>Delivery Option Chosen: [Delivery/Pickup] </li>
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
              const invoicePDF = await generateInvoicePDF(paymentSuccessData);
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
                console.log('operation 1 started')
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
                console.log('operation 1 completed')
                console.log('operation 2 started')
                await prisma.joinedAuction.updateMany({
                  where: {
                    auctionId: auctionPaymentTransaction.auctionId,
                  },
                  data: { status: JoinedAuctionStatus.LOST },
                });
                console.log('operation 2 completed')
                //here i have created the joinedAuction and bids due to there where no
                //funtionalities has implemented to handle the delevery and any other things track
                //item after buy now completed. by creating the joined auction and bids, it will act as normal bids
                //------------------------------------------------------------
                // Join user to auction
                console.log('operation 3 started')

                await prisma.joinedAuction.create({
                  data: {
                    userId: isPaymentSuccess.userId,
                    auctionId: auctionPaymentTransaction.auctionId,
                    status: JoinedAuctionStatus.WAITING_FOR_DELIVERY,
                  },
                });
                console.log('operation 3 completed')

                console.log('operation 4 started')
                // Create bid for user
                await prisma.bids.create({
                  data: {
                    userId: isPaymentSuccess.userId,
                    auctionId: auctionPaymentTransaction.auctionId,
                    amount: isPaymentSuccess.amount,
                  },
                });
                console.log('operation 4 started')

                //------------------------------------------------------------

                // Update auction status to sold
                await prisma.auction.update({
                  where: { id: auctionPaymentTransaction.auctionId },
                  data: { status: AuctionStatus.SOLD },
                });
                console.log('operation 4 completed')
                return { isPaymentSuccess };
              },
              { timeout: 10000 }
            );

            if (isPaymentSuccess) {
              console.log('Buy now payment is success :', isPaymentSuccess.user.email)
              // adding the buynow purchase money to alletre wallet for
              const lastWalletTransactionAlletre =
                await this.walletService.findLastTransactionOfAlletre();
                const baseValue = Number(isPaymentSuccess.amount);
                const auctionFee = ((baseValue * 0.5) / 100)
                const stripeFee = (((baseValue * 3) /100) + 1 )// stripe takes 3% of the base value and additionally 1 dirham
                const payingAmountWithFees = baseValue + auctionFee
                const payingAmountWithStripeAndAlletreFees =  (payingAmountWithFees+ stripeFee) 
              const amountToAlletteWalletAfterStripeDeduction = payingAmountWithStripeAndAlletreFees - (((payingAmountWithStripeAndAlletreFees * 3)/100)+1)   
              const walletDataToAlletre = {
                status: WalletStatus.DEPOSIT,
                transactionType: WalletTransactionType.By_AUCTION,
                description: 'Buy Now purchase amount after deducting the amount of stripe fee',
                amount: Number(amountToAlletteWalletAfterStripeDeduction),
                auctionId: Number(isPaymentSuccess.auctionId),
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
                        Button_URL: 'https://www.alletre.com/alletre/',
                      };
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
                }),
              );
              //Notifying delivery request to admin
              this.adminGateway.emitEventToAdmins(
                'delivery:newNotification',
                isPaymentSuccess,
              );
              this.auctionGateway.buyNowPurchase(isPaymentSuccess.auctionId)
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
   try {
    return await this.prismaService.payment.findFirst({
      where: {
        userId,
        auctionId,
        type: type,
      },
    });
   } catch (error) {
    console.log('get auction payment transaction error :',error)
   }
  }
  async publishAuction(auctionId: number, currentUserEmail?: string) {
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

            await this.emailBatchService.sendBulkEmails(
              updatedAuction,
              currentUserEmail,
            );
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
            await this.emailBatchService.sendBulkEmails(
              updatedAuction,
              currentUserEmail,
            );
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
    const newDate =
      process.env.NODE_ENV === 'production'
        ? new Date(date.getTime() + hours * 60 * 60 * 1000)
        : new Date(date.getTime() +   10 * 60 * 1000); 
    // const newDate = new Date(date.getTime() + 6 * 60 * 1000);

    return newDate;
  }

  addDays(date: Date, days: number) {
    const currentDate = date;
    const newDate = new Date(currentDate.setDate(currentDate.getDate() + days));
    return newDate;
  }
}
