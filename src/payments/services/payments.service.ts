import { Injectable, InternalServerErrorException, MethodNotAllowedException } from '@nestjs/common';
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
import { EmailSerivce } from 'src/emails/email.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { WalletService } from 'src/wallet/wallet.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly stripeService: StripeService,
    private readonly prismaService: PrismaService,
    private readonly emailService : EmailSerivce,
    private readonly walletService: WalletService,
  ) {}

    async walletPayDepositBySeller(
      user:User,
      auctionId:number,
      // currency:number,
      amount:number,
    ){
      try {

      // Check if seller has already pay a deposit for auction
      const userPaymentForAuction = await this.getAuctionPaymentTransaction(
        user.id,
        auctionId,
        PaymentType.SELLER_DEPOSIT,
      );
      if(userPaymentForAuction){
        

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

        if(userPaymentForAuction.isWalletPayment){
          throw new MethodNotAllowedException('already paid');
        }
        //check previous payment attempt thorugh stripe or not
        if( userPaymentForAuction.paymentIntentId){
          throw new MethodNotAllowedException(
            'Wallet payment is not available for this auction. Please select an online payment method to proceed.',
          ); 
        }

        return userPaymentForAuction
      }


        //finding the last transaction balance of the Seller 
        const lastWalletTransactionBalanceOfSeller = await this.walletService.findLastTransaction(user.id) 
        //finding the last transaction balance of the alletreWallet
        const lastBalanceOfAlletre = await this.walletService.findLastTransactionOfAlletre()
        if(Number(lastWalletTransactionBalanceOfSeller) < amount){
          throw new MethodNotAllowedException(
            'Sorry, Insufficient Balance.',
          );
        }
      //wallet data for withdraw money from seller wallet

        let SellerWalletData = {
          status:WalletStatus.WITHDRAWAL,
          transactionType:WalletTransactionType.By_AUCTION,
          description:`Security deposit for publishing the new auction`,
          amount:amount,
          auctionId:Number(auctionId),
          balance:Number(lastWalletTransactionBalanceOfSeller) - amount
          
        }
        // wallet data for deposit to alletre wallet
        
        let alletreWalletData = {
          status:WalletStatus.DEPOSIT,
          transactionType:WalletTransactionType.By_AUCTION,
          description:`Seller security deposit for publishing new auction `,
          amount:amount,
          auctionId:Number(auctionId),
          balance:lastBalanceOfAlletre ?
          (Number(lastBalanceOfAlletre) + amount) : amount
        }
  
      
        const {paymentData} =await this.prismaService.$transaction(async(prisma)=>{
    
          //checking again the wallet balance to avoid issues
          const lastWalletTransactionBalanceOfSeller = await this.walletService.findLastTransaction(user.id);
          if (Number(lastWalletTransactionBalanceOfSeller) < amount) {
            throw new MethodNotAllowedException('Sorry, Insufficient Balance.');
          }
          //crete new transaction in seller wallet
          await this.walletService.create(user.id,SellerWalletData)
          //crete new transaction in alletre wallet
          await this.walletService.addToAlletreWallet(user.id,alletreWalletData)
          // create new payment database
          const paymentData = await prisma.payment.create({
            data: {
              userId: user.id,
              auctionId: auctionId,
              amount: amount,
              type: PaymentType.SELLER_DEPOSIT,
              isWalletPayment:true,
              status:'SUCCESS'          },
          })
         
          if(paymentData){
           await this.publishAuction(auctionId)
          }else{
             throw new InternalServerErrorException('Failed to process wallet payment');
          }
          
          return {paymentData}
        })

        return paymentData
      } catch (error) {
        console.log('wallet pay deposit by seller error :',error)
        throw new InternalServerErrorException('Failed to process wallet payment');
      }
    }
  async payDepositBySeller(
    user: User,
    auctionId: number,
    currency: string,
    amount: number,
  ) {
    try {
      console.log('online payment')
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
    console.log('stripeCustomerId :',stripeCustomerId)
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
      console.log('stripe pay deposit by seller error :',error)
      throw new InternalServerErrorException('Failed to process stripe payment');
    }
  }

  async walletPayDepositByBidder(
    user: User,
    auctionId: number,
    // currency: string,
    amount: number,
    bidAmount: number,
  ){
    try {
      console.log('test of wallet pay of bidder deposite 1')
      // Check if bidder has already pay deposit for auction
    const bidderPaymentForAuction = await this.getAuctionPaymentTransaction(
      user.id,
      auctionId,
      PaymentType.BIDDER_DEPOSIT,
    );
    if(bidderPaymentForAuction){

      console.log('pay deposite by bidder (is already paid ?)===>',bidderPaymentForAuction);
      console.log('test of wallet pay of bidder deposite 2')
      if(bidderPaymentForAuction.isWalletPayment){
        throw new MethodNotAllowedException('already paid');
      } 

      //check previous payment attempt thorugh stripe or not
      if( bidderPaymentForAuction.paymentIntentId){
        throw new MethodNotAllowedException(
          'Wallet payment is not available for this auction. Please select an online payment method to proceed.',
        ); 
      }
      return bidderPaymentForAuction
    }
    //finding the last transaction balance of the bidder 
    const lastWalletTransactionBalanceOfBidder = await this.walletService.findLastTransaction(user.id) 
    //finding the last transaction balance of the alletreWallet
    const lastBalanceOfAlletre = await this.walletService.findLastTransactionOfAlletre()
    if(Number(lastWalletTransactionBalanceOfBidder) < amount){
      throw new MethodNotAllowedException(
        'Sorry, Insufficient Balance.',
      );
    }
    //wallet data for withdraw money from bidder wallet

    let BidderWalletData = {
      status:WalletStatus.WITHDRAWAL,
      transactionType:WalletTransactionType.By_AUCTION,
      description:`Security deposit for for participating with an auction`,
      amount:amount,
      auctionId:Number(auctionId),
      balance:Number(lastWalletTransactionBalanceOfBidder) - amount
      
    }
    // wallet data for deposit to alletre wallet
    
    let alletreWalletData = {
      status:WalletStatus.DEPOSIT,
      transactionType:WalletTransactionType.By_AUCTION,
      description:`Security deposit for for participating with an auction`,
      amount:amount,
      auctionId:Number(auctionId),
      balance:lastBalanceOfAlletre ?
      (Number(lastBalanceOfAlletre) + amount) : amount
    }
    const {paymentData} =await this.prismaService.$transaction(async(prisma)=>{
       try {
      console.log('test of wallet pay of bidder deposite 3')

         //checking again the wallet balance to avoid issues
         const lastWalletTransactionBalanceOfBidder = await this.walletService.findLastTransaction(user.id);
         if (Number(lastWalletTransactionBalanceOfBidder) < amount) {
           throw new MethodNotAllowedException('Sorry, Insufficient Balance.');
         }
         //crete new transaction in bidder wallet
         await this.walletService.create(user.id,BidderWalletData)
         //crete new transaction in alletre wallet
         await this.walletService.addToAlletreWallet(user.id,alletreWalletData)
        // Join user to auction
         await prisma.joinedAuction.create({
           data: {
             userId: user.id,
             auctionId: auctionId,
           },
         })
             // Create bid for user
             await prisma.bids.create({
               data: {
                 userId: user.id,
                 auctionId: auctionId,
                 amount: bidAmount,
               },
             })
         // create new payment database
         const paymentData = await prisma.payment.create({
           data: {
             userId: user.id,
             auctionId: auctionId,
             amount: amount,
             type: PaymentType.BIDDER_DEPOSIT,
             isWalletPayment:true,
             status:'SUCCESS'          },
         })
        
         return {paymentData}
       } catch (error) {
        console.log('wallet pay deposit error at prisma.$transaction() :',error )
          throw new InternalServerErrorException('Failed to process wallet payment for bidder deoposit');
        
       }
    })
    console.log('test of wallet pay of bidder deposite 4')
    return paymentData
    } catch (error) {
      console.log('wallet pay deposit by bidder error :',error)
      throw new InternalServerErrorException('Failed to process wallet payment for bidder deoposit');
    }
  }
  
  async  payDepositByBidder(
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
      console.log('pay deposite by bidder===>',bidderPaymentForAuction);
      
      if (paymentIntent.status === 'succeeded') {
        throw new MethodNotAllowedException('already paid');
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
  ){
    try {
      console.log('test of wallet pay of bidder payment payAuctionByBidderWithWallet 1')
      // Check if bidder has already has transaction for auction
    const bidderPaymentTransaction = await this.getAuctionPaymentTransaction(
      user.id,
      auctionId,
      PaymentType.AUCTION_PURCHASE,
    );
    if (bidderPaymentTransaction) {
      console.log('test of wallet pay of bidder payment payAuctionByBidderWithWallet 2')
      if (bidderPaymentTransaction.status === 'SUCCESS')
        throw new MethodNotAllowedException('already paid');

       //check previous payment attempt thorugh stripe or not
       if( bidderPaymentTransaction.paymentIntentId){
        throw new MethodNotAllowedException(
          'Wallet payment is not available for this auction. Please select an online payment method to proceed.',
        ); 
      }
      return bidderPaymentTransaction
    }

      //finding the last transaction balance of the Seller 
      const lastWalletTransactionBalanceOfBidder = await this.walletService.findLastTransaction(user.id) 
      //finding the last transaction balance of the alletreWallet
      const lastBalanceOfAlletre = await this.walletService.findLastTransactionOfAlletre()
      if(Number(lastWalletTransactionBalanceOfBidder) < amount){
        throw new MethodNotAllowedException(
          'Sorry, Insufficient Balance.',
        );
      }

      let BidderWalletData = {
        status:WalletStatus.WITHDRAWAL,
        transactionType:WalletTransactionType.By_AUCTION,
        description:`Complete Payment of winner bidder`,
        amount:amount,
        auctionId:Number(auctionId),
        balance:Number(lastWalletTransactionBalanceOfBidder) - amount
        
      }
      // wallet data for deposit to alletre wallet
      
      let alletreWalletData = {
        status:WalletStatus.DEPOSIT,
        transactionType:WalletTransactionType.By_AUCTION,
        description:`Complete Payment of winner bidder`,
        amount:amount,
        auctionId:Number(auctionId),
        balance:lastBalanceOfAlletre ?
        (Number(lastBalanceOfAlletre) + amount) : amount
      }

      const joinedAuction =
              await this.prismaService.joinedAuction.findFirst({
                where: {
                  userId: user.id,
                  auctionId: auctionId,
                },
                include:{
                  user:true
                }
              });
      const {paymentData} =await this.prismaService.$transaction(async(prisma)=>{
        try {
       console.log('test of wallet pay of bidder deposite payAuctionByBidderWithWallet 3')
 
          //checking again the wallet balance to avoid issues
          const lastWalletTransactionBalanceOfBidder = await this.walletService.findLastTransaction(user.id);
          if (Number(lastWalletTransactionBalanceOfBidder) < amount) {
            throw new MethodNotAllowedException('Sorry, Insufficient Balance.');
          }
          //crete new transaction in bidder wallet
          await this.walletService.create(user.id,BidderWalletData)
          //crete new transaction in alletre wallet
          await this.walletService.addToAlletreWallet(user.id,alletreWalletData)
          
          // Update joinedAuction for bidder to WAITING_DELIVERY
           await prisma.joinedAuction.update({
            where: { id: joinedAuction.id },
            data: {
              status: JoinedAuctionStatus.WAITING_FOR_DELIVERY,
            },
          })
          // Update auction status to sold
          await prisma.auction.update({
            where: { id:auctionId },
            data: { status: AuctionStatus.SOLD },
          })

          const paymentData = await prisma.payment.create({
            data: {
              userId: user.id,
              auctionId: auctionId,
              amount: amount,
              type: PaymentType.AUCTION_PURCHASE,
              isWalletPayment:true,
              status:'SUCCESS'          },
          })
      
        console.log('test of wallet pay of bidder deposite payAuctionByBidderWithWallet 4')
         
          return {paymentData}
        } catch (error) {
         console.log('wallet pay deposit error at prisma.$transaction() :',error )
           throw new InternalServerErrorException('Failed to process wallet payment for bidder deoposit');
         
        }
     })
      return paymentData
    } catch (error) {
      console.log('wallet pay deposit error at prisma.$transaction() :',error )
        throw new InternalServerErrorException('Failed to process wallet payment for bidder deoposit');
      
     }
  }
  async payAuctionByBidder(
    user: User,
    auctionId: number,
    currency: string,
    amount: number,
  ){
    // Create SripeCustomer if has no account
    let stripeCustomerId: string = user?.stripeId || '';;
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
      console.log('bidderPaymentTransaction data :',bidderPaymentTransaction)
      console.log('paymentIntent.status :',paymentIntent.status)

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

  async createBuyNowPaymentTransaction(
    user: User,
    auctionId: number,
    currency: string,
    amount: number,
  ) {
    // Create SripeCustomer if has no account
    let stripeCustomerId: string = user?.stripeId || '';;
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

    // Check if user has already has transaction for auction
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
    console.log('Webhook Called ==> payload',payload);
    console.log('Webhook Called ==> stripeSignature',stripeSignature);

    const { paymentIntent, status } = await this.stripeService.webHookHandler(
      payload,
      stripeSignature,
    );
    console.log('PaymentIntent data :===>',paymentIntent,status);

    switch (status) {
      case PaymentStatus.CANCELLED: 
      // const auctionCancelPaymentTransaction =
          await this.prismaService.payment.update({
            where: { paymentIntentId: paymentIntent.id },
            data:{status:PaymentStatus.CANCELLED}
          });
          
      break;  
      case PaymentStatus.HOLD:

        const auctionHoldPaymentTransaction =
          await this.prismaService.payment.findUnique({
            where: { paymentIntentId: paymentIntent.id },
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

            break;
            case PaymentType.SELLER_DEPOSIT:
              console.log('Webhook SELLER_DEPOSIT ...');
  
              // Update Auction
              await this.publishAuction(auctionHoldPaymentTransaction.auctionId);
  
              // Update payment transaction
              await this.prismaService.payment.update({
                where: { paymentIntentId: paymentIntent.id },
                data: { status: PaymentStatus.HOLD },
              });
              break;
              default:
                break
          }
        break;

        //==============================================================
      case PaymentStatus.SUCCESS:
        const auctionPaymentTransaction =
          await this.prismaService.payment.findUnique({
            where: { paymentIntentId: paymentIntent.id },
          });
          console.log('auctionPaymentTransaction :' ,auctionPaymentTransaction,paymentIntent )
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
                include:{
                  user:true
                }
              });

       
           const {paymentSuccessData} = await this.prismaService.$transaction(async prisma =>{
                   // Update payment transaction
                 const paymentSuccessData =    await prisma.payment.update({
                    where: { paymentIntentId: paymentIntent.id },
                    data: { status: PaymentStatus.SUCCESS },
                    include:{auction:{include:{
                      product:{include:{images:true}},
                      user:true
                    }}}
                  })
    
                  // Update joinedAuction for bidder to WAITING_DELIVERY
                  await prisma.joinedAuction.update({
                    where: { id: joinedAuction.id },
                    data: {
                      status: JoinedAuctionStatus.WAITING_FOR_DELIVERY,
                    },
                  })
    
                  // Update auction status to sold
                  await prisma.auction.update({
                    where: { id: auctionPaymentTransaction.auctionId },
                    data: { status: AuctionStatus.SOLD },
                  })
                  return {paymentSuccessData}
            })
            if(paymentSuccessData){
              //send email to the seller 
              let emailBodyToSeller = {
                subject :'Payment successful',
                title:'Your auction winner has paid the full amount',
                Product_Name : paymentSuccessData.auction.product.title,
                img:paymentSuccessData.auction.product.images[0].imageLink,
                message:` Hi, ${paymentSuccessData.auction.user.userName}, 
                          The winner of your Auction of ${paymentSuccessData.auction.product.title}
                         (Model:${paymentSuccessData.auction.product.model}) has been paid the full amount. 
                         We would like to let you know that you can hand over the item to the winner. once the winner
                         confirmed the delvery, we will send the money to your wallet. If you refuse to hand over the item, 
                         there is a chance to lose your security deposite.
                         If you would like to participate another auction, Please click the button below. Thank you. `,
                Button_text :'Click here to create another Auction',
                Button_URL :process.env.FRONT_URL
              }
              let emailBodyToWinner = {
                subject :'Payment successful',
                title:'Payment successful',
                Product_Name : paymentSuccessData.auction.product.title,
                img:paymentSuccessData.auction.product.images[0].imageLink,
                message:` Hi, ${joinedAuction.user.userName}, 
                          You have successfully paid the full amount of Auction of ${paymentSuccessData.auction.product.title}
                         (Model:${paymentSuccessData.auction.product.model}). Please confirm the delivery once the delivery is completed 
                         by clicking the confirm delivery button from the page : MY Bids -> waiting for delivery. 
                          We would like to thank you and appreciate you for choosing Alle Tre.  
                          If you would like to participate another auction, Please click the button below. Thank you. `,
                Button_text :'Click here to create another Auction',
                Button_URL :process.env.FRONT_URL
              }
              Promise.all([
                await this.emailService.sendEmail(paymentSuccessData.auction.user.email,'token',EmailsType.OTHER,emailBodyToSeller),
                await this.emailService.sendEmail(joinedAuction.user.email,'token',EmailsType.OTHER,emailBodyToWinner)
              ])
            }
            break;
          case PaymentType.BUY_NOW_PURCHASE:
            console.log('Webhook BUY_NOW_PURCHASE ...');

            await this.prismaService.$transaction([
              // Update payment transaction
              this.prismaService.payment.update({
                where: { paymentIntentId: paymentIntent.id },
                data: { status: PaymentStatus.SUCCESS },
              }),

              // Update auction status to sold
              this.prismaService.auction.update({
                where: { id: auctionPaymentTransaction.auctionId },
                data: { status: AuctionStatus.SOLD },
              }),
            ]);

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
    console.log('publish auction for checking :-->',auction);
    
    switch (auction.durationUnit) {
      case DurationUnits.DAYS:
        if (auction.type === AuctionType.ON_TIME) {
          // Set ON_TIME Daily auction ACTIVE
          const today = new Date();
          const expiryDate = this.addDays(today, auction.durationInDays);

          await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.ACTIVE,
              startDate: today,
              expiryDate: expiryDate,
            },
          });
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
          const expiryDate = this.addHours(new Date(), auction.durationInHours);

          await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.ACTIVE,
              startDate: today,
              expiryDate: expiryDate,
            },
          });
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
    // const newDate = new Date(date.getTime() + 10 * 60 * 1000); // Add 10 minutes

    return newDate;
  }

  addDays(date: Date, days: number) {
    const currentDate = date;
    const newDate = new Date(currentDate.setDate(currentDate.getDate() + days));
    return newDate;
  }
}
