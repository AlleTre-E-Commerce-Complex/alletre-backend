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
import { retry } from 'rxjs';
import { EmailsType } from 'src/auth/enums/emails-type.enum';
import { StripeService } from 'src/common/services/stripe.service';
import { EmailBatchService } from 'src/emails/email-batch.service';
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
    private readonly emailBatchService: EmailBatchService,
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
          // throw new MethodNotAllowedException(
          //   'Wallet payment is not available for this auction. Please select an online payment method to proceed.',
          // ); 
          return {
            paymentIntentId:userPaymentForAuction.paymentIntentId,
            message:'Wallet payment is not available for this auction. Please select an online payment method to proceed.',
          }
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
    console.log('userPaymentTransaction.paymentIntentId',userPaymentTransaction)
    console.log('test 1')
    if (userPaymentTransaction && userPaymentTransaction.paymentIntentId !== null ) {
      return {
        success :false,
        message_eng :'Sorry, you cannot select wallet payment, please choose online payment',
        message_arb :'عذرا، لا يمكنك اختيار الدفع عن طريق المحفظة، يرجى اختيار الدفع عبر الإنترنت',
      }
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

    console.log('test 2')

     let buyerWalletData = {
       status:WalletStatus.WITHDRAWAL,
       transactionType:WalletTransactionType.By_AUCTION,
       description:`Purchase Product through buy now`,
       amount:amount,
       auctionId:Number(auctionId),
       balance:Number(lastWalletTransactionBalanceOfBidder) - amount
       
     }
     // wallet data for deposit to alletre wallet
     
     let alletreWalletData = {
       status:WalletStatus.DEPOSIT,
       transactionType:WalletTransactionType.By_AUCTION,
       description:`Purchase Product through buy now`,
       amount:amount,
       auctionId:Number(auctionId),
       balance:lastBalanceOfAlletre ?
       (Number(lastBalanceOfAlletre) + amount) : amount
     }
    console.log('test 3')

    const {paymentData} = await this.prismaService.$transaction(async (prisma)=>{
    console.log('test 4')

       //checking again the wallet balance to avoid issues
       const lastWalletTransactionBalanceOfBidder = await this.walletService.findLastTransaction(user.id);
       if (Number(lastWalletTransactionBalanceOfBidder) < amount) {
         throw new MethodNotAllowedException('Sorry, Insufficient Balance.');
       }
          //crete new transaction in bidder wallet
          await this.walletService.create(user.id,buyerWalletData)
          //crete new transaction in alletre wallet
          await this.walletService.addToAlletreWallet(user.id,alletreWalletData)
          // Update auction status to sold
       

            const paymentData =    await prisma.payment.create({
              data: {
                userId: user.id,
                auctionId: auctionId,
                amount: amount,
                type: PaymentType.BUY_NOW_PURCHASE,
                isWalletPayment:true,
                status:'SUCCESS',
              },
              include:{user:true,
                auction:{include:{product:{include:{images:true}}}}
              }
            });

            await prisma.joinedAuction.updateMany({
              where: {
                auctionId: auctionId,
              },
              data: { status: JoinedAuctionStatus.LOST },
          
            })

            //here i have created the joinedAuction and bids due to there where no 
              //funtionalities has implemented to handle the delevery and any other things track
              //item after buy now completed. by creating the joined auction and bids, it will act as normal bids
              //------------------------------------------------------------
               // Join user to auction
               await prisma.joinedAuction.create({
                data: {
                  userId: user.id,
                  auctionId: auctionId,
                  status:JoinedAuctionStatus.WAITING_FOR_DELIVERY
                },
              })
                 // Create bid for user
                 await prisma.bids.create({
                  data: {
                    userId: user.id,
                    auctionId: auctionId,
                    amount: amount,
                  },
                })
                //------------------------------------------------------------

            await prisma.auction.update({
              where: { id: auctionId },
              data: { status: AuctionStatus.SOLD },
            })
      return {paymentData}
    })
    console.log('test 5')
    
    if(paymentData){
            //send an email to the buyer
            let emailBodyToBuyer = {
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
              Button_URL: process.env.FRONT_URL // Link to the buyer's purchase history or auction page
          };            
          await  this.emailService.sendEmail(paymentData.user.email,'token',EmailsType.OTHER,emailBodyToBuyer)

             //check is there any bidders on this auction
             const auctionPaymentData = await this.prismaService.payment.findMany({
              where:{auctionId:auctionId},
              include:{
                user:true,
                auction:{include:{product:{include:{images:true}}}}
              }
            })
            await Promise.all(auctionPaymentData.map(async (payment)=>{
              if(payment.type === 'BIDDER_DEPOSIT'){
                let is_SD_SendBackToBidder : boolean = false
              if(payment.isWalletPayment){
                //implement return security deposit funconality to wallet of bidders
                    //finding the last transaction balance of the Seller 
                      const lastWalletTransactionBalanceOfBidder = await this.walletService.findLastTransaction(payment.user.id) 
                      //finding the last transaction balance of the alletreWallet
                      const lastBalanceOfAlletre = await this.walletService.findLastTransactionOfAlletre()
                      
                      //wallet data for deposit to bidder wallet
                      let bidderWalletData = {
                        status:WalletStatus.DEPOSIT,
                        transactionType:WalletTransactionType.By_AUCTION,
                        description:`Auction ended; item purchased via Buy Now option.`,
                        amount:Number(payment.amount),
                        auctionId:Number(payment.auctionId),
                        balance:Number(lastWalletTransactionBalanceOfBidder) ?
                        Number(lastWalletTransactionBalanceOfBidder) + Number(payment.amount) : Number(payment.amount)
                        
                      }
                      // wallet data for WITHDRAWAL to alletre wallet
                      
                      let alletreWalletData = {
                        status:WalletStatus.WITHDRAWAL,
                        transactionType:WalletTransactionType.By_AUCTION,
                        description:`Auction ended; item purchased via Buy Now option.`,
                        amount:Number(payment.amount),
                        auctionId:Number(payment.auctionId),
                        balance:(Number(lastBalanceOfAlletre) - Number(payment.amount))
                      }
                      //crete new transaction in bidder wallet
                    const bidderWalletReuslt =  await this.walletService.create(payment.user.id,bidderWalletData)
                      //crete new transaction in alletre wallet
                    const alletreWalletResult =  await this.walletService.addToAlletreWallet(payment.user.id,alletreWalletData)
                      if(bidderWalletReuslt && alletreWalletResult)
                        is_SD_SendBackToBidder = true
              }else{
                //implement return security deposit funconality to stripe of bidders
                const isPaymentIntentCancelled = await this.stripeService.cancelDepositPaymentIntent(payment.paymentIntentId)
                if(isPaymentIntentCancelled)
                  is_SD_SendBackToBidder = true
              }
              if(is_SD_SendBackToBidder){
                 //send email to the seller 
               let emailBodyToLostBidders = {
                subject: 'Auction Concluded - Buy Now Option Used',
                title: 'Auction Concluded',
                Product_Name: payment.auction.product.title,
                img: payment.auction.product.images[0].imageLink,
                message: `Hi ${payment.user.userName}, 
                          We regret to inform you that the auction for ${payment.auction.product.title} 
                          (Model: ${payment.auction.product.model}) has concluded. 
                          Another user has successfully purchased the item using the "Buy Now" option. 
                          We will send back the security deopsit to your ${payment.isWalletPayment? 'wallet':'bank account'}
                          We appreciate your interest in the auction and encourage you to participate in future auctions. 
                          You can find more auctions listed on our platform. 
                          Thank you for being a valued member of our community!`,
                Button_text: 'Click here to view more Auctions',
                Button_URL: process.env.FRONT_URL // Link to the auction page
              };
            await  this.emailService.sendEmail(payment.user.email,'token',EmailsType.OTHER,emailBodyToLostBidders)
            
              }
            }else if (payment.type === 'SELLER_DEPOSIT'){
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
                  let emailBodyToSeller = {
                    subject: 'Auction Concluded - Buy Now Option Used',
                    title: 'Auction Concluded',
                    Product_Name: payment.auction.product.title,
                    img: payment.auction.product.images[0].imageLink,
                    message: `Hi ${payment.user.userName}, 
                              We are glad to inform you that the auction for ${payment.auction.product.title} 
                              (Model: ${payment.auction.product.model}) has concluded. 
                              One user has successfully purchased the item using the "Buy Now" option. 
                              We will send back the security deopsit to your ${payment.isWalletPayment? 'wallet ':'bank account '}
                              and we send the full amount to the your wallet once you delevered the item to the buyer.
                              We appreciate your interest in the auction and encourage you to participate in future auctions. 
                              You can find more auctions listed on our platform. 
                              Thank you for being a valued member of our community!`,
                    Button_text: 'Click here to view more Auctions',
                    Button_URL: process.env.FRONT_URL // Link to the auction page
                  };
                await  this.emailService.sendEmail(payment.user.email,'token',EmailsType.OTHER,emailBodyToSeller)
                
            }
            }))
    }else{
      throw new MethodNotAllowedException('Faild to complete the buy now payment');
    }
    console.log('test 6')

    return {
      success:true,
      data:{paymentData}
    }
    } catch (error) {
      console.log('wallet pay deposit error at prisma.$transaction() :',error )
        throw new InternalServerErrorException('Failed to process wallet payment for bidder deoposit');
      
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
             await Promise.all([
                 this.emailService.sendEmail(paymentSuccessData.auction.user.email,'token',EmailsType.OTHER,emailBodyToSeller),
                 this.emailService.sendEmail(joinedAuction.user.email,'token',EmailsType.OTHER,emailBodyToWinner)
              ])
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

       const {isPaymentSuccess} =  await this.prismaService.$transaction(async (prisma)=>{
                // Update payment transaction
               const isPaymentSuccess = await prisma.payment.update({
                where: { paymentIntentId: paymentIntent.id },
                data: { status: PaymentStatus.SUCCESS },
                include:{user:true,
                  auction:{include:{product:{include:{images:true}}}}
                }
              })
               await prisma.joinedAuction.updateMany({
                where: {
                  auctionId: auctionPaymentTransaction.auctionId,
                },
                data: { status: JoinedAuctionStatus.LOST },
            
              })
              //here i have created the joinedAuction and bids due to there where no 
              //funtionalities has implemented to handle the delevery and any other things track
              //item after buy now completed. by creating the joined auction and bids, it will act as normal bids
              //------------------------------------------------------------
               // Join user to auction
               await prisma.joinedAuction.create({
                data: {
                  userId: isPaymentSuccess.userId,
                  auctionId: auctionPaymentTransaction.auctionId,
                  status:JoinedAuctionStatus.WAITING_FOR_DELIVERY
                },
              })
                 // Create bid for user
                 await prisma.bids.create({
                  data: {
                    userId: isPaymentSuccess.userId,
                    auctionId: auctionPaymentTransaction.auctionId,
                    amount: isPaymentSuccess.amount,
                  },
                })
                //------------------------------------------------------------

              // Update auction status to sold
                await prisma.auction.update({
                where: { id: auctionPaymentTransaction.auctionId },
                data: { status: AuctionStatus.SOLD },
              })
              return {isPaymentSuccess}
            })
            
            if(isPaymentSuccess){
             // adding the buynow purchase money to alletre wallet for 
                const lastWalletTransactionAlletre= await  this.walletService.findLastTransactionOfAlletre()
                let walletDataToAlletre = {
                  status:WalletStatus.DEPOSIT,
                  transactionType:WalletTransactionType.By_AUCTION,
                  description:"Buy Now purchase",
                  amount:Number(isPaymentSuccess.amount),
                  auctionId:Number(isPaymentSuccess.auctionId),
                  balance: Number(lastWalletTransactionAlletre) ? 
                  Number(lastWalletTransactionAlletre) + Number(isPaymentSuccess.amount) :
                  Number(isPaymentSuccess.amount)
                }
                 
                await this.walletService.addToAlletreWallet(isPaymentSuccess.userId,walletDataToAlletre)
              
               //send an email to the buyer
               let emailBodyToBuyer = {
                subject: 'Congratulations on Your Purchase - Auction Concluded!',
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
                Button_URL: process.env.FRONT_URL // Link to the buyer's purchase history or auction page
            };            
            await  this.emailService.sendEmail(isPaymentSuccess.user.email,'token',EmailsType.OTHER,emailBodyToBuyer)
            
               //check is there any bidders on this auction
               const auctionPaymentData = await this.prismaService.payment.findMany({
                where:{auctionId:auctionPaymentTransaction.auctionId},
                include:{
                  user:true,
                  auction:{include:{product:{include:{images:true}}}}
                }
              })
             await Promise.all(auctionPaymentData.map(async (payment)=>{
                if(payment.type === 'BIDDER_DEPOSIT'){
                    let is_SD_SendBackToBidder : boolean = false
                  if(payment.isWalletPayment){
                    //implement return security deposit funconality to wallet of bidders
                        //finding the last transaction balance of the Seller 
                          const lastWalletTransactionBalanceOfBidder = await this.walletService.findLastTransaction(payment.user.id) 
                          //finding the last transaction balance of the alletreWallet
                          const lastBalanceOfAlletre = await this.walletService.findLastTransactionOfAlletre()
                          
                          //wallet data for deposit to bidder wallet
                          let bidderWalletData = {
                            status:WalletStatus.DEPOSIT,
                            transactionType:WalletTransactionType.By_AUCTION,
                            description:`Auction ended; item purchased via Buy Now option.`,
                            amount:Number(payment.amount),
                            auctionId:Number(payment.auctionId),
                            balance:Number(lastWalletTransactionBalanceOfBidder) ?
                            Number(lastWalletTransactionBalanceOfBidder) + Number(payment.amount) : Number(payment.amount)
                            
                          }
                          // wallet data for WITHDRAWAL to alletre wallet
                          
                          let alletreWalletData = {
                            status:WalletStatus.WITHDRAWAL,
                            transactionType:WalletTransactionType.By_AUCTION,
                            description:`Auction ended; item purchased via Buy Now option.`,
                            amount:Number(payment.amount),
                            auctionId:Number(payment.auctionId),
                            balance:(Number(lastBalanceOfAlletre) - Number(payment.amount))
                          }
                          //crete new transaction in bidder wallet
                        const bidderWalletReuslt =  await this.walletService.create(payment.user.id,bidderWalletData)
                          //crete new transaction in alletre wallet
                        const alletreWalletResult =  await this.walletService.addToAlletreWallet(payment.user.id,alletreWalletData)
                          if(bidderWalletReuslt && alletreWalletResult)
                            is_SD_SendBackToBidder = true
                  }else{
                    //implement return security deposit funconality to stripe of bidders
                    const isPaymentIntentCancelled = await this.stripeService.cancelDepositPaymentIntent(payment.paymentIntentId)
                    if(isPaymentIntentCancelled)
                      is_SD_SendBackToBidder = true
                  }
                  if(is_SD_SendBackToBidder){
                     //send email to the seller 
                   let emailBodyToLostBidders = {
                    subject: 'Auction Concluded - Buy Now Option Used',
                    title: 'Auction Concluded',
                    Product_Name: payment.auction.product.title,
                    img: payment.auction.product.images[0].imageLink,
                    message: `Hi ${payment.user.userName}, 
                              We regret to inform you that the auction for ${payment.auction.product.title} 
                              (Model: ${payment.auction.product.model}) has concluded. 
                              Another user has successfully purchased the item using the "Buy Now" option. 
                              We will send back the security deopsit to your ${payment.isWalletPayment? 'wallet':'bank account'}
                              We appreciate your interest in the auction and encourage you to participate in future auctions. 
                              You can find more auctions listed on our platform. 
                              Thank you for being a valued member of our community!`,
                    Button_text: 'Click here to view more Auctions',
                    Button_URL: process.env.FRONT_URL // Link to the auction page
                  };
                await  this.emailService.sendEmail(payment.user.email,'token',EmailsType.OTHER,emailBodyToLostBidders)
                
                  }
                }else if (payment.type === 'SELLER_DEPOSIT'){
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
                      let emailBodyToSeller = {
                        subject: 'Auction Concluded - Buy Now Option Used',
                        title: 'Auction Concluded',
                        Product_Name: payment.auction.product.title,
                        img: payment.auction.product.images[0].imageLink,
                        message: `Hi ${payment.user.userName}, 
                                  We are glad to inform you that the auction for ${payment.auction.product.title} 
                                  (Model: ${payment.auction.product.model}) has concluded. 
                                  One user has successfully purchased the item using the "Buy Now" option. 
                                  We will send back the security deopsit to your ${payment.isWalletPayment? 'wallet ':'bank account '}
                                  and we send the full amount to the your wallet once you delevered the item to the buyer.
                                  We appreciate your interest in the auction and encourage you to participate in future auctions. 
                                  You can find more auctions listed on our platform. 
                                  Thank you for being a valued member of our community!`,
                        Button_text: 'Click here to view more Auctions',
                        Button_URL: process.env.FRONT_URL // Link to the auction page
                      };
                    await  this.emailService.sendEmail(payment.user.email,'token',EmailsType.OTHER,emailBodyToSeller)
                    
                }
              }))
            }else{
             throw new MethodNotAllowedException('Faild to complete the buy now payment');
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
    console.log('publish auction for checking 1:-->',auction);
    
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
            include:{product:{include:{images:true}}}
          });
 

          if(updatedAuction){
        

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
          const expiryDate = this.addHours(new Date(), auction.durationInHours);

         const updatedAuction = await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.ACTIVE,
              startDate: today,
              expiryDate: expiryDate,
            },
            include:{product:{include:{images:true}}}
          });
          if(updatedAuction){
       

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
    // const newDate = new Date(date.getTime() + 10 * 60 * 1000); // Add 10 minutes

    return newDate;
  }

  addDays(date: Date, days: number) {
    const currentDate = date;
    const newDate = new Date(currentDate.setDate(currentDate.getDate() + days));
    return newDate;
  }

  
}
