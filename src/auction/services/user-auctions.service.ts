import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductUpdateDTO } from '../dtos/product-update.dto';
import { PaginationService } from '../../common/services/pagination.service';
import {
  AuctionCreationDTO,
  GetAuctionsByOtherUserDTO,
  GetAuctionsByOwnerDTO,
  GetAuctionsDTO,
  GetJoinAuctionsDTO,
  GetListedProductByOhterUserDTO,
  PaginationDTO,
  ProductDTO,
  AuctionUpdateDTO,
} from '../dtos';
import { FirebaseService } from 'src/firebase/firebase.service';
import {
  Auction,
  AuctionStatus,
  AuctionType,
  DeliveryType,
  DurationUnits,
  JoinedAuctionStatus,
  ListedProductsStatus,
  PaymentStatus,
  PaymentType,
  Prisma,
  Product,
  User,
  WalletStatus,
  WalletTransactionType,
  WithdrawalStatus,
} from '@prisma/client';
import { MethodNotAllowedResponse, NotFoundResponse } from 'src/common/errors';
import { Role } from 'src/auth/enums/role.enum';
import { AuctionsHelper } from '../helpers/auctions-helper';
import Decimal from 'decimal.js';
import { BidsWebSocketGateway } from '../gateway/bids.gateway';
import { PaymentsService } from 'src/payments/services/payments.service';
import { AuctionStatusValidator } from '../validations/auction-validator';
import { AuctionActions } from 'src/common/enums/auction-actions.enum';
import { WalletService } from 'src/wallet/wallet.service';
import { StripeService } from 'src/common/services/stripe.service';
import { AuctionComplaintsDTO } from '../dtos/auctionComplaints.dto';
import { EmailSerivce } from 'src/emails/email.service';
import { EmailsType } from 'src/auth/enums/emails-type.enum';
import { addNewBankAccountDto } from '../dtos/addNewBankAccount.dto';
// import { auctionCreationMessage } from 'src/notificatons/NotificationsContents/auctionCreationMessage';
import { NotificationsService } from 'src/notificatons/notifications.service';
import { AuctionWebSocketGateway } from '../gateway/auction.gateway';
import { generateInvoicePDF } from 'src/emails/invoice';
import { GetListedProductDTO } from '../dtos/getListedProducts.dto';
import { WhatsAppService } from 'src/whatsapp/whatsapp.service';

@Injectable()
export class UserAuctionsService {
  private readonly logger = new Logger(UserAuctionsService.name);
  constructor(
    private stripeService: StripeService,
    private prismaService: PrismaService,
    private walletService: WalletService,
    private paginationService: PaginationService,
    private firebaseService: FirebaseService,
    private auctionsHelper: AuctionsHelper,
    private bidsWebSocketGateway: BidsWebSocketGateway,
    private paymentService: PaymentsService,
    private auctionStatusValidator: AuctionStatusValidator,
    private emailService: EmailSerivce,
    private notificationService: NotificationsService,
    private auctionWebsocketGateway: AuctionWebSocketGateway,
    private readonly whatsappService: WhatsAppService,
  ) {}

  // TODO: Add price field in product table and when user select isallowedPayment set price =acceptedAmount
  async createPendingAuction(
    userId: number,
    auctionCreationBody: AuctionCreationDTO,
    files?: Express.Multer.File[],
    isConvertProductToAuction?: boolean,
    product_Id?: number,
  ) {
    const { type, durationUnit, product } = auctionCreationBody;
    const images = files.filter((file) => file.mimetype.startsWith('image/'));
    const video = files.filter((file) => file.mimetype.startsWith('video/'));

    // Determine if this is a LISTED_PRODUCT or a regular AUCTION
    const isListedProductSignal =
      (type as any) === 'LISTED_PRODUCT' ||
      product?.isListedProduct === true ||
      (product?.ProductListingPrice && Number(product.ProductListingPrice) > 0);

    let productId: number;
    const user = await this.auctionsHelper._userHasCompleteProfile(userId);
    if (!isConvertProductToAuction) {
      const combinedfile = [...images, ...video];
      if (combinedfile.length < 3)
        throw new MethodNotAllowedResponse({
          ar: 'من فضلك قم برفع من ثلاث الي خمس صور',
          en: 'Please Upload From 3 To 5 Photos',
        });

      const createProductStatus = isListedProductSignal ? 'LISTING' : 'AUCTION';

      productId = await this._createProduct(
        product,
        files,
        createProductStatus,
        userId,
      );

      if (isListedProductSignal) {
        // Additional logic for listed products if needed
      }
    } else {
      productId = product_Id;
      await this.prismaService.product.update({
        where: { id: productId },
        data: { isAuctionProduct: true },
      });
    }

    let auction: any;
    if (isListedProductSignal) {
      try {
        auction = await this.prismaService.auction.create({
          data: {
            userId,
            productId,
            status: AuctionStatus.DRAFTED,
            locationId: auctionCreationBody.locationId,
          },
          include: {
            product: { include: { category: true, images: true } },
          },
        });

        // Send notification for draft
        try {
          const notificationMessage = `Your product "${auction.product.title}" has been saved as a draft.`;
          const notificationData = {
            usersId: userId,
            message: notificationMessage,
            imageLink: auction.product.images[0]?.imageLink,
            productTitle: auction.product.title,
            productId: auction.productId,
          };

          await this.prismaService.notification.create({
            data: {
              userId: notificationData.usersId,
              message: notificationData.message,
              imageLink: notificationData.imageLink,
              productTitle: notificationData.productTitle,
              productId: notificationData.productId,
            },
          });

          this.notificationService.sendNotificationToSpecificUsers(
            notificationData,
          );
        } catch (error) {
          console.error('Error sending listing draft notification:', error);
        }
      } catch (error) {
        console.log('Error creating listing draft container:', error);
        throw new MethodNotAllowedResponse({
          ar: 'خطأ في حفظ المسودة',
          en: 'Something went wrong while saving your draft',
        });
      }
    } else {
      switch (durationUnit) {
        case DurationUnits.DAYS:
          if (type === AuctionType.ON_TIME) {
            auction = await this._createOnTimeDailyAuction(
              userId,
              productId,
              auctionCreationBody,
            );
          } else if (type === AuctionType.SCHEDULED) {
            auction = await this._createScheduleDailyAuction(
              userId,
              productId,
              auctionCreationBody,
            );
          }
          break;
        case DurationUnits.HOURS:
          if (type === AuctionType.ON_TIME) {
            auction = await this._createOnTimeHoursAuction(
              userId,
              productId,
              auctionCreationBody,
            );
          } else if (type === AuctionType.SCHEDULED) {
            auction = await this._createScheduleHoursAuction(
              userId,
              productId,
              auctionCreationBody,
            );
          }
          break;
      }
    }

    const specialCategories = [
      { categoryId: 4, maxPrice: 5000 },
      { categoryId: 7, maxPrice: 1000 },
    ];

    const matchedCategory = specialCategories.find(
      (rule) =>
        auction &&
        auction.product &&
        auction.product.categoryId === rule.categoryId &&
        auction.startBidAmount < rule.maxPrice,
    );
    if (matchedCategory) {
      await this.paymentService.publishAuction(auction.id, user.email);
    }
    return auction;
  }

  async updateAuctionDetails(
    userId: number,
    auctionId: number,
    auctionUpdateBody: AuctionUpdateDTO,
    files?: Express.Multer.File[],
  ) {
    const { startDate, durationUnit, product } = auctionUpdateBody;

    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
      include: { product: true },
    });

    if (!auction || auction.userId !== userId) {
      throw new MethodNotAllowedResponse({
        ar: 'المزاد غير موجود أو غير مصرح لك بتحديثه',
        en: 'Auction not found or unauthorized',
      });
    }

    if (product) {
      await this._updateProduct(auction.productId, product);
    }

    return await this.prismaService.auction.update({
      where: { id: auctionId },
      data: {
        ...(startDate ? { startDate: new Date(startDate) } : {}),
        ...(durationUnit ? { durationUnit: durationUnit as any } : {}),
      },
      include: { product: { include: { images: true } } },
    });
  }

  async createDraftAuction(
    userId: number,
    productDTO: ProductDTO,
    images: Express.Multer.File[],
  ) {
    await this.auctionsHelper._userHasCompleteProfile(userId);
    const isListedProductSignal =
      productDTO.isListedProduct === true ||
      (productDTO.ProductListingPrice &&
        Number(productDTO.ProductListingPrice) > 0) ||
      productDTO.isAuction === false;

    const createProductStatus = isListedProductSignal ? 'LISTING' : 'AUCTION';
    const productId = await this._createProduct(
      productDTO,
      images,
      createProductStatus,
      userId,
    );

    const draftAuction = await this.prismaService.auction.create({
      data: {
        userId,
        productId,
        status: AuctionStatus.DRAFTED,
      },
      include: {
        product: {
          include: {
            images: true,
          },
        },
      },
    });

    // Send notification
    try {
      const notificationMessage = `Your product "${draftAuction.product.title}" has been saved as a draft.`;
      const notificationData = {
        usersId: userId,
        message: notificationMessage,
        imageLink: draftAuction.product.images[0]?.imageLink,
        productTitle: draftAuction.product.title,
        productId: draftAuction.productId,
      };

      await this.prismaService.notification.create({
        data: {
          userId: notificationData.usersId,
          message: notificationData.message,
          imageLink: notificationData.imageLink,
          productTitle: notificationData.productTitle,
          productId: notificationData.productId,
        },
      });

      this.notificationService.sendNotificationToSpecificUsers(
        notificationData,
      );
    } catch (error) {
      console.error('Error sending draft creation notification:', error);
    }

    return draftAuction;
  }

  async updateAuctionForCancellationByAdmin(
    auctionId: number,
    adminMessage: string,
  ) {
    try {
      const auction = await this.prismaService.$transaction(async (prisma) => {
        const auction = await prisma.auction.update({
          where: { id: auctionId },
          data: {
            status: 'CANCELLED_BY_ADMIN',
          },
          include: {
            bids: { orderBy: { amount: 'desc' } },
            product: {
              include: { images: true, category: true },
            },
            user: true,
          },
        });
        await prisma.joinedAuction.updateMany({
          where: { auctionId },
          data: {
            status: JoinedAuctionStatus.CANCELLED_BY_ADMIN,
          },
        });
        return auction;
      });
      //Finding the seller security Deposit amount
      const sellerSecurityDeposit = await this.prismaService.payment.findFirst({
        where: {
          auctionId,
          type: PaymentType.SELLER_DEPOSIT,
        },
      });

      // //capture SD of seller
      // let isSellerPaymentCaptured: any;
      // if (sellerSecurityDeposit?.isWalletPayment) {
      //   isSellerPaymentCaptured =
      //     sellerSecurityDeposit.status === 'SUCCESS' ? true : false;
      // } else if(sellerSecurityDeposit?.paymentIntentId){
      //   isSellerPaymentCaptured =
      //     await this.stripeService.captureDepositPaymentIntent(
      //       sellerSecurityDeposit.paymentIntentId,
      //     );
      //   //find the last transaction balane of the alletre
      //   const lastBalanceOfAlletre =
      //     await this.walletService.findLastTransactionOfAlletre();
      //   //tranfering data for the alletre fees
      //   const alletreWalletData = {
      //     status: WalletStatus.DEPOSIT,
      //     transactionType: WalletTransactionType.By_AUCTION,
      //     description: `Security deposit credited to Alletre wallet due to auction cancellation by admin.`,
      //     amount: Number(isSellerPaymentCaptured.amount) / 100, // Convert from cents to dollars
      //     auctionId: Number(auctionId),
      //     balance: lastBalanceOfAlletre
      //       ? Number(lastBalanceOfAlletre) +
      //         Number(isSellerPaymentCaptured.amount) / 100
      //       : Number(isSellerPaymentCaptured.amount) / 100, // Convert from cents to dollars
      //   };
      //   await this.walletService.addToAlletreWallet(
      //     sellerSecurityDeposit.userId,
      //     alletreWalletData,
      //   );
      // }else {
      //   //this is sinario is reached while the user cancell the auction with no or zero security deposit
      //   //example : if the user cancell the auction which is CAR category, and the start bid amount is less than 5000, the we don't take the security deposit
      //   // so in this situation the security deposite will be zero of the seller, so when we give the compensation to the winner, it will be deducted from the alletre account
      //   isSellerPaymentCaptured = true ;
      // }
      const isSellerPaymentCaptured = true;
      const auctionEndDate = new Date(auction.expiryDate);
      const formattedEndDate = auctionEndDate.toISOString().split('T')[0]; // Extract YYYY-MM-DD
      const formattedEndTime = auctionEndDate.toTimeString().slice(0, 5);
      if (isSellerPaymentCaptured) {
        const emailBodyToSeller = {
          subject: '⚠️ Auction Cancelled – Security Deposit Forfeited',
          title: `Your Auction Has Been Cancelled By Admin`,
          Product_Name: auction.product.title,
          img: auction.product.images[0].imageLink,
          userName: `${auction.user.userName}`,
          message1: ` 
          <p>The admin has been cancelled your auction for ${
            auction.product.title
          }. ${
            sellerSecurityDeposit
              ? ''
              : `The security deposit of ${auction.product.category.sellerDepositFixedAmount} has been forfeited as per our company policy.`
          }</p>
          <p>Reason: ${adminMessage}</p>
                  <p>Auction Details:</p>
          <ul>
            <li>Title: ${auction.product.title} </li>
            <li>Category: ${auction.product.category.nameEn}</li>
            <li>Auction End Date: ${formattedEndDate} & ${formattedEndTime}</li>
          </ul>
          <p>We understand circumstances can change, but cancelling an auction with bidders can affect their experience and trust in the platform.</p>
          `,
          message2: `<p>We value your participation in our community and are here to support you. If you have any questions about this policy or need assistance, please don’t hesitate to contact our support team.</p>
                      <p style="margin-bottom: 0;">Best regards,</p>
                      <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                      <p>P.S. Avoid future deposit forfeitures by reviewing our auction policies before cancelling active auctions.</p>`,
          Button_text: 'View My Account  ',
          Button_URL: ' https://www.alletre.com/',
        };
        //calling send email function
        await this.emailService.sendEmail(
          auction.user.email,
          'token',
          EmailsType.OTHER,
          emailBodyToSeller,
        );

        const whatsappBodyToSellerAuctionCancelled = {
          1: `${auction.user.userName}`,
          2: `⚠️ Your auction for *${
            auction.product.title
          }* has been cancelled by the admin. ${
            sellerSecurityDeposit
              ? ''
              : `The security deposit of ${auction.product.category.sellerDepositFixedAmount} has been forfeited as per our company policy.`
          }`,
          3: `*Reason:* ${adminMessage}`,
          4: `*Title:* ${auction.product.title}`,
          5: `*Auction End Date:* ${formattedEndDate} & ${formattedEndTime}`,
          6: `Cancelling auctions with active bidders may affect user experience and platform trust. Please review policies before cancelling.`,
          7: `Need help or clarification Contact our support team anytime.`,
          8: auction.product.images[0].imageLink,
          9: `https://www.alletre.com/`,
        };

        if (auction.user.phone) {
          await this.whatsappService.sendOtherUtilityMessages(
            whatsappBodyToSellerAuctionCancelled,
            auction.user.phone,
            'alletre_common_utility_templet',
          );
        }

        //create notification to seller
        const auctionCancelNotificationDataToSeller =
          await this.prismaService.notification.create({
            data: {
              userId: auction.user.id,
              message: `Your auction for "${auction.product.title}" (Model: ${
                auction.product.model
              }) has been  canceled by admin due to ${adminMessage}. ${
                sellerSecurityDeposit
                  ? ''
                  : `The security deposit of ${auction.product.category.sellerDepositFixedAmount} has been forfeited as per our company policy.`
              }`,
              imageLink: auction.product.images[0].imageLink,
              productTitle: auction.product.title,
              auctionId: auction.id,
            },
          });
        if (auctionCancelNotificationDataToSeller) {
          // Send notification to seller
          console.log('auction____', auctionCancelNotificationDataToSeller);
          const sellerUserId = auctionCancelNotificationDataToSeller.userId;
          const notification = {
            status: 'ON_AUCTION_CANCELLED_BY_ADMIN',
            userType: 'FOR_SELLER',
            usersId: sellerUserId,
            message: auctionCancelNotificationDataToSeller.message,
            imageLink: auctionCancelNotificationDataToSeller.imageLink,
            productTitle: auctionCancelNotificationDataToSeller.productTitle,
            auctionId: auctionCancelNotificationDataToSeller.auctionId,
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
      //sendig back the security deposite of the bidders due to admin cancelled the auction
      if (auction.bids.length) {
        const BiddersPaymentData = await this.prismaService.payment.findMany({
          where: { auctionId, type: 'BIDDER_DEPOSIT' },
          include: {
            user: true,
          },
        });
        // BiddersPaymentData?.map(async (data) =>
        for (const data of BiddersPaymentData) {
          //send email to bidders
          const emailBodyToBidders = {
            subject:
              '⚠️ Auction Cancelled By Admin – Security Deposit Refunded',
            title:
              'The Auction You Participated In Has Been Cancelled By Admin',
            Product_Name: auction.product.title,
            img: auction.product.images[0].imageLink,
            userName: `${data.user.userName}`,
            message1: ` 
            <p>We regret to inform you that the auction for the product titled ${
              auction.product.title
            } has been cancelled by the admin. </p>
            <p>Reason: ${adminMessage}</p>
                    <p>Cancelled Auction Details:</p>
            <ul>
              <li>Title: ${auction.product.title} </li>
              <li>Category: ${auction.product.category.nameEn}</li>
              <li>Your Bid Amount: ${
                auction.bids.find((bid) => bid.userId === data.user.id)?.amount
              }</li>
              <li> Auction End Date: ${formattedEndDate} & ${formattedEndTime}</li>
            </ul>
            <p>Your security deposit has been successfully sent back to your ${
              data.isWalletPayment ? 'wallet.' : 'bank account.'
            } </p>`,
            message2: `<p>We deeply value your participation and apologize for any inconvenience this cancellation may have caused. If you have any further questions or concerns, please feel free to contact our support team.</p>
                      <p style="margin-bottom: 0;">Best regards,</p>
                      <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                        <p>P.S. Bid with other similar , auctions are waiting for you</p>`,
            Button_text: 'View My Account  ',
            Button_URL: ' https://www.alletre.com/',
          };
          //send notification to bidders
          const notificationForBidders = {
            status: 'ON_AUCTION_CANCELLED_BY_ADMIN',
            userType: 'FOR_BIDDERS',
            usersId: data.userId,
            message: `We regret to inform you that your auction for "${
              auction.product.title
            }" (Model: ${
              auction.product.model
            }) has been canceled by the admin. Your security deposit has been returned to your ${
              data.isWalletPayment ? 'wallet' : 'bank account'
            }.
            ${`Reason: ${adminMessage}`}`,
            imageLink: auction.product.images[0].imageLink,
            productTitle: auction.product.title,
            auctionId: auction.id,
          };
          let cancelDepositResult: any = false;
          if (data.isWalletPayment) {
            //here need to create the functionality for sending back the security deposit of the lost bidders to the wallet
            //finding the last transaction balance of the lost bidder
            const lastWalletTransactionBalanceOfLostBidder =
              await this.walletService.findLastTransaction(data.userId);
            //finding the last transaction balance of the alletreWallet
            const lastBalanceOfAlletre =
              await this.walletService.findLastTransactionOfAlletre();
            //tranfering data for the copensation to the lost bidder wallet.
            const lostBidderWalletData = {
              status: WalletStatus.DEPOSIT,
              transactionType: WalletTransactionType.By_AUCTION,
              description: `Return Security deposit due to auction cancellation by admin.`,
              amount: Number(data.amount),
              auctionId: Number(auctionId),
              balance: lastWalletTransactionBalanceOfLostBidder
                ? Number(lastWalletTransactionBalanceOfLostBidder) +
                  Number(data.amount)
                : Number(data.amount),
            };

            //tranfering data for the alletre fees
            const alletreWalletData = {
              status: WalletStatus.WITHDRAWAL,
              transactionType: WalletTransactionType.By_AUCTION,
              description: `Return Security deposit due to auction cancellation by admin.`,
              amount: Number(data.amount),
              auctionId: Number(auctionId),
              balance: Number(lastBalanceOfAlletre) - Number(data.amount),
            };
            //transfer to the seller wallet
            const lostBidderWalletTranser = await this.walletService.create(
              data.userId,
              lostBidderWalletData,
            );
            //transfer to the  alletre wallet
            const alleTreWalletTranser =
              await this.walletService.addToAlletreWallet(
                data.userId,
                alletreWalletData,
              );

            if (lostBidderWalletTranser && alleTreWalletTranser)
              cancelDepositResult = true;
            else cancelDepositResult = false;
          } else {
            cancelDepositResult =
              await this.stripeService.cancelDepositPaymentIntent(
                data?.paymentIntentId,
              );
          }
          if (cancelDepositResult) {
            const whatsappBodyToBiddersAuctionCancelled = {
              1: `${data.user.userName}`,
              2: `⚠️ The auction for *${auction.product.title}* you participated in has been cancelled by the admin.`,
              3: `*Reason:* ${adminMessage}`,
              4: `*Title:* ${auction.product.title}`,
              5: `*Your Bid:* ${
                auction.bids.find((bid) => bid.userId === data.user.id)?.amount
              }`,
              6: `*Auction End Date:* ${formattedEndDate} & ${formattedEndTime}`,
              7: `Your security deposit has been refunded to your ${
                data.isWalletPayment ? 'wallet' : 'bank account'
              }.`,
              8: auction.product.images[0].imageLink,
              9: `https://www.alletre.com/`,
            };

            if (data.user.phone) {
              await this.whatsappService.sendOtherUtilityMessages(
                whatsappBodyToBiddersAuctionCancelled,
                data.user.phone,
                'alletre_common_utility_templet',
              );
            }

            await this.emailService.sendEmail(
              data.user.email,
              'token',
              EmailsType.OTHER,
              emailBodyToBidders,
            );

            try {
              const isCreateNotificationToBidders =
                await this.prismaService.notification.create({
                  data: {
                    userId: data.userId,
                    message: notificationForBidders.message,
                    imageLink: notificationForBidders.imageLink,
                    productTitle: notificationForBidders.productTitle,
                    auctionId: notificationForBidders.auctionId,
                  },
                });
              if (isCreateNotificationToBidders) {
                this.notificationService.sendNotificationToSpecificUsers(
                  notificationForBidders,
                );
              }
            } catch (error) {
              console.log('sendNotificationToSpecificUsers error', error);
            }
          }
        }
        // );
      }
      //emiting cancel auction to remove the auction from users screen
      this.auctionWebsocketGateway.cancelAuction(auctionId);
      return {
        success: true,
        message: 'You have successfully cancelled the auction.',
        auctionId,
      };
    } catch (error) {
      console.log('cancel auction by admin error:', error);
      throw new MethodNotAllowedResponse({
        ar: 'عذرا! لا يمكنك إلغاء هذا المزاد',
        en: 'Sorry! You cannot cancel this auction',
      });
    }
  }
  async updateAuctionForCancellation(auctionId: number, userId: number) {
    try {
      const auction = await this.prismaService.auction.findUnique({
        where: { id: auctionId },
        include: {
          bids: { orderBy: { amount: 'desc' } },
          product: {
            include: { images: true, category: true },
          },
          user: true,
          Payment: { where: { type: 'SELLER_DEPOSIT' } },
        },
      });

      const sellerPayment = auction.Payment;
      if (sellerPayment.length === 0) {
        // this is the case while the user is not pay the security deposit, there are cases when uses can put auction with out security deposite in special categories (ex: car under 5000),
        const adminMessage =
          "The auction has been cancelled because the seller did not comply with Alletre's guidelines";
        return this.updateAuctionForCancellationByAdmin(
          auction.id,
          adminMessage,
        );
      }

      const BiddersData = await this.prismaService.bids.findMany({
        where: {
          auctionId,
        },
        orderBy: { amount: 'desc' },
      });
      if (BiddersData.length) {
        console.log('BiddersData :', BiddersData);
        console.log('Auction cancellation with bidders ');

        //Finding the seller security Deposit amount
        const sellerSecurityDeposit =
          await this.prismaService.payment.findFirst({
            where: {
              auctionId,
              type: PaymentType.SELLER_DEPOSIT,
            },
          });

        // let isSellerPaymentCaptured: any;
        // if (sellerSecurityDeposit?.isWalletPayment) {
        //   isSellerPaymentCaptured =
        //     sellerSecurityDeposit.status === 'SUCCESS' ? true : false;
        // } else if(sellerSecurityDeposit?.paymentIntentId) {
        //   isSellerPaymentCaptured =
        //     await this.stripeService.captureDepositPaymentIntent(
        //       sellerSecurityDeposit.paymentIntentId,
        //     );
        //   //find the last transaction balane of the alletre
        //   const lastBalanceOfAlletre =
        //     await this.walletService.findLastTransactionOfAlletre();
        //   //tranfering data for the alletre fees
        //   const alletreWalletData = {
        //     status: WalletStatus.DEPOSIT,
        //     transactionType: WalletTransactionType.By_AUCTION,
        //     description: `Auction cancelled by seller ${
        //       auction.status === 'ACTIVE' ? 'before' : 'after'
        //     } the expiry date.`,

        //     amount: Number(isSellerPaymentCaptured.amount) / 100, // Convert from cents to dollars
        //     auctionId: Number(auctionId),
        //     balance: lastBalanceOfAlletre
        //       ? Number(lastBalanceOfAlletre) +
        //         Number(isSellerPaymentCaptured.amount) / 100
        //       : Number(isSellerPaymentCaptured.amount) / 100, // Convert from cents to dollars
        //   };
        //   await this.walletService.addToAlletreWallet(
        //     userId,
        //     alletreWalletData,
        //   );
        // }else {
        //   //this is sinario is reached while the user cancell the auction with no or zero security deposit
        //   //example : if the user cancell the auction which is CAR category, and the start bid amount is less than 5000, the we don't take the security deposit
        //   // so in this situation the security deposite will be zero of the seller, so when we give the compensation to the winner, it will be deducted from the alletre account
        //   isSellerPaymentCaptured =true;
        // }
        const isSellerPaymentCaptured = true;
        const auctionEndDate = new Date(auction.expiryDate);
        const formattedEndDate = auctionEndDate.toISOString().split('T')[0]; // Extract YYYY-MM-DD
        const formattedEndTime = auctionEndDate.toTimeString().slice(0, 5);
        //find highest Bidder
        if (isSellerPaymentCaptured) {
          //send mail to seller
          const body = {
            subject: '⚠️ Auction Cancelled – Security Deposit Forfeited',
            title: `Your Auction Has Been Cancelled`,
            Product_Name: auction.product.title,
            img: auction.product.images[0].imageLink,
            userName: `${auction.user.userName}`,
            message1: ` 
            <p>You have successfully cancelled your auction for ${
              auction.product.title
            }.  ${
              sellerSecurityDeposit
                ? ''
                : `However, since there were active bidders on this auction, the security deposit of ${auction.product.category.sellerDepositFixedAmount} has been forfeited as per our cancellation policy`
            }.</p>
                    <p>Auction Details:</p>
            <ul>
              <li>Title: ${auction.product.title} </li>
              <li>Category: ${auction.product.category.nameEn}</li>
              <li>Highest Bid: ${auction.bids[0].amount}</li>
              <li>Auction End Date: ${formattedEndDate} & ${formattedEndTime}</li>
            </ul>
            <p>We understand circumstances can change, but cancelling an auction with bidders can affect their experience and trust in the platform.</p>
            `,
            message2: `<p>We value your participation in our community and are here to support you. If you have any questions about this policy or need assistance, please don’t hesitate to contact our support team.</p>
                        <p style="margin-bottom: 0;">Best regards,</p>
                        <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                        <p>P.S. Avoid future deposit forfeitures by reviewing our auction policies before cancelling active auctions.</p>`,
            Button_text: 'View My Account  ',
            Button_URL: ' https://www.alletre.com/',
          };
          //calling send email function
          await this.emailService.sendEmail(
            auction.user.email,
            'token',
            EmailsType.OTHER,
            body,
          );

          const whatsappBodyToSellerSelfCancelled = {
            1: `${auction.user.userName}`,
            2: `⚠️ You cancelled your auction for *${auction.product.title}*.`,
            3: `${
              sellerSecurityDeposit
                ? `*Title:* ${auction.product.title}`
                : `Your security deposit of ${auction.product.category.sellerDepositFixedAmount} was forfeited as per our policy.`
            }`,
            4: `*Category:* ${auction.product.category.nameEn}`,
            5: `*Highest Bid:* ${auction.bids[0].amount}`,
            6: `*Ends:* ${formattedEndDate} & ${formattedEndTime}`,
            7: `Cancelling with bidders can affect trust in the platform.`,
            8: auction.product.images[0].imageLink,
            9: `https://www.alletre.com/`,
          };

          if (auction.user.phone) {
            await this.whatsappService.sendOtherUtilityMessages(
              whatsappBodyToSellerSelfCancelled,
              auction.user.phone,
              'alletre_common_utility_templet',
            );
          }

          //create notification to seller
          const auctionCancelNotificationData =
            await this.prismaService.notification.create({
              data: {
                userId: auction.user.id,
                message: `You have successfully cancelled your auction for ${
                  auction.product.title
                }.  ${
                  sellerSecurityDeposit
                    ? ''
                    : `However, since there were active bidders on this auction, the security deposit of ${auction.product.category.sellerDepositFixedAmount} has been forfeited as per our cancellation policy`
                }.`,
                imageLink: auction.product.images[0].imageLink,
                productTitle: auction.product.title,
                auctionId: auction.id,
              },
            });
          if (auctionCancelNotificationData) {
            // Send notification to seller
            console.log('auction____', auctionCancelNotificationData);
            const sellerUserId = auctionCancelNotificationData.userId;
            const notification = {
              status: 'ON_AUCTION_CANCELLED_WITH_BIDDER',
              userType: 'FOR_SELLER',
              usersId: sellerUserId,
              message: auctionCancelNotificationData.message,
              imageLink: auctionCancelNotificationData.imageLink,
              productTitle: auctionCancelNotificationData.productTitle,
              auctionId: auctionCancelNotificationData.auctionId,
            };
            try {
              this.notificationService.sendNotificationToSpecificUsers(
                notification,
              );
            } catch (error) {
              console.log('sendNotificationToSpecificUsers error', error);
            }
          }
          //here we need to send messages to all bidders that this auction is cancelled by the seller.
          const BiddersPaymentData = await this.prismaService.payment.findMany({
            where: { auctionId, type: 'BIDDER_DEPOSIT' },
            include: {
              user: true,
            },
          });

          const highestBidderId = BiddersData[0].userId;
          //find security Deposit of highest bidder // becuase when the acution complete, the S_D of winned bidder will be captured
          let highestBidderSecurityDeposit = 0;

          // BiddersPaymentData?.map(async (data) =>
          for (const data of BiddersPaymentData) {
            if (data.userId === highestBidderId) {
              highestBidderSecurityDeposit = Number(data.amount);
            }
            //send email to bidders
            const body = {
              subject: '⚠️ Auction Cancelled – Security Deposit Refunded',
              title: 'The Auction You Participated In Has Been Cancelled',
              Product_Name: auction.product.title,
              img: auction.product.images[0].imageLink,
              userName: `${data.user.userName}`,
              message1: ` 
              <p>We regret to inform you that the auction for the product titled ${
                auction.product.title
              } has been cancelled by the owner of the product. </p>
                      <p>Cancelled Auction Details:</p>
              <ul>
                <li>Title: ${auction.product.title} </li>
                <li>Category: ${auction.product.category.nameEn}</li>
                <li>Your Bid Amount: ${
                  auction.bids.find((bid) => bid.userId === data.user.id)
                    ?.amount
                }</li>
                <li> Auction End Date: ${formattedEndDate} & ${formattedEndTime}</li>
              </ul>
              <p>Your security deposit has been successfully sent back to your ${
                data.isWalletPayment ? 'wallet.' : 'bank account.'
              } </p>
              <p>${
                data?.user.id === highestBidderId
                  ? 'Additionally, since you were the highest bidder, a compensation amount has been credited to your wallet as a gesture of goodwill.'
                  : ''
              } </p>`,
              message2: `<p>We deeply value your participation and apologize for any inconvenience this cancellation may have caused. If you have any further questions or concerns, please feel free to contact our support team.</p>
                        <p style="margin-bottom: 0;">Best regards,</p>
                        <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                          <p>P.S. Bid with other similar , auctions are waiting for you</p>`,
              Button_text: 'View My Account  ',
              Button_URL: ' https://www.alletre.com/',
            };
            //send notification to bidders
            const notificationForBidders = {
              status: 'ON_AUCTION_CANCELLED_WITH_BIDDER',
              userType:
                data.userId === highestBidderId ? 'FOR_WINNER' : 'FOR_LOSERS',
              usersId: data.userId,
              message: `We regret to inform you that your auction for "${
                auction.product.title
              }" (Model: ${
                auction.product.model
              }) has been canceled by the product owner. Your security deposit has been returned to your ${
                data.isWalletPayment ? 'wallet' : 'bank account'
              }. ${
                data?.user.id === highestBidderId
                  ? 'As the highest bidder, you will also receive compensation in your wallet.'
                  : ''
              }`,
              imageLink: auction.product.images[0].imageLink,
              productTitle: auction.product.title,
              auctionId: auction.id,
            };
            if (auction.status === 'ACTIVE') {
              console.log('Auction cancellation with bidders BEFORE expiry');

              let cancelDepositResult: any = false;
              if (data.isWalletPayment) {
                //here need to create the functionality for sending back the security deposit of the lost bidders to the wallet
                //finding the last transaction balance of the lost bidder
                const lastWalletTransactionBalanceOfLostBidder =
                  await this.walletService.findLastTransaction(data.userId);
                //finding the last transaction balance of the alletreWallet
                const lastBalanceOfAlletre =
                  await this.walletService.findLastTransactionOfAlletre();
                //tranfering data for the copensation to the lost bidder wallet.
                const lostBidderWalletData = {
                  status: WalletStatus.DEPOSIT,
                  transactionType: WalletTransactionType.By_AUCTION,
                  description: `Auction cancelled by seller ${
                    auction.status === 'ACTIVE' ? 'before' : 'after'
                  } the expiry date.`,
                  amount: Number(data.amount),
                  auctionId: Number(auctionId),
                  balance: lastWalletTransactionBalanceOfLostBidder
                    ? Number(lastWalletTransactionBalanceOfLostBidder) +
                      Number(data.amount)
                    : Number(data.amount),
                };

                //tranfering data for the alletre fees
                const alletreWalletData = {
                  status: WalletStatus.WITHDRAWAL,
                  transactionType: WalletTransactionType.By_AUCTION,
                  description: `Auction cancelled by seller ${
                    auction.status === 'ACTIVE' ? 'before' : 'after'
                  } the expiry date.`,
                  amount: Number(data.amount),
                  auctionId: Number(auctionId),
                  balance: Number(lastBalanceOfAlletre) - Number(data.amount),
                };
                //transfer to the seller wallet
                const lostBidderWalletTranser = await this.walletService.create(
                  data.userId,
                  lostBidderWalletData,
                );
                //transfer to the  alletre wallet
                const alleTreWalletTranser =
                  await this.walletService.addToAlletreWallet(
                    data.userId,
                    alletreWalletData,
                  );

                if (lostBidderWalletTranser && alleTreWalletTranser)
                  cancelDepositResult = true;
                else cancelDepositResult = false;
              } else {
                cancelDepositResult =
                  await this.stripeService.cancelDepositPaymentIntent(
                    data?.paymentIntentId,
                  );
              }
              if (cancelDepositResult) {
                const whatsappBodyToBiddersCancelledBySeller = {
                  1: `${data.user.userName}`,
                  2: `⚠️ The auction for *${auction.product.title}* has been cancelled by the seller.`,
                  3: `*Category:* ${auction.product.category.nameEn}`,
                  4: `*Your Bid:* ${
                    auction.bids.find((bid) => bid.userId === data.user.id)
                      ?.amount
                  }`,
                  5: `*Ends:* ${formattedEndDate} & ${formattedEndTime}`,
                  6: `Your deposit has been refunded to your ${
                    data.isWalletPayment ? 'wallet' : 'bank account'
                  }.`,
                  7: `${
                    data?.user.id === highestBidderId
                      ? '💰 Compensation added to your wallet for being the highest bidder.'
                      : 'You can explore other exciting auctions now.'
                  }`,
                  8: auction.product.images[0].imageLink,
                  9: `https://www.alletre.com/`,
                };

                if (data.user.phone) {
                  await this.whatsappService.sendOtherUtilityMessages(
                    whatsappBodyToBiddersCancelledBySeller,
                    data.user.phone,
                    'alletre_common_utility_templet',
                  );
                }

                await this.emailService.sendEmail(
                  data.user.email,
                  'token',
                  EmailsType.OTHER,
                  body,
                );
                try {
                  const isCreateNotificationToBidders =
                    await this.prismaService.notification.create({
                      data: {
                        userId: data.userId,
                        message: notificationForBidders.message,
                        imageLink: notificationForBidders.imageLink,
                        productTitle: notificationForBidders.productTitle,
                        auctionId: notificationForBidders.auctionId,
                      },
                    });
                  if (isCreateNotificationToBidders) {
                    this.notificationService.sendNotificationToSpecificUsers(
                      notificationForBidders,
                    );
                  }
                } catch (error) {
                  console.log('sendNotificationToSpecificUsers error', error);
                }
              }
            } else if (
              auction.status === 'WAITING_FOR_PAYMENT' &&
              data.userId === highestBidderId
            ) {
              console.log('Auction cancellation with bidders AFTER expiry');
              const whatsappBody = {
                1: `${data.user.userName}`,
                2: `⚠️ Auction for *${auction.product.title}* was cancelled by the seller.`,
                3: `*Category:* ${auction.product.category.nameEn}`,
                4: `*Your Bid:* ${
                  auction.bids.find((bid) => bid.userId === data.user.id)
                    ?.amount
                }`,
                5: `*Ends:* ${formattedEndDate} & ${formattedEndTime}`,
                6: `Deposit refunded to your ${
                  data.isWalletPayment ? 'wallet' : 'bank account'
                }.`,
                7: `${
                  data?.user.id === highestBidderId
                    ? '💰 As highest bidder, a compensation was added to your wallet.'
                    : 'More auctions are live – don’t miss out!'
                }`,
                8: auction.product.images[0].imageLink,
                9: `https://www.alletre.com/`,
              };

              if (data.user.phone) {
                await this.whatsappService.sendOtherUtilityMessages(
                  whatsappBody,
                  data.user.phone,
                  'alletre_common_utility_templet',
                );
              }

              await this.emailService.sendEmail(
                data.user.email,
                'token',
                EmailsType.OTHER,
                body,
              );
              //send notification to bidders
              try {
                const isCreateNotificationToBidders =
                  await this.prismaService.notification.create({
                    data: {
                      userId: data.userId,
                      message: notificationForBidders.message,
                      imageLink: notificationForBidders.imageLink,
                      productTitle: notificationForBidders.productTitle,
                      auctionId: notificationForBidders.auctionId,
                    },
                  });
                if (isCreateNotificationToBidders) {
                  this.notificationService.sendNotificationToSpecificUsers(
                    notificationForBidders,
                  );
                }
              } catch (error) {
                console.log('sendNotificationToSpecificUsers error', error);
              }
            }
          }
          // );

          //finding the last transaction balance of the highest bidder
          const lastWalletTransactionBalance =
            await this.walletService.findLastTransaction(highestBidderId);
          //finding the last transaction balance of the alletreWallet
          const lastBalanceOfAlletre =
            await this.walletService.findLastTransactionOfAlletre();

          //calculating the amount that need add to the highest bidder
          const compensationPersenatage = auction.status === 'ACTIVE' ? 15 : 20;
          const amountToWinnedBidderWallet =
            (Number(sellerSecurityDeposit.amount) * compensationPersenatage) /
            100;
          const companyProfit_whenCancellAuction =
            Number(sellerSecurityDeposit.amount) - amountToWinnedBidderWallet;

          const originalAmountToWinnedBidderWallet =
            auction.status === 'WAITING_FOR_PAYMENT'
              ? amountToWinnedBidderWallet + highestBidderSecurityDeposit
              : amountToWinnedBidderWallet;

          // //calculating the amount that need add to the alletreWallet
          // const amountToAlletteWallet = Number(sellerSecurityDeposit.amount) - originalAmountToWinnedBidderWallet

          //tranfering data for the copensation to the highest bidder wallet.
          const highestBidderWalletData = {
            status: WalletStatus.DEPOSIT,
            transactionType: WalletTransactionType.By_AUCTION,
            description: `${
              auction.status === 'WAITING_FOR_PAYMENT'
                ? 'Return security deposit including Compensation'
                : ' Compensation Due To Auction cancelled by seller'
            } ${
              auction.status === 'ACTIVE' ? 'before' : 'after'
            } the expiry date.`,
            amount: originalAmountToWinnedBidderWallet,
            auctionId: Number(auctionId),
            balance: lastWalletTransactionBalance
              ? Number(lastWalletTransactionBalance) +
                originalAmountToWinnedBidderWallet
              : originalAmountToWinnedBidderWallet,
          };

          //tranfering data for the alletre fees
          const alletreWalletData = {
            status: WalletStatus.WITHDRAWAL,
            transactionType: WalletTransactionType.By_AUCTION,
            description: `Compensation Due To Auction cancelled by seller ${
              auction.status === 'ACTIVE' ? 'before' : 'after'
            } the expiry date.`,
            amount: originalAmountToWinnedBidderWallet,
            auctionId: Number(auctionId),
            balance:
              Number(lastBalanceOfAlletre) - originalAmountToWinnedBidderWallet,
          };
          await this.prismaService.$transaction(async (prisma) => {
            try {
              //transfer to the  highest bidder wallet
              await this.walletService.create(
                highestBidderId,
                highestBidderWalletData,
                prisma,
              );

              //transfer to the  alletre wallet

              await this.walletService.addToAlletreWallet(
                highestBidderId,
                alletreWalletData,
                prisma,
              );

              await prisma.profit.create({
                data: {
                  amount: companyProfit_whenCancellAuction,
                  description: `Compensation Due To Auction cancelled by seller ${
                    auction.status === 'ACTIVE' ? 'before' : 'after'
                  } the expiry date.`,
                  auctionId: auctionId,
                  userId: userId,
                },
              });
              await prisma.auction.update({
                where: {
                  id: auctionId,
                },
                data: {
                  status:
                    auction.status === 'ACTIVE'
                      ? AuctionStatus.CANCELLED_BEFORE_EXP_DATE
                      : AuctionStatus.CANCELLED_AFTER_EXP_DATE,
                },
              });

              if (auction.status === 'ACTIVE') {
                await prisma.joinedAuction.updateMany({
                  where: { auctionId },
                  data: {
                    status: JoinedAuctionStatus.CANCELLED_BEFORE_EXP_DATE,
                  },
                });
              } else if (auction.status === 'WAITING_FOR_PAYMENT') {
                await prisma.joinedAuction.updateMany({
                  where: {
                    auctionId,
                    status: 'PENDING_PAYMENT',
                  },
                  data: {
                    status: JoinedAuctionStatus.CANCELLED_AFTER_EXP_DATE,
                  },
                });
              }
            } catch (error) {
              throw new MethodNotAllowedResponse({
                ar: 'عذرا! لا يمكنك إلغاء هذا المزاد',
                en: 'Sorry! You cannot cancel this auction',
              });
            }
          });
          //emiting cancel auction to remove the auction from users screen
          this.auctionWebsocketGateway.cancelAuction(auctionId);
          return {
            success: true,
            message: 'You have successfully cancelled the auction.',
            auctionId,
          };
        } else {
          throw new MethodNotAllowedResponse({
            ar: 'عذرا! لا يمكنك إلغاء هذا المزاد',
            en: 'Sorry! You cannot cancel this auction',
          });
        }
      } else {
        //cancel auction with zero bidders
        console.log('Cancel auction with zero bidders before expire');
        if (auction.status === 'PENDING_OWNER_DEPOIST') {
          const updatedAuctionData = await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.CANCELLED_BEFORE_EXP_DATE,
              endDate: new Date(),
            },
            include: {
              user: true,
              product: {
                include: { images: true },
              },
              Payment: {
                where: {
                  type: 'SELLER_DEPOSIT',
                },
              },
            },
          });
          if (updatedAuctionData) {
            //emiting cancel auction to remove the auction from users screen
            this.auctionWebsocketGateway.cancelAuction(auctionId);
            return {
              success: true,
              message: 'You have successfully cancelled the auction.',
              auctionId,
            };
          } else {
            throw new MethodNotAllowedResponse({
              ar: 'عذرا! لا يمكنك إلغاء هذا المزاد',
              en: 'Sorry! You cannot cancel this auction',
            });
          }
        }
        const updatedDataOfCancellAuction =
          await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status:
                auction.status === 'ACTIVE'
                  ? AuctionStatus.CANCELLED_BEFORE_EXP_DATE
                  : AuctionStatus.CANCELLED_AFTER_EXP_DATE,
              endDate: new Date(),
            },
            include: {
              user: true,
              product: {
                include: { images: true, category: true },
              },
              Payment: {
                where: {
                  type: 'SELLER_DEPOSIT',
                },
              },
            },
          });
        if (updatedDataOfCancellAuction) {
          const sellerPaymentData = await this.prismaService.payment.findFirst({
            where: {
              auctionId: updatedDataOfCancellAuction.id,
              type: 'SELLER_DEPOSIT',
            },
          });
          //here need to check the depost is from wallet or not
          let isSendBackS_D: any;
          // if (sellerPaymentData.isWalletPayment)
          {
            console.log(
              'security deposit of this cancelled auciton is via WALLET',
            );
            //find last wallet transaction of seller
            const lastWalletTransactionBalanceOfSeller =
              await this.walletService.findLastTransaction(
                sellerPaymentData.userId,
              );
            //finding the last transaction balance of the alletreWallet
            const lastBalanceOfAlletre =
              await this.walletService.findLastTransactionOfAlletre();
            //wallet data  to seller .
            const sellerWalletData = {
              status: WalletStatus.DEPOSIT,
              transactionType: WalletTransactionType.By_AUCTION,
              description: `The auction was cancelled by you ${
                auction.status === 'ACTIVE' ? 'prior to' : 'after'
              } the expiry date. Applicable charges have been processed.`,
              amount: Number(sellerPaymentData.amount),
              auctionId: Number(auctionId),
              balance: lastWalletTransactionBalanceOfSeller
                ? Number(lastWalletTransactionBalanceOfSeller) +
                  Number(sellerPaymentData.amount)
                : Number(sellerPaymentData.amount),
            };

            //tranfering data for the alletre fees
            const alletreWalletData = {
              status: WalletStatus.WITHDRAWAL,
              transactionType: WalletTransactionType.By_AUCTION,
              description: `Auction cancelled by seller ${
                auction.status === 'ACTIVE' ? 'before' : 'after'
              } the expiry date.`,
              amount: Number(sellerPaymentData.amount),
              auctionId: Number(auctionId),
              balance:
                Number(lastBalanceOfAlletre) - Number(sellerPaymentData.amount),
            };
            //transfer to the seller wallet
            const sellerWalletTranser = await this.walletService.create(
              sellerPaymentData.userId,
              sellerWalletData,
            );
            //transfer to the  alletre wallet
            const alleTreWalletTranser =
              await this.walletService.addToAlletreWallet(
                sellerPaymentData.userId,
                alletreWalletData,
              );

            if (sellerWalletTranser && alleTreWalletTranser)
              isSendBackS_D = true;
            else isSendBackS_D = false;
          }
          //  else {
          //   console.log(
          //     'security deposit of this cancelled auciton is via STRIPE',
          //   );
          //   isSendBackS_D = await this.stripeService.cancelDepositPaymentIntent(
          //     sellerPaymentData.paymentIntentId,
          //   );
          // }
          const auctionEndDate = new Date(
            updatedDataOfCancellAuction.expiryDate,
          );
          const formattedEndDate = auctionEndDate.toISOString().split('T')[0];
          if (isSendBackS_D) {
            //Email Data
            const body = {
              subject: '✅ Auction Cancelled – Security Deposit Refunded',
              title: `Your Auction Has Been Cancelled`,
              Product_Name: updatedDataOfCancellAuction.product.title,
              img: updatedDataOfCancellAuction.product.images[0].imageLink,
              userName: `${updatedDataOfCancellAuction.user.userName}`,
              message1: ` 
              <p>Your auction for ${updatedDataOfCancellAuction.product.title}  has been successfully cancelled. Since there were no bidders on this auction, your security deposit of ${updatedDataOfCancellAuction.product.category.sellerDepositFixedAmount} will be fully refunded to your account.</p>
              <p>Auction Details:</p>
              <ul>
                <li>Title: ${updatedDataOfCancellAuction.product.title} </li>
                <li>Category: ${updatedDataOfCancellAuction.product.category.nameEn}</li>
                <li>Starting Bid: ${updatedDataOfCancellAuction.acceptedAmount}</li>
                <li>Auction End Date:${formattedEndDate}</li>
              </ul>
              <p>We’re sorry to see this auction cancelled but understand that plans can change.</p>
              <p><b>Ready to Try Again?</b></p>
              <p>We’d love to help you relist your item and attract the right bidders!</p>
                          <ul>
                <li>Optimize Your Listing: Add more details or photos to make your auction stand out. </li>
                <li>Choose the Right Timing: Schedule your auction for peak buyer activity.
                
              </ul>`,

              message2: `<p>Thank you for choosing <b>Alletre</b>. We’re here to help you succeed in all your future auctions!</p>
                        <p style="margin-bottom: 0;">Best regards,</p>
                        <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                          <p>P.S. If you have questions about the refund process, feel free to contact us anytime.</p>`,
              Button_text: 'Create Auction ',
              Button_URL: ' https://www.alletre.com/',
            };
            //calling send email function
            await this.emailService.sendEmail(
              updatedDataOfCancellAuction.user.email,
              'token',
              EmailsType.OTHER,
              body,
            );
            const whatsappBody = {
              1: `${updatedDataOfCancellAuction.user.userName}`,
              2: `✅ Your auction for *${updatedDataOfCancellAuction.product.title}* has been cancelled.`,
              3: `No bidders – deposit of ${updatedDataOfCancellAuction.product.category.sellerDepositFixedAmount} refunded.`,
              4: `*Category:* ${updatedDataOfCancellAuction.product.category.nameEn}`,
              5: `*Starting Bid:* ${updatedDataOfCancellAuction.acceptedAmount}`,
              6: `*Ends:* ${formattedEndDate}`,
              7: `💡 Tip: Add more details/photos or list at peak times to attract bidders.`,
              8: updatedDataOfCancellAuction.product.images[0].imageLink,
              9: `https://www.alletre.com/`,
            };

            if (updatedDataOfCancellAuction.user.phone) {
              await this.whatsappService.sendOtherUtilityMessages(
                whatsappBody,
                updatedDataOfCancellAuction.user.phone,
                'alletre_common_utility_templet',
              );
            }

            const auctionCancelNotificationData =
              await this.prismaService.notification.create({
                data: {
                  userId: updatedDataOfCancellAuction.user.id,
                  message: `Your auction for "${updatedDataOfCancellAuction.product.title}" (Model: ${updatedDataOfCancellAuction.product.model}) has been canceled with zero bidders.`,
                  imageLink:
                    updatedDataOfCancellAuction.product.images[0].imageLink,
                  productTitle: updatedDataOfCancellAuction.product.title,
                  auctionId: updatedDataOfCancellAuction.id,
                },
              });
            if (auctionCancelNotificationData) {
              // Send notification to seller
              console.log('auction____', auctionCancelNotificationData);
              const sellerUserId = auctionCancelNotificationData.userId;
              const notification = {
                status: 'ON_AUCTION_CANCELLED_WITH_ZERO_BIDDER',
                userType: 'FOR_SELLER',
                usersId: sellerUserId,
                message: auctionCancelNotificationData.message,
                imageLink: auctionCancelNotificationData.imageLink,
                productTitle: auctionCancelNotificationData.productTitle,
                auctionId: auctionCancelNotificationData.auctionId,
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
          //emiting cancel auction to remove the auction from users screen
          this.auctionWebsocketGateway.cancelAuction(auctionId);
          return {
            success: true,
            message: 'You have successfully cancelled your auction.',
            auctionId,
          };
        } else {
          throw new MethodNotAllowedResponse({
            ar: 'عذرا! لا يمكنك إلغاء هذا المزاد',
            en: 'Sorry! You cannot cancel this auction',
          });
        }
      }
    } catch (error) {
      console.log(error);
      throw new MethodNotAllowedResponse({
        ar: 'عذرا! لا يمكنك إلغاء هذا المزاد',
        en: 'Sorry! You cannot cancel this auction',
      });
    }
  }

  async updateDraftAuction(auctionId: number, productDTO: ProductDTO) {
    const auction = await this.checkAuctionExistanceAndReturn(auctionId);

    this.auctionStatusValidator.isActionValidForAuction(
      auction,
      AuctionActions.AUCTION_UPDATE,
    );
    // await this.auctionsHelper._isAuctionValidForUpdate(auctionId);

    await this._updateProduct(auction.productId, productDTO);

    return auction;
  }

  async updateAuction(
    auctionId: number,
    auctionCreationDTO: AuctionCreationDTO,
    userId: number,
    files?: Express.Multer.File[],
  ) {
    const auction = await this.checkAuctionExistanceAndReturn(auctionId);

    this.auctionStatusValidator.isActionValidForAuction(
      auction,
      AuctionActions.AUCTION_UPDATE,
    );

    const { type, durationUnit, startDate, product } = auctionCreationDTO;
    // Handle image uploads if files are provided
    if (files && files.length > 0) {
      // Handle both images and videos
      const mediaFiles = files.filter(
        (file) =>
          file.mimetype.startsWith('image/') ||
          file.mimetype.startsWith('video/'),
      );
      let mediaUrls: any;
      if (mediaFiles.length > 0) {
        mediaUrls = await Promise.all(
          mediaFiles.map(async (file) => {
            return await this.firebaseService.uploadImage(file);
          }),
        );

        // Update product images and videos in database
        await this.prismaService.product.update({
          where: { id: auction.productId },
          data: {
            images: {
              create: mediaUrls.map((mediaUrl) => ({
                imagePath: mediaUrl.filePath,
                imageLink: mediaUrl.fileLink,
              })),
            },
          },
        });
      }
    }

    const productId = await this._updateProduct(auction.productId, product);

    // Update Auction
    switch (durationUnit) {
      case DurationUnits.DAYS:
        if (type === AuctionType.ON_TIME || !startDate) {
          // Update ON_TIME Daily auction
          return await this._updateOnTimeDailyAuction(
            auctionId,
            userId,
            productId,
            auctionCreationDTO,
          );
        } else if (type === AuctionType.SCHEDULED || startDate) {
          // Update Schedule Daily auction
          return await this._updateScheduleDailyAuction(
            auctionId,
            userId,
            productId,
            auctionCreationDTO,
          );
        }
        break;

      case DurationUnits.HOURS:
        if (type === AuctionType.ON_TIME || !startDate) {
          // Update ON_TIME hours auction
          return await this._updateOnTimeHoursAuction(
            auctionId,
            userId,
            productId,
            auctionCreationDTO,
          );
        } else if (type === AuctionType.SCHEDULED || startDate) {
          // Update Schedule hours auction
          return await this._updateScheduleHoursAuction(
            auctionId,
            userId,
            productId,
            auctionCreationDTO,
          );
        }
        break;
    }
  }

  async deleteDraftedAuction(userId: number, auctionId: number) {
    const auction = await this.checkAuctionExistanceAndReturn(auctionId);

    this.auctionStatusValidator.isActionValidForAuction(
      auction,
      AuctionActions.AUCTION_DELETE,
    );
    // await this.auctionsHelper._auctionCanBeDeletedByOwner(auctionId);

    const deletedImages = this.prismaService.image.deleteMany({
      where: { productId: auction.productId },
    });

    const deletedProduct = this.prismaService.product.delete({
      where: { id: auction.productId },
    });

    const deletedAuction = this.prismaService.auction.delete({
      where: { id: auctionId },
    });

    await this.prismaService.$transaction([
      deletedImages,
      deletedAuction,
      deletedProduct,
    ]);
  }

  async deleteListedProduct(userId: number, productId: number) {
    const listedProduct = await this.prismaService.listedProducts.findUnique({
      where: { productId: productId },
    });

    if (!listedProduct) {
      throw new NotFoundException({
        ar: 'المنتج غير موجود',
        en: 'Product not found',
      });
    }

    if (listedProduct.userId !== userId) {
      throw new ConflictException({
        ar: 'ليس لديك صلاحيات لهذا المنتج',
        en: 'You do not have permission to delete this product',
      });
    }

    const deletedImages = this.prismaService.image.deleteMany({
      where: { productId: productId },
    });

    const deletedWatchLists = this.prismaService.watchList.deleteMany({
      where: { productId: productId },
    });

    const deletedListedProducts = this.prismaService.listedProducts.delete({
      where: { productId: productId },
    });

    const deletedProduct = this.prismaService.product.delete({
      where: { id: productId },
    });

    await this.prismaService.$transaction([
      deletedImages,
      deletedWatchLists,
      deletedListedProducts,
      deletedProduct,
    ]);

    return {
      success: true,
      message: 'Product deleted successfully',
    };
  }

  // TODO: Add status as a filter for ownes auctions
  async findUserOwnesAuctions(
    userId: number,
    getAuctionsByOwnerDTO: GetAuctionsByOwnerDTO,
  ) {
    const { page = 1, perPage = 10, status, type } = getAuctionsByOwnerDTO;

    const { limit, skip } = this.paginationService.getSkipAndLimit(
      Number(page),
      Number(perPage),
    );

    const whereClauseForList: any = {
      userId: userId,
      ...(status ? { status: status } : {}),
      product: { isAuctionProduct: true }, // Default to only auctions
    };

    if (type) {
      if (type === 'LISTED_PRODUCT') {
        whereClauseForList.product = { isAuctionProduct: false };
      } else {
        whereClauseForList.type = type as any;
      }
    }

    const userAuctions = await this.prismaService.auction.findMany({
      skip: skip,
      take: limit,
      where: whereClauseForList,
      include: {
        product: {
          include: {
            category: true,
            // // brand: true,
            subCategory: true,
            city: true,
            country: true,
            images: true,
          },
        },
        _count: { select: { bids: true } },
        bids: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const whereClause: any = {
      userId: userId,
      ...(status ? { status: status } : {}),
      product: { isAuctionProduct: true }, // Default to only auctions
    };

    if (type) {
      if (type === 'LISTED_PRODUCT') {
        whereClause.product = { isAuctionProduct: false };
      } else {
        whereClause.type = type as any;
      }
    }

    const userOwensAuctionsCount = await this.prismaService.auction.count({
      where: whereClause,
    });

    const pagination = this.paginationService.getPagination(
      userOwensAuctionsCount,
      page,
      perPage,
    );

    return { userAuctions, pagination };
  }
  async findOtherUserAuctions(
    userId: number,
    GetAuctionsByOtherUserdto: GetAuctionsByOtherUserDTO,
  ) {
    console.log('getAuctionsByOwnerDTO :', GetAuctionsByOtherUserdto);
    const { page = 1, perPage = 10, status, type } = GetAuctionsByOtherUserdto;

    const { limit, skip } = this.paginationService.getSkipAndLimit(
      Number(page),
      Number(perPage),
    );

    const whereClause: any = {
      userId: userId,
      status: status ? status : { in: ['ACTIVE', 'IN_SCHEDULED'] },
      product: { isAuctionProduct: true }, // Default to only auctions
    };

    if (type) {
      if (type === 'LISTED_PRODUCT') {
        whereClause.product = { isAuctionProduct: false };
      } else {
        whereClause.type = type as any;
      }
    }

    const userAuctions = await this.prismaService.auction.findMany({
      skip: skip,
      take: limit,
      where: whereClause,
      include: {
        product: {
          select: {
            id: true,
            title: true,
            description: true,
            categoryId: true,
            subCategoryId: true,
            brandId: true,
            images: true,
            usageStatus: true,
          },
        },
        _count: { select: { bids: true } },
        bids: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const userOwensAuctionsCount = await this.prismaService.auction.count({
      where: whereClause,
    });

    const pagination = this.paginationService.getPagination(
      userOwensAuctionsCount,
      page,
      perPage,
    );

    return { userAuctions, pagination };
  }

  async findAuctionsAnalyticsForOwner(userId: number) {
    const count = await this.prismaService.auction.count({
      where: { userId, product: { isAuctionProduct: true } },
    });
    const auctionsGrouping = await this.prismaService.auction.groupBy({
      by: ['status'],
      where: { userId, product: { isAuctionProduct: true } },
      _count: { status: true },
    });

    return {
      count,
      auctionsGrouping: auctionsGrouping?.length
        ? auctionsGrouping.map((item) => {
            return {
              count: item['_count']?.status,
              status: item.status,
            };
          })
        : [],
    };
  }

  async findAuctionsByAdmin(getAuctionsByOwnerDTO: GetAuctionsByOwnerDTO) {
    const { page = 1, perPage = 10, status } = getAuctionsByOwnerDTO;

    const { limit, skip } = this.paginationService.getSkipAndLimit(
      Number(page),
      Number(perPage),
    );

    const auctions = await this.prismaService.auction.findMany({
      skip: skip,
      take: limit,
      where: {
        ...(status ? { status: status } : {}),
      },
      include: {
        product: {
          include: {
            category: true,
            // brand: true,
            subCategory: true,
            city: true,
            country: true,
            images: true,
          },
        },
        _count: { select: { bids: true } },
        bids: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const count = await this.prismaService.auction.count({
      where: {
        ...(status ? { status: status } : {}),
      },
    });

    const pagination = this.paginationService.getPagination(
      count,
      page,
      perPage,
    );

    return { auctions, pagination };
  }

  async findAuctionsForUser(
    roles: Role[],
    getAuctionsDTO: GetAuctionsDTO,
    userId?: number,
  ) {
    console.log('qqqq', getAuctionsDTO);
    const {
      page = 1,
      perPage = 10,
      brands,
      categories,
      subCategory,
      countries,
      priceFrom,
      priceTo,
      sellingType,
      usageStatus,
      title,
      auctionStatus,
      isHome,
      sortBy,
      sortOrder = 'desc',
    } = getAuctionsDTO;
    // here all data of the getAuctionDTO will come when we do a search and filter in home screen
    // console.log( '===>', page ,perPage ,brands,categories,countries,priceFrom,priceTo,sellingType,usageStatus,title, auctionStatus,);

    const { limit, skip } = this.paginationService.getSkipAndLimit(
      Number(page),
      Number(perPage),
    );

    const productFilter =
      this.auctionsHelper._productFilterApplied(getAuctionsDTO);

    const auctionFilter = this.auctionsHelper._auctionFilterApplied({
      priceFrom,
      priceTo,
      countries,
      sellingType,
    });

    const queryOptions: any = {
      where: {
        ...(auctionStatus
          ? { status: auctionStatus }
          : {
              status: {
                in: [AuctionStatus.ACTIVE],
              },
            }),
        ...auctionFilter,
        product: { ...productFilter },
      },
      select: {
        id: true,
        userId: true,
        acceptedAmount: true,
        productId: true,
        status: true,
        type: true,
        createdAt: true,
        durationInDays: true,
        durationInHours: true,
        durationUnit: true,
        expiryDate: true,
        endDate: true,
        isBuyNowAllowed: true,
        startBidAmount: true,
        startDate: true,
        locationId: true,
        isItemSendForDelivery: true,
        IsDelivery: true,
        deliveryPolicyDescription: true,
        numOfDaysOfExpecetdDelivery: true,
        DeliveryFees: true,
        IsReturnPolicy: true,
        returnPolicyDescription: true,
        IsWarranty: true,
        warrantyPolicyDescription: true,
        deliveryType: true,
        deliveryRequestsStatus: true,
        isLocked: true,
        lockedByUserId: true,
        lockedAt: true,
        product: {
          select: {
            id: true,
            title: true,
            description: true,
            categoryId: true,
            subCategoryId: true,
            brandId: true,
            images: true,
            usageStatus: true,
          },
        },
        _count: { select: { bids: true } },
        bids: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: (() => {
        if (sortBy === 'price') {
          return { startBidAmount: sortOrder };
        }
        if (sortBy === 'kilometers') {
          return { product: { kilometers: sortOrder } };
        }
        if (sortBy === 'year') {
          return { product: { releaseYear: sortOrder } };
        }
        return { [sortBy || 'createdAt']: sortOrder };
      })(),
    };

    // Conditionally add pagination
    if (!isHome) {
      queryOptions.skip = skip;
      queryOptions.take = limit;
    }

    const auctions = await this.prismaService.auction.findMany(queryOptions);

    const auctionsCount = await this.prismaService.auction.count({
      where: {
        ...(auctionStatus
          ? { status: auctionStatus }
          : {
              status: {
                in: [AuctionStatus.ACTIVE],
              },
            }),
        ...auctionFilter,
        product: { ...productFilter },
      },
    });

    const pagination = this.paginationService.getPagination(
      auctionsCount,
      page,
      perPage,
    );

    if (roles.includes(Role.User)) {
      const savedAuctions =
        await this.auctionsHelper._injectIsSavedKeyToAuctionsList(
          userId,
          auctions,
        );
      return {
        auctions: this.auctionsHelper._injectIsMyAuctionKeyToAuctionsList(
          userId,
          savedAuctions,
        ),
        pagination,
      };
    }

    return {
      auctions,
      pagination,
    };
  }

  async findLiveAuctionsForUser(
    roles: Role[],
    paginationDTO: PaginationDTO,
    userId?: number,
  ) {
    const { page = 1, perPage = 4 } = paginationDTO;

    const { limit, skip } = this.paginationService.getSkipAndLimit(
      Number(page),
      Number(perPage),
    );
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      0,
      0,
      0,
      0,
    );
    const endOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      23,
      59,
      59,
      999,
    );

    console.log(endOfToday);

    const auctions = await this.prismaService.auction.findMany({
      where: {
        status: AuctionStatus.ACTIVE,
        expiryDate: {
          lte: endOfToday,
          gte: startOfToday,
        },
      },
      select: {
        id: true,
        userId: true,
        acceptedAmount: true,
        productId: true,
        status: true,
        type: true,
        createdAt: true,
        durationInDays: true,
        durationInHours: true,
        durationUnit: true,
        expiryDate: true,
        endDate: true,
        isBuyNowAllowed: true,
        startBidAmount: true,
        startDate: true,
        locationId: true,
        isItemSendForDelivery: true,
        IsDelivery: true,
        deliveryPolicyDescription: true,
        numOfDaysOfExpecetdDelivery: true,
        DeliveryFees: true,
        IsReturnPolicy: true,
        returnPolicyDescription: true,
        IsWarranty: true,
        warrantyPolicyDescription: true,
        deliveryType: true,
        deliveryRequestsStatus: true,
        isLocked: true,
        lockedByUserId: true,
        lockedAt: true,
        product: {
          select: {
            id: true,
            title: true,
            description: true,
            categoryId: true,
            subCategoryId: true,
            brandId: true,
            images: true,
          },
        },
        _count: { select: { bids: true } },
      },
      skip: skip,
      take: limit,
    });

    const auctionsCount = await this.prismaService.auction.count({
      where: {
        status: AuctionStatus.ACTIVE,
        expiryDate: {
          lte: endOfToday,
          gte: startOfToday,
        },
      },
    });

    const pagination = this.paginationService.getPagination(
      auctionsCount,
      page,
      perPage,
    );

    if (roles.includes(Role.User)) {
      const savedAuctions =
        await this.auctionsHelper._injectIsSavedKeyToAuctionsList(
          userId,
          auctions,
        );
      return {
        auctions: this.auctionsHelper._injectIsMyAuctionKeyToAuctionsList(
          userId,
          savedAuctions,
        ),
        pagination,
      };
    }

    return {
      auctions,
      pagination,
    };
  }

  async findBuyNowAuctionsForUser(
    roles: Role[],
    paginationDTO: PaginationDTO,
    userId?: number,
  ) {
    const { page = 1, perPage = 4 } = paginationDTO;

    const { limit, skip } = this.paginationService.getSkipAndLimit(
      Number(page),
      Number(perPage),
    );

    const auctions = await this.prismaService.auction.findMany({
      where: {
        status: AuctionStatus.ACTIVE,
        isBuyNowAllowed: true,
      },
      select: {
        id: true,
        userId: true,
        acceptedAmount: true,
        productId: true,
        status: true,
        type: true,
        createdAt: true,
        durationInDays: true,
        durationInHours: true,
        durationUnit: true,
        expiryDate: true,
        endDate: true,
        isBuyNowAllowed: true,
        startBidAmount: true,
        startDate: true,
        locationId: true,
        isItemSendForDelivery: true,
        IsDelivery: true,
        deliveryPolicyDescription: true,
        numOfDaysOfExpecetdDelivery: true,
        DeliveryFees: true,
        IsReturnPolicy: true,
        returnPolicyDescription: true,
        IsWarranty: true,
        warrantyPolicyDescription: true,
        deliveryType: true,
        deliveryRequestsStatus: true,
        isLocked: true,
        lockedByUserId: true,
        lockedAt: true,
        product: {
          select: {
            id: true,
            title: true,
            description: true,
            categoryId: true,
            subCategoryId: true,
            brandId: true,
            images: true,
          },
        },
        _count: { select: { bids: true } },
      },
      skip: skip,
      take: limit,
    });

    const auctionsCount = await this.prismaService.auction.count({
      where: {
        status: AuctionStatus.ACTIVE,
        isBuyNowAllowed: true,
      },
    });

    const pagination = this.paginationService.getPagination(
      auctionsCount,
      page,
      perPage,
    );

    if (roles.includes(Role.User)) {
      const savedAuctions =
        await this.auctionsHelper._injectIsSavedKeyToAuctionsList(
          userId,
          auctions,
        );
      return {
        auctions: this.auctionsHelper._injectIsMyAuctionKeyToAuctionsList(
          userId,
          savedAuctions,
        ),
        pagination,
      };
    }

    return {
      auctions,
      pagination,
    };
  }

  async findExpiredAuctions(
    roles: Role[],
    paginationDTO: PaginationDTO,
    userId?: number,
  ) {
    const { page = 1, perPage = 4 } = paginationDTO;

    const { limit, skip } = this.paginationService.getSkipAndLimit(
      Number(page),
      Number(perPage),
    );

    const auctions = await this.prismaService.auction.findMany({
      where: {
        status: {
          not: {
            in: [
              AuctionStatus.ACTIVE,
              AuctionStatus.IN_SCHEDULED,
              AuctionStatus.PENDING_OWNER_DEPOIST,
              AuctionStatus.DRAFTED,
              AuctionStatus.CANCELLED_AFTER_EXP_DATE,
              AuctionStatus.CANCELLED_BEFORE_EXP_DATE,
              AuctionStatus.CANCELLED_BY_ADMIN,
            ],
          },
        },
      },
      select: {
        id: true,
        userId: true,
        acceptedAmount: true,
        productId: true,
        status: true,
        type: true,
        createdAt: true,
        durationInDays: true,
        durationInHours: true,
        durationUnit: true,
        expiryDate: true,
        endDate: true,
        isBuyNowAllowed: true,
        startBidAmount: true,
        startDate: true,
        locationId: true,
        isItemSendForDelivery: true,
        IsDelivery: true,
        deliveryPolicyDescription: true,
        numOfDaysOfExpecetdDelivery: true,
        DeliveryFees: true,
        IsReturnPolicy: true,
        returnPolicyDescription: true,
        IsWarranty: true,
        warrantyPolicyDescription: true,
        deliveryType: true,
        deliveryRequestsStatus: true,
        isLocked: true,
        lockedByUserId: true,
        lockedAt: true,
        product: {
          select: {
            id: true,
            title: true,
            description: true,
            categoryId: true,
            subCategoryId: true,
            brandId: true,
            images: true,
            usageStatus: true,
          },
        },
        _count: { select: { bids: true } },
        bids: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      // skip: skip,
      take: 10,
    });

    const auctionsCount = await this.prismaService.auction.count({
      where: {
        status: AuctionStatus.EXPIRED,
      },
    });

    const pagination = this.paginationService.getPagination(
      auctionsCount,
      page,
      perPage,
    );

    if (roles.includes(Role.User)) {
      const savedAuctions =
        await this.auctionsHelper._injectIsSavedKeyToAuctionsList(
          userId,
          auctions,
        );
      return {
        auctions: this.auctionsHelper._injectIsMyAuctionKeyToAuctionsList(
          userId,
          savedAuctions,
        ),
        pagination,
      };
    }

    return {
      auctions,
      pagination,
    };
  }

  async findSimilarAuctions(auctionId: number, roles: Role[], userId?: number) {
    const auction = await this.checkAuctionExistanceAndReturn(
      Number(auctionId),
    );

    const auctionCategory = await this.auctionsHelper._getAuctionCategory(
      Number(auctionId),
    );

    const similarAuctions = await this.prismaService.auction.findMany({
      where: {
        product: { categoryId: auctionCategory.id },
        id: { not: auctionId },
        status: {
          in: [AuctionStatus.ACTIVE, AuctionStatus.IN_SCHEDULED],
        },
      },
      select: {
        id: true,
        userId: true,
        acceptedAmount: true,
        productId: true,
        status: true,
        type: true,
        createdAt: true,
        durationInDays: true,
        durationInHours: true,
        durationUnit: true,
        expiryDate: true,
        endDate: true,
        isBuyNowAllowed: true,
        startBidAmount: true,
        startDate: true,
        locationId: true,
        isItemSendForDelivery: true,
        IsDelivery: true,
        deliveryPolicyDescription: true,
        numOfDaysOfExpecetdDelivery: true,
        DeliveryFees: true,
        IsReturnPolicy: true,
        returnPolicyDescription: true,
        IsWarranty: true,
        warrantyPolicyDescription: true,
        deliveryType: true,
        deliveryRequestsStatus: true,
        isLocked: true,
        lockedByUserId: true,
        lockedAt: true,
        product: {
          select: {
            id: true,
            title: true,
            description: true,
            categoryId: true,
            subCategoryId: true,
            brandId: true,
            images: true,
            usageStatus: true,
          },
        },
        _count: { select: { bids: true } },
        bids: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      take: 8,
    });

    if (roles.includes(Role.User)) {
      const savedAuctions =
        await this.auctionsHelper._injectIsSavedKeyToAuctionsList(
          userId,
          similarAuctions,
        );
      return {
        similarAuctions:
          this.auctionsHelper._injectIsMyAuctionKeyToAuctionsList(
            userId,
            savedAuctions,
          ),
        count: similarAuctions.length,
      };
    }

    return {
      similarAuctions,
      count: similarAuctions.length,
    };
  }
  async findSimilarProducts(productId: number, userId?: number) {
    const product = await this.prismaService.product.findUnique({
      where: { id: productId },
      select: { categoryId: true },
    });

    if (!product) {
      throw new NotFoundResponse({
        ar: 'لم يتم العثور على المنتج',
        en: 'Product Not Found',
      });
    }

    const similarProducts = await this.prismaService.listedProducts.findMany({
      where: {
        product: {
          categoryId: product.categoryId,
          id: { not: productId },
          isAuctionProduct: false,
          ...(userId ? { userId: { not: userId } } : {}),
        },
      },
      select: {
        location: {
          select: {
            city: true,
            country: true,
          },
        },
        createdAt: true,
        product: {
          select: {
            id: true,
            title: true,
            description: true,
            ProductListingPrice: true,
            categoryId: true,
            images: true,
            usageStatus: true,
            user: {
              select: {
                id: true,
                userName: true,
                locations: true,
              },
            },
          },
        },
      },
      take: 8,
    });

    return {
      count: similarProducts.length,
      similarProducts,
    };
  }

  async findUpCommingAuctionsForUser(
    roles: Role[],
    getAuctionsDTO: GetAuctionsDTO,
    userId?: number,
  ) {
    console.log('rrrr', getAuctionsDTO);
    const {
      page = 1,
      perPage = 10,
      brands,
      categories,
      subCategory,
      countries,
      priceFrom,
      priceTo,
      sellingType,
      usageStatus,
      title,
      isHome,
    } = getAuctionsDTO;

    const { limit, skip } = this.paginationService.getSkipAndLimit(
      Number(page),
      Number(perPage),
    );

    const today = new Date();

    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      0,
      0,
      0,
      0,
    );

    const productFilter =
      this.auctionsHelper._productFilterApplied(getAuctionsDTO);

    const auctionFilter = this.auctionsHelper._auctionFilterApplied({
      priceFrom,
      priceTo,
      countries,
      sellingType,
    });
    console.log('PPPPPP', productFilter);
    console.log('auctionFilter', auctionFilter);

    const queryOptions: any = {
      where: {
        status: AuctionStatus.IN_SCHEDULED,
        startDate: { gte: startOfToday },
        product: productFilter,
        ...auctionFilter,
      },
      select: {
        id: true,
        userId: true,
        acceptedAmount: true,
        productId: true,
        status: true,
        type: true,
        createdAt: true,
        durationInDays: true,
        durationInHours: true,
        durationUnit: true,
        expiryDate: true,
        endDate: true,
        isBuyNowAllowed: true,
        startBidAmount: true,
        startDate: true,
        locationId: true,
        isItemSendForDelivery: true,
        IsDelivery: true,
        deliveryPolicyDescription: true,
        numOfDaysOfExpecetdDelivery: true,
        DeliveryFees: true,
        IsReturnPolicy: true,
        returnPolicyDescription: true,
        IsWarranty: true,
        warrantyPolicyDescription: true,
        deliveryType: true,
        deliveryRequestsStatus: true,
        isLocked: true,
        lockedByUserId: true,
        lockedAt: true,
        product: {
          select: {
            id: true,
            title: true,
            description: true,
            categoryId: true,
            subCategoryId: true,
            brandId: true,
            images: true,
            usageStatus: true,
          },
        },
        _count: { select: { bids: true } },
        bids: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      skip: skip,
      take: limit,
      orderBy: { startDate: 'asc' },
    };

    // Conditionally add pagination
    if (!isHome) {
      queryOptions.skip = skip;
      queryOptions.take = limit;
    }

    const auctions = await this.prismaService.auction.findMany(queryOptions);
    const auctionsCount = await this.prismaService.auction.count({
      where: {
        status: AuctionStatus.IN_SCHEDULED,
        startDate: { gte: startOfToday },
        product: productFilter,
        ...auctionFilter,
      },
    });

    const pagination = this.paginationService.getPagination(
      auctionsCount,
      page,
      perPage,
    );

    if (roles.includes(Role.User)) {
      const savedAuctions =
        await this.auctionsHelper._injectIsSavedKeyToAuctionsList(
          userId,
          auctions,
        );
      return {
        auctions: this.auctionsHelper._injectIsMyAuctionKeyToAuctionsList(
          userId,
          savedAuctions,
        ),
        pagination,
      };
    }

    return {
      auctions,
      pagination,
    };
  }

  async findSponseredAuctions(roles: Role[], userId?: number) {
    console.log('auctions ====> account1', roles, userId);

    const auctions = await this.prismaService.auction.findMany({
      where: {
        status: AuctionStatus.ACTIVE,
        isBuyNowAllowed: true,
      },
      select: {
        id: true,
        userId: true,
        acceptedAmount: true,
        productId: true,
        status: true,
        type: true,
        createdAt: true,
        durationInDays: true,
        durationInHours: true,
        durationUnit: true,
        expiryDate: true,
        endDate: true,
        isBuyNowAllowed: true,
        startBidAmount: true,
        startDate: true,
        locationId: true,
        isItemSendForDelivery: true,
        IsDelivery: true,
        deliveryPolicyDescription: true,
        numOfDaysOfExpecetdDelivery: true,
        DeliveryFees: true,
        IsReturnPolicy: true,
        returnPolicyDescription: true,
        IsWarranty: true,
        warrantyPolicyDescription: true,
        deliveryType: true,
        deliveryRequestsStatus: true,
        isLocked: true,
        lockedByUserId: true,
        lockedAt: true,
        product: {
          select: {
            id: true,
            title: true,
            description: true,
            categoryId: true,
            subCategoryId: true,
            brandId: true,
            images: true,
          },
        },
        _count: { select: { bids: true } },
      },
      orderBy: { startBidAmount: 'desc' },
      take: 4,
    });
    console.log('auctions ====> account2', auctions);
    if (roles.includes(Role.User)) {
      return this.auctionsHelper._injectIsMyAuctionKeyToAuctionsList(
        userId,
        auctions,
      );
    }
    return auctions;
  }

  async findOwnerAuctionByIdOr404(auctionId: number) {
    try {
      const auction = await this.prismaService.auction.findUnique({
        where: { id: auctionId },
        include: {
          product: {
            include: {
              category: true,
              // brand: true,
              subCategory: true,
              city: true,
              country: true,
              images: true,
            },
          },
          user: { select: { lang: true } },
          location: {
            include: { city: true, country: true },
          },
          _count: { select: { bids: true } },
        },
      });

      if (!auction)
        throw new NotFoundResponse({
          ar: 'لا يوجد هذا الاعلان',
          en: 'Auction Not Found',
        });

      const formatedAuction = this.auctionsHelper._reformatAuctionObject(
        auction.user.lang,
        auction,
      );

      const resultAuction =
        await this.auctionsHelper._injectIsSavedKeyToAuction(
          auction.userId,
          formatedAuction,
        );
      const isAuctionHasBidders = await this._isAuctionHasBidders(auctionId);

      return {
        ...resultAuction,
        hasBids: isAuctionHasBidders,
        latestBidAmount: isAuctionHasBidders
          ? await this._findLatestBidForAuction(auctionId)
          : undefined,
      };
    } catch (error) {
      console.log('findOwnerAuctionByIdOr404 error :', error);
    }
  }

  async getSellerLocation(auctionId: number) {
    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
      include: {
        location: { include: { city: true, country: true } },
        user: true,
      },
    });
    const sellerContactDetails = auction?.location;
    Object.assign(sellerContactDetails, {
      phone: auction.user.phone,
      userName: auction.user.userName,
      email: auction.user.email,
    });
    return sellerContactDetails;
  }

  async getBuyerDetails(auctionId: number) {
    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
      include: { bids: { orderBy: { amount: 'desc' } } },
    });
    if (auction.bids.length) {
      const buyerData = await this.prismaService.user.findUnique({
        where: { id: auction.bids[0].userId },
        include: {
          locations: {
            where: { isMain: true },
            include: { city: true, country: true },
          },
        },
      });
      const buyerContactDetails = buyerData?.locations[0];
      Object.assign(buyerContactDetails, {
        phone: buyerData.phone,
        userName: buyerData.userName,
        email: buyerData.email,
      });
      return buyerContactDetails;
    }
    return null;
  }

  async findAuctionByIdOr404(
    auctionId: number,
    roles: Role[],
    userId?: number,
  ) {
    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
      include: {
        product: {
          include: {
            category: true,
            // brand: true,
            subCategory: true,
            city: true,
            country: true,
            images: true,
          },
        },
        user: true,
        location: {
          include: { city: true, country: true },
        },

        _count: { select: { bids: true } },
      },
    });
    if (!auction)
      throw new NotFoundResponse({
        ar: 'لا يوجد هذا الاعلان',
        en: 'Auction Not Found',
      });

    const formatedAuction = this.auctionsHelper._reformatAuctionObject(
      auction.user.lang,
      auction,
    );
    // Add deposit flag for bidder
    const isDepositPaid = await this.prismaService.payment.findFirst({
      where: {
        userId,
        auctionId,
        status: { in: [PaymentStatus.SUCCESS, PaymentStatus.HOLD] },
        type: PaymentType.BIDDER_DEPOSIT,
      },
    });

    if (roles.includes(Role.User)) {
      if (Number(formatedAuction.userId) === Number(userId)) {
        formatedAuction['isMyAuction'] = true;
      } else {
        formatedAuction['isMyAuction'] = false;
        auction['isDepositPaid'] = isDepositPaid ? true : false;
      }

      const savedAuction = await this.auctionsHelper._injectIsSavedKeyToAuction(
        userId,
        formatedAuction,
      );
      const isAuctionHasBidders = await this._isAuctionHasBidders(auctionId);

      return {
        ...savedAuction,
        hasBids: isAuctionHasBidders,
        latestBidAmount: isAuctionHasBidders
          ? await this._findLatestBidForAuction(auctionId)
          : undefined,
        winnerSecurityDeposite: isDepositPaid,
      };
    }

    const isAuctionHasBidders = await this._isAuctionHasBidders(auctionId);

    return {
      ...formatedAuction,
      hasBids: isAuctionHasBidders,
      latestBidAmount: isAuctionHasBidders
        ? await this._findLatestBidForAuction(auctionId)
        : undefined,
    };
  }

  async checkAuctionExistanceAndReturn(auctionId: number) {
    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
      // include:{bids: true,product:true}
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
    });

    if (!auction)
      throw new NotFoundResponse({
        ar: 'لا يوجد هذا الاعلان',
        en: 'Auction Not Found',
      });

    return auction;
  }

  async getPendingPayments(
    aucitonId: string,
    paymentType: PaymentType,
    userId: number,
  ) {
    try {
      const data = await this.prismaService.payment.findMany({
        where: {
          auctionId: Number(aucitonId),
          userId: userId,
          type: paymentType,
        },
      });
      console.log('data :', data);
      if (data.length > 0 && data[0]?.paymentIntentId !== null) {
        console.log('data when true:', data);
        return { isPendingPaymentData: true };
      } else {
        console.log('data when false:', data);

        return { isPendingPaymentData: false };
      }
    } catch (error) {
      console.log('Get Pending Payments error :', error);
    }
  }

  async getAccountData(userId: number) {
    try {
      const accountData = await this.prismaService.bankAccount.findMany({
        where: { userId },
      });
      if (accountData.length) {
        return {
          success: true,
          accountData,
        };
      } else {
        return {
          success: false,
          message: 'Please add a bank account.',
        };
      }
    } catch (error) {
      console.log(
        'Check KYC status error at user auctions service file :',
        error,
      );
      return {
        success: false,
        message: 'There are some internal issue, please try again later.',
      };
    }
  }
  async addBankAccount(bankAccountData: addNewBankAccountDto, userId: number) {
    try {
      const accountData = await this.prismaService.bankAccount.create({
        data: { ...bankAccountData, userId: Number(userId) },
      });

      if (accountData) {
        return {
          success: true,
          accountData,
        };
      } else {
        return {
          success: false,
          message: 'There are some internal issue, please try again later.',
        };
      }
    } catch (error) {
      console.log('Error on add new Bank Account :', error);
      return {
        success: false,
        message: 'There are some internal issue, please try again later.',
      };
    }
  }
  async withdrawalRequest(
    amount: number,
    selectedBankAccountId: number,
    userId: number,
  ) {
    try {
      console.log('test withdrawal request : ', selectedBankAccountId);
      const request = await this.prismaService.withdrawalRequests.create({
        data: {
          amount,
          bankAccountId: selectedBankAccountId,
          userId,
          withdrawalStatus: WithdrawalStatus.PENDING,
        },
      });
      if (request) {
        return {
          success: true,
          request,
        };
      } else {
        return {
          success: false,
          message: 'Failed to process withdrawal request',
        };
      }
    } catch (error) {
      console.log(error);
      return {
        success: false,
        message: 'Failed to process withdrawal request',
      };
    }
  }
  async payToPublish(
    userId: number,
    auctionId: number,
    amount?: number,
    isWalletPayment?: boolean,
  ) {
    try {
      await this.auctionsHelper._isAuctionOwner(userId, auctionId);
      const auction = await this.checkAuctionExistanceAndReturn(auctionId);
      console.log('auction-->>', auction);
      //cheking whether it car category or not
      //if it is car category, then the user can list auction with out security deposit if the price below AED 5000

      if (auction.status === 'CANCELLED_BY_ADMIN') {
        throw new MethodNotAllowedResponse({
          ar: 'لا يمكن معالجة الدفع للمزاد الذي انتهت صلاحيته',
          en: 'Payment cannot be processed for an expired auction.',
        });
      }
      const categoryId = Number(auction.product.categoryId);
      const startBid = Number(auction.startBidAmount);

      const shouldValidate =
        categoryId !== 4 || (categoryId === 4 && startBid >= 5000);

      if (shouldValidate) {
        this.auctionStatusValidator.isActionValidForAuction(
          auction,
          AuctionActions.SELLER_DEPOSIT,
        );

        this.auctionStatusValidator.isStatusValidForAuction(
          auction,
          auction.type === AuctionType.ON_TIME
            ? AuctionStatus.ACTIVE
            : AuctionStatus.IN_SCHEDULED,
        );
      }

      const auctionCategory = await this.auctionsHelper._getAuctionCategory(
        auctionId,
      );

      const user = await this.prismaService.user.findUnique({
        where: { id: userId },
        include: {
          locations: { include: { country: true } },
        },
      });

      const sellerMainLocation = user.locations.find((location) => {
        if (location.isMain) return location;
      });

      if (!sellerMainLocation)
        throw new MethodNotAllowedResponse({
          ar: 'ادخل عنوان رئيسي',
          en: 'Set one location as main',
        });

      //calculate the seller security deposite
      const startBidAmount = auction.startBidAmount;
      let amount = Number(auctionCategory.sellerDepositFixedAmount);
      //checking whether the auction is luxuary or not
      if (
        auctionCategory.luxuaryAmount &&
        Number(startBidAmount) > Number(auctionCategory.luxuaryAmount)
      ) {
        //calculating the security deposite
        const total = Number(
          (Number(startBidAmount) *
            Number(auctionCategory.percentageOfLuxuarySD_forSeller)) /
            100,
        );
        //checking the total is less than minimum security deposite
        if (
          auctionCategory.minimumLuxuarySD_forSeller &&
          total < Number(auctionCategory.minimumLuxuarySD_forSeller)
        ) {
          amount = Number(auctionCategory.minimumLuxuarySD_forSeller);
        } else {
          amount = total;
        }
      }
      if (!isWalletPayment) {
        return await this.paymentService.payDepositBySeller(
          user,
          auctionId,
          sellerMainLocation.country.currency,
          // Number(auctionCategory.sellerDepositFixedAmount),
          amount,
        );
      } else {
        return await this.paymentService.walletPayDepositBySeller(
          user,
          auctionId,
          // sellerMainLocation.country.currency,
          amount,
        );
      }
    } catch (error) {
      console.log('error at pay publish :', error);

      throw new MethodNotAllowedResponse({
        ar:
          error.response.ar ||
          error.response.message.ar ||
          'فشل في معالجة الدفع الشريطي',
        en:
          error.response.en ||
          error.response.message.en ||
          'Failed to process stripe payment',
      });
    }
  }

  async uploadBankStatement(
    statement: Express.Multer.File,
    userId: number,
    auctionId: number,
    amount: number,
  ) {
    try {
      console.log('------------->', statement);
      const fileType = statement[0].mimetype;
      console.log('statement:', statement[0].fileName, fileType);
      // Validate that the statement file exists
      if (!statement) {
        throw new MethodNotAllowedResponse({
          ar: 'ملف كشف الحساب البنكي مطلوب',
          en: 'Bank statement file is required',
        });
      }
      let uploadedStatement: any;
      if (fileType === 'application/pdf') {
        uploadedStatement = await this.firebaseService.uploadPdf(statement[0]);
      } else {
        // Upload the bank statement as image to Firebase
        uploadedStatement = await this.firebaseService.uploadImage(
          statement[0],
        );
      }
      console.log('Uploaded bank statement:', uploadedStatement);
      // Create a payment record in the database
      const paymentData = await this.prismaService.payment.create({
        data: {
          userId,
          auctionId: Number(auctionId),
          amount,
          type: PaymentType.AUCTION_PURCHASE,
          isWalletPayment: true,
          status: 'BANK_STATEMENT_UPLOADED',
        },
        include: {
          auction: {
            include: { product: { include: { images: true } } },
          },
        },
      });

      // Ensure paymentData is successfully created
      if (!paymentData) {
        throw new MethodNotAllowedResponse({
          ar: 'فشل في إنشاء سجل الدفع',
          en: 'Failed to create payment record',
        });
      }

      // Create a bank statement record in the database
      const createdImage = await this.prismaService.bankStatement.create({
        data: {
          paymentId: paymentData.id,
          statementLink: uploadedStatement.fileLink,
          statementPath: uploadedStatement.filePath,
        },
      });

      console.log('Uploaded bank statement record:', createdImage);

      return createdImage; // Return the created image for further processing, if needed
    } catch (error) {
      console.error('Error uploading bank statement:', error);

      throw new MethodNotAllowedResponse({
        ar: 'فشل تحميل كشف الحساب البنكي',
        en: 'Failed to upload bank statement',
      });
    }
  }

  async findBankTransferData() {
    const paymentsData = await this.prismaService.payment.findMany({
      where: {
        type: PaymentType.AUCTION_PURCHASE,
        bankStatement: { isNot: null },
      },
      include: {
        bankStatement: true,
        auction: {
          include: {
            user: true,
            location: { include: { city: true, country: true } },
            product: { include: { images: true } },
          },
        },
        user: {
          include: { locations: { include: { city: true, country: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return paymentsData;
  }

  async updateBankTranferRequestsByAdmin(
    requestId: string,
    status: PaymentStatus,
  ) {
    try {
      const updatedBankTransferRequestData =
        await this.prismaService.payment.update({
          where: {
            id: Number(requestId),
          },
          data: {
            status,
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

      const joinedAuction = await this.prismaService.joinedAuction.findFirst({
        where: {
          userId: updatedBankTransferRequestData.userId,
          auctionId: updatedBankTransferRequestData.auctionId,
        },
        include: {
          user: true,
        },
      });

      if (updatedBankTransferRequestData) {
        const lastBalanceOfAlletre =
          await this.walletService.findLastTransactionOfAlletre();
        // wallet data for deposit to alletre wallet

        const alletreWalletData = {
          status: WalletStatus.DEPOSIT,
          transactionType: WalletTransactionType.By_AUCTION,
          description: `Bank Transfer`,
          amount: Number(updatedBankTransferRequestData.amount),
          auctionId: Number(updatedBankTransferRequestData.auctionId),
          balance: lastBalanceOfAlletre
            ? Number(lastBalanceOfAlletre) +
              Number(updatedBankTransferRequestData.amount)
            : Number(updatedBankTransferRequestData.amount),
        };

        // const isAlletreWalletCreted =
        //   await this.walletService.addToAlletreWallet(
        //     updatedBankTransferRequestData.userId,
        //     alletreWalletData,
        //   );

        const joinedAuction = await this.prismaService.joinedAuction.findFirst({
          where: {
            userId: updatedBankTransferRequestData.userId,
            auctionId: updatedBankTransferRequestData.auctionId,
          },
          include: {
            user: true,
          },
        });

        await this.prismaService.$transaction(async (prisma) => {
          // const isAlletreWalletCreted = await prisma.alletreWallet.create({
          //   data: {
          //     userId: updatedBankTransferRequestData.userId,
          //     description: alletreWalletData.description,
          //     amount: Number(Number(alletreWalletData.amount).toFixed(2)),
          //     status: alletreWalletData.status,
          //     transactionType: alletreWalletData.transactionType,
          //     auctionId: alletreWalletData.auctionId,
          //     balance: Number(Number(alletreWalletData.balance).toFixed(2)),
          //   },
          // });

          // Update joinedAuction for bidder to WAITING_DELIVERY
          await prisma.joinedAuction.update({
            where: { id: joinedAuction.id },
            data: {
              status: JoinedAuctionStatus.WAITING_FOR_DELIVERY,
            },
          });
          // Update auction status to sold
          await prisma.auction.update({
            where: { id: updatedBankTransferRequestData.auctionId },
            data: { status: AuctionStatus.SOLD },
          });
        });
      }
      const paymentData = updatedBankTransferRequestData;
      if (paymentData) {
        //Email to winning bidder paid amount (wallet)
        const paymentSuccessData = paymentData;
        const invoicePDF = await generateInvoicePDF(paymentSuccessData);
        const emailBodyToWinner = {
          subject: '🎉 Payment Confirmation and Next Steps',
          title:
            'Your Bank Transfer Payment is Confirmed – Please Confirm Delivery Upon Completion',
          Product_Name: paymentSuccessData.auction.product.title,
          img: paymentSuccessData.auction.product.images[0].imageLink,
          userName: `${paymentSuccessData.auction.bids[0].user.userName}`,
          message1: `
                    <p>We are pleased to inform you that your payment for the auction of <b>${paymentSuccessData.auction.product.title} (Model: ${paymentSuccessData.auction.product.model})</b> has been successfully received via bank transfer.</p>
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
                
                Your payment has been successfully received via bank transfer.
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
                            <li>Delivery Option Chosen:${paymentData.auction.deliveryType}</li>
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

        const whatsappBodyToSeller = {
          1: `${paymentData.auction.user.userName}`,
          2: `🎉 Payment received! The winning bidder for *${paymentData.auction.product.title}* has paid in full.`,
          3: `*Winning Bid:* ${paymentData.auction.bids[0].amount}`,
          4: `*Buyer:* ${paymentData.auction.bids[0].user.userName}`,
          5: `*Delivery Option:* ${paymentData.auction.deliveryType}`,
          6: `If *delivery* chosen: Please prepare the item for shipment.`,
          7: `If *pickup* chosen: Confirm with buyer upon item handover.`,
          8: `${paymentData.auction.product.images[0].imageLink}`,
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
          2: `🎉 Your payment for *${paymentSuccessData.auction.product.title}* (Model: ${paymentSuccessData.auction.product.model}) has been received via bank transfer.`,
          3: `*Winning Bid:* ${paymentSuccessData.auction.bids[0].amount}`,
          4: `*Seller:* ${paymentSuccessData.auction.user.userName}`,
          5: `Please confirm delivery after receiving the item by tapping "Confirm Delivery" under "My Bids" > "Waiting for Delivery".`,
          6: `If you face any issues, contact support anytime.`,
          7: `Thanks for choosing *Alletre*!`,
          8: `${paymentSuccessData.auction.product.images[0].imageLink}`,
          9: `https://www.alletre.com/alletre/profile/my-bids/waiting-for-delivery`,
        };

        if (paymentSuccessData.auction.bids[0].user.phone) {
          await this.whatsappService.sendOtherUtilityMessages(
            whatsappBodyToWinner,
            paymentSuccessData.auction.bids[0].user.phone,
            'alletre_common_utility_templet',
          );
        }

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
            this.notificationService.sendNotificationToSpecificUsers(
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
            this.notificationService.sendNotificationToSpecificUsers(
              notificationBodyToWinner,
            );
          }
        } catch (error) {
          console.log('sendNotificationToSpecificUsers error', error);
        }
        //Notifying delivery request to admin
        // this.adminGateway.emitEventToAdmins(
        //   'delivery:newNotification',
        //   paymentData,
        // );
      }

      return updatedBankTransferRequestData;
    } catch (error) {
      console.log('Error at updateBankTranferRequestsByAdmin:', error);
      throw new MethodNotAllowedResponse({
        ar: 'لايمكنك شراء المزاد',
        en: 'error when updating the Bank Transfer request data',
      });
    }
  }

  // async payDepositByBidder(
  //   userId: number,
  //   auctionId: number,
  //   bidAmount: number,
  //   isWalletPayment?: boolean,
  //   amount_forWalletPay?: number,
  // ) {

  //   console.log('payDepositByBidder test 1', bidAmount);

  //   const auction = await this.checkAuctionExistanceAndReturn(auctionId);

  //   this.auctionStatusValidator.isActionValidForAuction(
  //     auction,
  //     AuctionActions.BIDDER_DEPOSIT,
  //   );

  //   // Check authorization
  //   if (auction.userId === userId)
  //     throw new MethodNotAllowedResponse({
  //       ar: 'هذا الاعلان من احد إعلاناتك',
  //       en: 'This auction is one of your created auctions',
  //     });

  //   // Validate CurrentBidAmount with bidAmount if there is no bidders else validate with latest bidAmount
  //   let latestBidAmount: Decimal;
  //   const isAuctionHasBidders = await this._isAuctionHasBidders(auctionId);
  //   if (isAuctionHasBidders) {
  //     latestBidAmount = await this._findLatestBidForAuction(auctionId);
  //     // Convert both to Decimal or both to number for proper comparison
  //     const currentBid = new Prisma.Decimal(latestBidAmount.toString());
  //     const newBid = new Prisma.Decimal(bidAmount.toString());
  //     console.log('currentBid : ', currentBid);
  //     console.log('newBid : ', newBid);
  //     if (currentBid.gte(newBid))
  //       throw new MethodNotAllowedResponse({
  //         ar: 'قم برفع السعر',
  //         en: 'Bid Amount Must Be Greater Than Current Amount',
  //       });
  //   } else {
  //     latestBidAmount = auction.startBidAmount;
  //     console.log('latestBidAmount : ', latestBidAmount);
  //     console.log('bidAmount : ', bidAmount);
  //     console.log(
  //       'latestBidAmount >= new Prisma.Decimal(bidAmount) : ',
  //       latestBidAmount >= new Prisma.Decimal(bidAmount),
  //     );
  //     // Convert both to Decimal or both to number for proper comparison
  //     const currentBid = new Prisma.Decimal(latestBidAmount.toString());
  //     const newBid = new Prisma.Decimal(bidAmount.toString());
  //     if (currentBid.gte(newBid))
  //       throw new MethodNotAllowedResponse({
  //         ar: 'قم برفع السعر',
  //         en: 'Bid Amount Must Be Greater Than Current Amount',
  //       });
  //   }

  //   const auctionCategory = await this.auctionsHelper._getAuctionCategory(
  //     auctionId,
  //   );

  //   const user = await this.prismaService.user.findUnique({
  //     where: { id: userId },
  //     include: {
  //       locations: { include: { country: true } },
  //     },
  //   });

  //   const bidderMainLocation = user.locations.find((location) => {
  //     if (location.isMain) return location;
  //   });

  //   if (!bidderMainLocation)
  //     throw new MethodNotAllowedResponse({
  //       ar: 'ادخل عنوان رئيسي',
  //       en: 'Set one location as main',
  //     });

  //   console.log('payDepositByBidder test 2');
  //   //calculate the seller security deposite
  //   const startBidAmount = auction.startBidAmount;
  //   let amount = Number(auctionCategory.bidderDepositFixedAmount);
  //   const categoryName = auctionCategory?.nameEn;

  //   //checking whether the auction is luxuary or not
  //   if (
  //     auctionCategory.luxuaryAmount &&
  //     Number(startBidAmount) > Number(auctionCategory.luxuaryAmount)
  //   ) {
  //     let total: number;
  //     //calculating the security deposite
  //     total = Number(
  //       (Number(startBidAmount) *
  //         Number(auctionCategory.percentageOfLuxuarySD_forBidder)) /
  //         100,
  //     );

  //     if (categoryName === 'Cars' || categoryName === 'Properties') {
  //       const latestBidAmount = auction?.bids?.reverse()[0]?.amount;
  //       total = Number(
  //         ((latestBidAmount
  //           ? Number(latestBidAmount)
  //           : Number(startBidAmount)) *
  //           Number(auctionCategory?.percentageOfLuxuarySD_forBidder)) /
  //           100,
  //       );
  //     }
  //     //checking the total is less than minimum security deposite
  //     if (
  //       auctionCategory.minimumLuxuarySD_forBidder &&
  //       total < Number(auctionCategory.minimumLuxuarySD_forBidder)
  //     ) {
  //       amount = Number(auctionCategory.minimumLuxuarySD_forBidder);
  //     } else {
  //       amount = total;
  //     }
  //   }
  //   if (!isWalletPayment) {
  //     return await this.paymentService.payDepositByBidder(
  //       user,
  //       auctionId,
  //       bidderMainLocation.country.currency,
  //       amount,
  //       bidAmount,
  //     );
  //   } else {
  //     return await this.paymentService.walletPayDepositByBidder(
  //       user,
  //       auctionId,
  //       // bidderMainLocation.country.currency,
  //       // Number(auctionCategory.bidderDepositFixedAmount),
  //       // amount_forWalletPay,
  //       amount,
  //       bidAmount,
  //     );
  //   }
  // }

  async payDepositByBidder(
    userId: number,
    auctionId: number,
    bidAmount: number,
    isWalletPayment?: boolean,
    amount_forWalletPay?: number,
  ) {
    const { user, auction, amount, bidderMainLocation } =
      await this.prismaService.$transaction(
        async (tx) => {
          //    // Lock the auction row
          //    await tx.$executeRaw`
          //    SELECT * FROM "Auction"
          //    WHERE id = ${auctionId}
          //    FOR UPDATE
          //  `;

          await tx.$executeRawUnsafe(`
        SELECT pg_advisory_xact_lock(${auctionId})
      `);

          const auction = await this.checkAuctionExistanceAndReturn(auctionId);

          this.auctionStatusValidator.isActionValidForAuction(
            auction,
            AuctionActions.BIDDER_DEPOSIT,
          );

          // Check authorization
          if (auction.userId === userId)
            throw new MethodNotAllowedResponse({
              ar: 'هذا الاعلان من احد إعلاناتك',
              en: 'This auction is one of your created auctions',
            });

          // Validate CurrentBidAmount with bidAmount if there is no bidders else validate with latest bidAmount
          let latestBidAmount: Decimal;
          const isAuctionHasBidders = await this._isAuctionHasBidders(
            auctionId,
          );
          if (isAuctionHasBidders) {
            latestBidAmount = await this._findLatestBidForAuction(auctionId);
            // Convert both to Decimal or both to number for proper comparison
            const currentBid = new Prisma.Decimal(latestBidAmount.toString());
            const newBid = new Prisma.Decimal(bidAmount.toString());
            console.log('currentBid : ', currentBid);
            console.log('newBid : ', newBid);
            if (currentBid.gte(newBid))
              throw new MethodNotAllowedResponse({
                ar: 'قم برفع السعر',
                en: 'Bid Amount Must Be Greater Than Current Amount',
              });
          } else {
            latestBidAmount = auction.startBidAmount;
            console.log('latestBidAmount : ', latestBidAmount);
            console.log('bidAmount : ', bidAmount);
            console.log(
              'latestBidAmount >= new Prisma.Decimal(bidAmount) : ',
              latestBidAmount >= new Prisma.Decimal(bidAmount),
            );
            // Convert both to Decimal or both to number for proper comparison
            const currentBid = new Prisma.Decimal(latestBidAmount.toString());
            const newBid = new Prisma.Decimal(bidAmount.toString());
            if (currentBid.gte(newBid))
              throw new MethodNotAllowedResponse({
                ar: 'قم برفع السعر',
                en: 'Bid Amount Must Be Greater Than Current Amount',
              });
          }

          const auctionCategory = await this.auctionsHelper._getAuctionCategory(
            auctionId,
          );

          const user = await this.prismaService.user.findUnique({
            where: { id: userId },
            include: {
              locations: { include: { country: true } },
            },
          });

          const bidderMainLocation = user.locations.find((location) => {
            if (location.isMain) return location;
          });

          if (!bidderMainLocation)
            throw new MethodNotAllowedResponse({
              ar: 'ادخل عنوان رئيسي',
              en: 'Set one location as main',
            });

          console.log('payDepositByBidder test 2');
          //calculate the seller security deposite
          const startBidAmount = auction.startBidAmount;
          let amount = Number(auctionCategory.bidderDepositFixedAmount);
          const categoryName = auctionCategory?.nameEn;

          //checking whether the auction is luxuary or not
          if (
            auctionCategory.luxuaryAmount &&
            Number(startBidAmount) > Number(auctionCategory.luxuaryAmount)
          ) {
            let total: number;
            //calculating the security deposite
            total = Number(
              (Number(startBidAmount) *
                Number(auctionCategory.percentageOfLuxuarySD_forBidder)) /
                100,
            );

            if (categoryName === 'Cars' || categoryName === 'Properties') {
              const latestBidAmount = auction?.bids?.reverse()[0]?.amount;
              total = Number(
                ((latestBidAmount
                  ? Number(latestBidAmount)
                  : Number(startBidAmount)) *
                  Number(auctionCategory?.percentageOfLuxuarySD_forBidder)) /
                  100,
              );
            }
            //checking the total is less than minimum security deposite
            if (
              auctionCategory.minimumLuxuarySD_forBidder &&
              total < Number(auctionCategory.minimumLuxuarySD_forBidder)
            ) {
              amount = Number(auctionCategory.minimumLuxuarySD_forBidder);
            } else {
              amount = total;
            }
          }

          return {
            user,
            auction,
            amount,
            bidderMainLocation,
          };
        },
        {
          timeout: 15000, // 15 seconds timeout instead of 5 seconds
        },
      );

    console.log('payDepositByBidder test 1', bidAmount);

    if (!isWalletPayment) {
      return await this.paymentService.payDepositByBidder(
        user,
        auctionId,
        bidderMainLocation.country.currency,
        amount,
        bidAmount,
      );
    } else {
      return await this.paymentService.walletPayDepositByBidder(
        user,
        auctionId,
        // bidderMainLocation.country.currency,
        // Number(auctionCategory.bidderDepositFixedAmount),
        // amount_forWalletPay,
        amount,
        bidAmount,
      );
    }
  }

  // locking auction to prevent multiple bid at same time
  async lockAuction(auctionId: number, userId: string, bidAmount: number) {
    console.log('lock auction');
    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
    });

    if (!auction) throw new NotFoundException('Auction not found');

    if (auction.isLocked) {
      throw new ConflictException('Auction is currently locked for bidding');
    }
    const bids = await this.prismaService.bids.findMany({
      where: {
        auctionId: auction.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    console.log(bids.length);
    console.log(auction.acceptedAmount, bidAmount);
    if (bids.length) {
      if (bids[0].amount && Number(bidAmount) <= Number(bids[0].amount)) {
        console.log('Bid must be higher than current price 1');
        throw new MethodNotAllowedResponse({
          ar: 'قم برفع السعر',
          en: 'Bid Amount Must Be Greater Than Current Amount',
        });
      }
    } else if (
      auction.startBidAmount &&
      Number(bidAmount) <= Number(auction.startBidAmount)
    ) {
      console.log('Bid must be higher than current price 2');
      throw new MethodNotAllowedResponse({
        ar: 'قم برفع السعر',
        en: 'Bid Amount Must Be Greater Than Current Amount',
      });
    }

    await this.prismaService.auction.update({
      where: { id: auctionId },
      data: {
        isLocked: true,
        lockedByUserId: Number(userId),
        lockedAt: new Date(),
      },
    });

    return { success: true };
  }

  async submitBidForAuction(
    userId: number,
    auctionId: number,
    bidAmount: number,
  ) {
    try {
      const bidCreated = await this.prismaService.$transaction(
        async (prisma) => {
          try {
            await prisma.$executeRawUnsafe(`
        SELECT pg_advisory_xact_lock(${auctionId})
      `);

            const auction = await prisma.auction.findUnique({
              where: { id: auctionId },
              // include:{bids: true,product:true}
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
            });

            if (!auction)
              throw new NotFoundResponse({
                ar: 'لا يوجد هذا الاعلان',
                en: 'Auction Not Found',
              });

            this.auctionStatusValidator.isActionValidForAuction(
              auction,
              AuctionActions.SUBMIT_BID,
            );

            // Check authorization
            if (auction.userId === userId)
              throw new MethodNotAllowedResponse({
                ar: 'هذا الاعلان من احد إعلاناتك',
                en: 'This auction is one of your created auctions',
              });
            let latestBidAmount: Decimal;
            const maxBid = await prisma.bids.findFirst({
              where: { auctionId },
              orderBy: { amount: 'desc' },
            });
            if (maxBid) {
              latestBidAmount = maxBid?.amount;
              // Convert both to Decimal or both to number for proper comparison
              const currentBid = new Prisma.Decimal(latestBidAmount.toString());
              const newBid = new Prisma.Decimal(bidAmount.toString());
              if (currentBid.gte(newBid)) {
                throw new MethodNotAllowedResponse({
                  ar: 'قم برفع السعر',
                  en: 'Bid Amount Must Be Greater Than Current Amount',
                });
              }
            } else {
              latestBidAmount = auction.startBidAmount;
              const currentBid = new Prisma.Decimal(latestBidAmount.toString());
              const newBid = new Prisma.Decimal(bidAmount.toString());
              if (currentBid.gte(newBid))
                throw new MethodNotAllowedResponse({
                  ar: 'قم برفع السعر',
                  en: 'Bid Amount Must Be Greater Than Current Amount',
                });
            }
            // Create new bid
            const bidCreated = await prisma.bids.create({
              data: { userId, auctionId, amount: bidAmount },
              include: {
                auction: {
                  include: {
                    Payment: { where: { type: 'SELLER_DEPOSIT' } },
                    user: true,
                    bids: {
                      include: { user: true },
                      orderBy: { amount: 'desc' },
                    },
                    product: { include: { images: true, category: true } },
                  },
                },
              },
            });

            // Check if user already joined the auction
            const existing = await prisma.joinedAuction.findFirst({
              where: {
                userId: userId,
                auctionId: auctionId,
              },
            });

            if (!existing) {
              const createdNewJoinedAuction = await prisma.joinedAuction.create(
                {
                  data: {
                    userId: userId,
                    auctionId: auctionId,
                  },
                },
              );
              console.log('createdNewJoinedAuction', createdNewJoinedAuction);
            } else {
              console.log('already joined', existing);
            }

            return bidCreated;
          } catch (error) {
            console.log('submit bid error at $transaction', error);
            if (
              error?.response?.message?.en ===
              'Bid Amount Must Be Greater Than Current Amount'
            ) {
              throw new MethodNotAllowedResponse({
                ar: 'تم تجاوز عرضك! يُرجى زيادة مبلغ المزايدة.',
                en: 'You’ve been outbid! Please increase your bid amount.',
              });
            } else {
              throw new MethodNotAllowedResponse({
                ar: 'لم يتم تقديم العرض! يُرجى إعادة المحاولة.',
                en: 'Bid submission failed! Please try again.',
              });
            }
          }
        },
        { timeout: 20000 },
      );

      if (bidCreated) {
        const sellerPayment = bidCreated.auction.Payment;
        if (
          bidCreated.auction.product.categoryId === 4 &&
          Number(bidCreated.auction.startBidAmount) < 5000 &&
          bidAmount >= 5000 &&
          sellerPayment.length === 0
        ) {
          this.paymentService.notieceTheSellerToCompleteThePayment(
            bidCreated.auction.user,
            bidCreated.auction,
          );
        }
      } else {
        throw new Error(
          'There is proble while submiting the bid, please try again later',
        );
      }
      try {
        // Get totalBids after my bid
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

        // emit to all biders using socket instance
        this.bidsWebSocketGateway.userSubmitBidEventHandler(
          auctionId,
          new Prisma.Decimal(bidAmount),
          joinedBidders?.length,
        );
        this.auctionWebsocketGateway.increaseBid(bidCreated.auction);

        const imageLink = bidCreated.auction.product.images[0]?.imageLink;
        const productTitle = bidCreated.auction.product.title;

        // Notify seller
        const notificationDataToSeller = {
          status: 'ON_BIDDING',
          userType: 'FOR_SELLER',
          usersId: bidCreated.auction.userId,
          message: `New bid of AED ${bidAmount} placed on your auction ${productTitle}`,
          imageLink,
          productTitle,
          auctionId,
        };
        await this.prismaService.notification.create({
          data: {
            userId: notificationDataToSeller.usersId,
            message: notificationDataToSeller.message,
            imageLink: notificationDataToSeller.imageLink,
            productTitle,
            auctionId,
          },
        });
        this.notificationService.sendNotificationToSpecificUsers(
          notificationDataToSeller,
        );
        // Notify current bidder
        const notificationDataToBidder = {
          status: 'ON_BIDDING',
          userType: 'CURRENT_BIDDER',
          usersId: userId,
          message: `Your bid of AED ${bidAmount} was placed successfully on ${productTitle}`,
          imageLink,
          productTitle,
          auctionId,
        };

        await this.prismaService.notification.create({
          data: {
            userId: notificationDataToBidder.usersId,
            message: notificationDataToBidder.message,
            imageLink: notificationDataToBidder.imageLink,
            productTitle,
            auctionId,
          },
        });

        this.notificationService.sendNotificationToSpecificUsers(
          notificationDataToBidder,
        );

        // Get and notify other bidders
        const currentUserId = userId;
        const joinedAuctionUsers =
          await this.notificationService.getAllJoinedAuctionUsers(
            auctionId,
            currentUserId,
          );

        if (joinedAuctionUsers.length > 0) {
          const otherBidderMessage = `New bid of AED ${bidAmount} placed on ${productTitle}`;
          const isBidders = true;
          await this.notificationService.sendNotifications(
            joinedAuctionUsers,
            otherBidderMessage,
            imageLink,
            productTitle,
            auctionId,
            isBidders,
          );
        }

        const auctionEndDate = new Date(bidCreated.auction.expiryDate);
        const formattedEndDate = auctionEndDate.toISOString().split('T')[0];
        const formattedEndTime = auctionEndDate.toTimeString().slice(0, 5);
        const emailBodyToSeller = {
          subject: '🎉 Exciting News: Your Auction Just Got Its First Bid!',
          title: 'Your Auction is Officially in Motion!',
          Product_Name: bidCreated.auction.product.title,
          img: bidCreated.auction.product.images[0].imageLink,
          userName: `${bidCreated.auction.user.userName}`,
          message1: ` 
                <p>Congratulations! Your auction ${
                  bidCreated.auction.product.title
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
          Button_URL: `https://www.alletre.com/alletre/home/${bidCreated.auction.id}/details`,
        };

        const emailBodyToSecondLastBidder = {
          subject: 'You have been outbid! 🔥 Don’t Let This Slip Away!',
          title: 'Your Bid Just Got Beaten!',
          Product_Name: bidCreated.auction.product.title,
          img: bidCreated.auction.product.images[0].imageLink,
          userName: `${joinedBidders[1]?.user.userName}`,
          message1: ` 
                <p>Exciting things are happening on ${
                  bidCreated.auction.product.title
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
                     bidCreated.auction.product.title
                   } . The clock is ticking, and every second counts!</p>       
                   <p><b>Reclaim Your Spot as the Top Bidder Now!</b></p>
                `,
          message2: ` 
                             <p>Stay ahead of the competition and secure your win!</p>
                
           
                             <p style="margin-bottom: 0;">Good luck,</p>
                            <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                            <p>P.S. Stay tuned for updates—we’ll let you know if there’s more action on this auction.</p>`,
          Button_text: 'Place a Higher Bid',
          Button_URL: `https://www.alletre.com/alletre/home/${bidCreated.auction.id}/details`,
        };
        if (joinedBidders.length === 1) {
          this.emailService.sendEmail(
            joinedBidders[0].auction.user.email,
            'token',
            EmailsType.OTHER,
            emailBodyToSeller,
          );
          const whatsappBodyToLostBidders = {
            1: `${bidCreated.auction.user.userName}`,
            2: `Congratulations! Your auction ${bidCreated.auction.product.title} has received its first bid! This is an exciting milestone, and the competition has officially begun.`,
            3: `*First Bid Amount:* ${
              joinedBidders[joinedBidders.length - 1].amount
            }`,
            4: `*Bidder Username:* ${
              joinedBidders[joinedBidders.length - 1].user.userName
            }`,
            5: `*Auction Ends:* ${formattedEndDate} & ${formattedEndTime}`,
            6: `This is just the beginning—more bidders could be on their way!`,
            7: `*What can you do now?* -> Share your auction to attract even more bids. Keep an eye on the activity to stay informed about the progress.`,
            8: bidCreated.auction.product.images[0].imageLink,
            9: `https://www.alletre.com/alletre/home/${bidCreated.auction.id}/details`,
          };
          if (bidCreated.auction.user.phone) {
            await this.whatsappService.sendOtherUtilityMessages(
              whatsappBodyToLostBidders,
              bidCreated.auction.user.phone,
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
            2: `Exciting things are happening on ${bidCreated.auction.product.title}! Unfortunately, someone has just placed a higher bid, and you're no longer in the lead.`,
            3: `*Here’s the current standing:*`,
            4: `*Current Highest Bid:* ${
              joinedBidders.length > 1 ? joinedBidders[0].amount : 'No bids yet'
            }`,
            5: `*Your Last Bid:* ${joinedBidders[1]?.amount}`,
            6: `Don’t miss your chance to claim this one-of-a-kind ${bidCreated.auction.product.title} . The clock is ticking, and every second counts!`,
            7: `*Reclaim Your Spot as the Top Bidder Now!*`,
            8: bidCreated.auction.product.images[0].imageLink,
            9: `https://www.alletre.com/alletre/home/${bidCreated.auction.id}/details`,
          };
          if (joinedBidders[1].user.phone) {
            await this.whatsappService.sendOtherUtilityMessages(
              whatsappBodyTosecondLastBidders,
              joinedBidders[1].user.phone,
              'alletre_common_utility_templet',
            );
          }
        }
      } catch (error) {
        console.error('Error sending bid notifications:', error);
        // throw new MethodNotAllowedResponse({
        //   ar: 'خطأ أثناء إخطار الآخرين',
        //   en: 'Error while notifying others.',
        // });
      }
    } catch (error) {
      console.log('Error while submit bid for auction', error);
      throw new MethodNotAllowedResponse({
        ar:
          error.response.ar ||
          error.response.message.ar ||
          'فشل في إرسال العرض، يرجى المحاولة مرة أخرى.',
        en:
          error.response.en ||
          error.response.message.en ||
          'Failed to submit bid, please try again.',
      });
    }
  }

  async getBidderJoindAuctions(
    userId: number,
    joinAuctionsDTO: GetJoinAuctionsDTO,
  ) {
    const { page = 1, perPage = 10, status } = joinAuctionsDTO;

    const { limit, skip } = this.paginationService.getSkipAndLimit(
      Number(page),
      Number(perPage),
    );

    const auctions = await this.prismaService.joinedAuction.findMany({
      where: {
        userId,
        ...(status == JoinedAuctionStatus.PAYMENT_EXPIRED
          ? {
              status: {
                in: [
                  JoinedAuctionStatus.LOST,
                  JoinedAuctionStatus.PAYMENT_EXPIRED,
                ],
              },
            }
          : { status }),
      },
      include: {
        auction: {
          include: {
            location: { include: { city: true, country: true } },
            Payment: {
              where: {
                status: 'BANK_STATEMENT_UPLOADED',
              },
            },
            product: {
              include: {
                category: true,
                // brand: true,
                subCategory: true,
                city: true,
                country: true,
                images: true,
              },
            },
            _count: { select: { bids: true } },
            bids: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
      take: limit,
      skip: skip,
    });

    const count = await this.prismaService.joinedAuction.count({
      where: {
        userId,
        ...(status == JoinedAuctionStatus.PAYMENT_EXPIRED
          ? {
              status: {
                in: [
                  JoinedAuctionStatus.LOST,
                  JoinedAuctionStatus.PAYMENT_EXPIRED,
                ],
              },
            }
          : { status }),
      },
    });

    return {
      pagination: this.paginationService.getPagination(count, page, perPage),
      auctions,
    };
  }

  async findJoinedAuctionsAnalytics(userId: number) {
    const count = await this.prismaService.joinedAuction.count({
      where: { userId },
    });
    const auctionsGrouping = await this.prismaService.joinedAuction.groupBy({
      by: ['status'],
      where: { userId },
      _count: { status: true },
    });

    return {
      count,
      auctionsGrouping: auctionsGrouping?.length
        ? auctionsGrouping.map((item) => {
            return {
              count: item['_count']?.status,
              status: item.status,
            };
          })
        : [],
    };
  }

  async notifyAuctionWinner(userId: number) {
    const auctionWinner = await this.prismaService.user.findFirst({
      where: { id: userId },
    });

    this.bidsWebSocketGateway.notifyWinner(
      auctionWinner.socketId,
      auctionWinner.id,
    );
  }

  async payAuctionByBidder(
    userId: number,
    auctionId: number,
    isWalletPayment?: boolean,
  ) {
    const auction = await this.checkAuctionExistanceAndReturn(auctionId);

    this.auctionStatusValidator.isActionValidForAuction(
      auction,
      AuctionActions.BIIDER_PURCHASE,
    );

    // Check authorization
    if (auction.userId === userId)
      throw new MethodNotAllowedResponse({
        ar: 'هذا الاعلان من احد إعلاناتك',
        en: 'This auction is one of your created auctions',
      });

    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      include: {
        locations: { include: { country: true } },
      },
    });

    const userMainLocation = user.locations.find((location) => {
      if (location.isMain) return location;
    });

    if (!userMainLocation)
      throw new MethodNotAllowedResponse({
        ar: 'ادخل عنوان رئيسي',
        en: 'Set one location as main',
      });

    // Check winner of auction
    const auctionWinner = await this.prismaService.joinedAuction.findFirst({
      where: {
        auctionId: auctionId,
        status: JoinedAuctionStatus.PENDING_PAYMENT,
      },
    });
    if (auctionWinner.userId != userId)
      throw new MethodNotAllowedResponse({
        ar: 'لايمكنك شراء المزاد',
        en: 'You Can not Purchase the product',
      });

    // Get purchase amount of auction
    const latestBidAmount = await this._findLatestBidForAuction(
      auctionWinner.auctionId,
    );
    const winnerSecurityDepositData =
      await this.prismaService.payment.findFirst({
        where: {
          userId,
          auctionId,
          status: { in: [PaymentStatus.SUCCESS, PaymentStatus.HOLD] },
          type: PaymentType.BIDDER_DEPOSIT,
        },
      });
    const baseValue = Number(latestBidAmount);
    const { payingAmountOfWallet, payingAmountOfStripe } =
      this.paymentService.calculateWinnerPaymentAmount(
        Number(latestBidAmount),
        winnerSecurityDepositData
          ? Number(winnerSecurityDepositData?.amount)
          : 0,
      );
    console.log('***122', {
      payingAmountOfWallet,
      payingAmountOfStripe,
      baseValue,
      winnerSecurityDepositData,
    });
    if (!isWalletPayment) {
      return await this.paymentService.payAuctionByBidder(
        user,
        auctionId,
        userMainLocation.country.currency,
        Number(baseValue),
        Number(payingAmountOfStripe),
      );
    } else {
      return await this.paymentService.payAuctionByBidderWithWallet(
        user,
        auctionId,
        // userMainLocation.country.currency,
        Number(payingAmountOfWallet),
      );
    }
  }

  async buyNowAuction(
    userId: number,
    auctionId: number,
    isWalletPayment?: boolean,
  ) {
    const auction = await this.checkAuctionExistanceAndReturn(auctionId);

    this.auctionStatusValidator.isActionValidForAuction(
      auction,
      AuctionActions.BUY_NOW,
    );

    // Check authorization
    if (auction.userId === userId)
      throw new MethodNotAllowedResponse({
        ar: 'هذا الاعلان من احد إعلاناتك',
        en: 'This auction is one of your created auctions',
      });

    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      include: {
        locations: { include: { country: true } },
      },
    });

    const userMainLocation = user.locations.find((location) => {
      if (location.isMain) return location;
    });

    if (!userMainLocation)
      throw new MethodNotAllowedResponse({
        ar: 'ادخل عنوان رئيسي',
        en: 'Set one location as main',
      });

    if (!auction.isBuyNowAllowed)
      throw new MethodNotAllowedResponse({
        ar: 'الاعلان غير قابل للشراء',
        en: 'Buy Now Is Now Allowed',
      });

    //TODO: CREATE PAYMENT TRANSACTION FOR BUY_NOW FLOW
    const baseValue = Number(auction.acceptedAmount);
    const { payingAmountOfWallet, payingAmountOfStripe } =
      this.paymentService.calculateWinnerPaymentAmount(baseValue);
    // const auctionFee = (baseValue * 0.5) / 100;
    // const stripeFee = (baseValue * 3) / 100 + 1; // stripe takes 3% of the base value and additionally 1 dirham
    // const payingAmountWithFees = baseValue + auctionFee;
    // const payingAmountWithStripeAndAlletreFees =
    //   payingAmountWithFees + stripeFee;
    if (!isWalletPayment) {
      return await this.paymentService.createBuyNowPaymentTransaction(
        user,
        auctionId,
        userMainLocation.country.currency,
        Number(baseValue),
        Number(payingAmountOfStripe),
      );
    } else {
      // need to crete the createBuyNowPaymentTransaction for wallet
      return await this.paymentService.createBuyNowPaymentTransactionWallet(
        user,
        auctionId,
        Number(baseValue),
        Number(payingAmountOfWallet),
      );
    }
  }

  async getAllPurchasedAuctions(userId: number, paginationDTO: PaginationDTO) {
    const { page = 1, perPage = 4 } = paginationDTO;

    const { limit, skip } = this.paginationService.getSkipAndLimit(
      Number(page),
      Number(perPage),
    );

    const auctions = await this.prismaService.auction.findMany({
      where: {
        Payment: {
          some: {
            userId,
            status: PaymentStatus.SUCCESS,
            type: PaymentType.BUY_NOW_PURCHASE,
          },
        },
      },
      select: {
        id: true,
        userId: true,
        acceptedAmount: true,
        productId: true,
        status: true,
        type: true,
        createdAt: true,
        durationInDays: true,
        durationInHours: true,
        durationUnit: true,
        expiryDate: true,
        endDate: true,
        isBuyNowAllowed: true,
        startBidAmount: true,
        startDate: true,
        locationId: true,
        product: {
          select: {
            id: true,
            title: true,
            description: true,
            categoryId: true,
            subCategoryId: true,
            brandId: true,
            images: true,
            usageStatus: true,
          },
        },
        Payment: { select: { createdAt: true, type: true } },
        _count: { select: { bids: true } },
        bids: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      skip: skip,
      take: limit,
    });

    const count = await this.prismaService.auction.count({
      where: {
        Payment: {
          some: {
            userId,
            status: PaymentStatus.SUCCESS,
            type: PaymentType.BUY_NOW_PURCHASE,
          },
        },
      },
    });

    const convertedAuctions = auctions.map((auction) => {
      const filteredPayments = auction.Payment.filter(
        (payment) => payment.type === PaymentType.BUY_NOW_PURCHASE,
      );
      return { ...auction, Payment: filteredPayments };
    });

    return {
      pagination: this.paginationService.getPagination(count, page, perPage),
      auctions: convertedAuctions,
    };
  }
  async confirmDelivery(winnerId: number, auctionId: number) {
    try {
      console.log('confirm delevery has called : auctionId :', auctionId);
      const auction = await this.checkAuctionExistanceAndReturn(auctionId);

      // Check authorization
      if (auction?.userId === winnerId)
        throw new MethodNotAllowedResponse({
          ar: 'هذا الاعلان من احد إعلاناتك',
          en: 'This auction is one of your created auctions',
        });

      // Check winner of auction
      const auctionWinner = await this.prismaService.joinedAuction.findFirst({
        where: {
          auctionId: auctionId,
          status: JoinedAuctionStatus.WAITING_FOR_DELIVERY,
        },
        include: {
          auction: true,
        },
      });

      if (auctionWinner.auction.deliveryRequestsStatus === 'DELIVERY_SUCCESS') {
        throw new MethodNotAllowedResponse({
          ar: 'تم تسليم المنتج بنجاح. إذا لم يكن الأمر كذلك، يرجى التواصل مع فريق دعم Alletre.',
          en: 'The item has already been delivered. If not, please contact the Alletre support team.',
        });
      }
      console.log(
        'auctionWinner data from joined Auction :===>',
        auctionWinner,
      );
      if (auctionWinner.userId != winnerId)
        throw new MethodNotAllowedResponse({
          ar: 'لايمكنك تكملة العملية',
          en: 'You Can not Complete Operation',
        });

      const sellerPaymentData = await this.prismaService.payment.findFirst({
        where: {
          userId: auction.userId,
          auctionId: Number(auctionId),
        },
        include: {
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
          user: true,
        },
      });
      console.log('sellerPaymentData :', sellerPaymentData);
      let isSellerDepositSendBack: any = false;
      if (sellerPaymentData) {
        //checking if seller deposit is through wallet or not
        // if (!sellerPaymentData.isWalletPayment) {
        //   //if not through wallet (which means through stripe) then cancell the payment intent
        //   isSellerDepositSendBack =
        //     await this.stripeService.cancelDepositPaymentIntent(
        //       sellerPaymentData.paymentIntentId,
        //     );
        // } else
        {
          const [lastWalletTransactionBalance, lastWalletTransactionAlletre] =
            await Promise.all([
              this.walletService.findLastTransaction(auction.userId),
              this.walletService.findLastTransactionOfAlletre(),
            ]);
          //if  through wallet then return the deposit to the seller wallet
          const sellerReturnSecurityDepositWalletData = {
            status: WalletStatus.DEPOSIT,
            transactionType: WalletTransactionType.By_AUCTION,
            description: `Return of security deposit after winner confirmed the delivery.`,
            amount: Number(sellerPaymentData.amount),
            auctionId: Number(auctionId),
            balance: lastWalletTransactionBalance
              ? Number(lastWalletTransactionBalance) +
                Number(sellerPaymentData.amount)
              : Number(sellerPaymentData.amount),
          };

          const walletDataToAlletreWhenRetrunSecurityDepositToSeller = {
            status: WalletStatus.WITHDRAWAL,
            transactionType: WalletTransactionType.By_AUCTION,
            description:
              "Return of seller's security deposit after winner confirmed the delivery.",
            amount: Number(sellerPaymentData.amount),
            auctionId: Number(auctionId),
            balance:
              Number(lastWalletTransactionAlletre) -
              Number(sellerPaymentData.amount),
          };

          const isAlreadySendBack = await this.prismaService.wallet.findFirst({
            where: {
              userId: auction.userId,
              auctionId: Number(auctionId),
              status: WalletStatus.DEPOSIT,
              amount: Number(sellerPaymentData.amount),
              description:
                'Return of security deposit after winner confirmed the delivery.',
            },
          });
          //  const sellerWalletCreationData = await this.walletService.create(auction.userId, sellerReturnSeucurityDepositWalletData);
          //  const alletreWalletCreationData = await this.walletService.addToAlletreWallet(auction.userId,walletDataToAlletreWhenRetrunSecurityDepositToSeller)
          if (!isAlreadySendBack) {
            const [sellerWalletCreationData, alletreWalletCreationData] =
              await Promise.all([
                this.walletService.create(
                  auction.userId,
                  sellerReturnSecurityDepositWalletData,
                ),
                this.walletService.addToAlletreWallet(
                  auction.userId,
                  walletDataToAlletreWhenRetrunSecurityDepositToSeller,
                ),
              ]);
            //  if(sellerWalletCreationData && alletreWalletCreationData) isSellerDepositSendBack = true ; else isSellerDepositSendBack = false
            isSellerDepositSendBack =
              sellerWalletCreationData && alletreWalletCreationData;
          }
        }
      } else {
        // in this case the seller has not paid the security deposit,
        // so here we consider as seller security deposit has send back.
        isSellerDepositSendBack = true;
      }

      if (isSellerDepositSendBack) {
        const auctionWinnerBidAmount = await this._findLatestBidForAuction(
          auctionWinner.auctionId,
        );

        const feesAmountOfAlletre =
          (Number(auctionWinnerBidAmount) * 0.5) / 100;
        //finding winner lastpaid amount
        const winnerFullPaymentData =
          await this.prismaService.payment.findFirst({
            where: {
              userId: auctionWinner.userId,
              auctionId: auctionWinner.auctionId,
              status: 'SUCCESS',
              type: {
                in: ['AUCTION_PURCHASE', 'BUY_NOW_PURCHASE'],
              },
            },
          });
        let companyProfit: number;
        console.log('winnerFullPaymentData', winnerFullPaymentData);
        if (!winnerFullPaymentData?.isWalletPayment) {
          //fetching winner paid amount in case of stripe payment
          const { amountToAlletteWalletInTheStripeWEBHOOK } =
            this.paymentService.calculateWinnerPaymentAmount(
              Number(auctionWinnerBidAmount),
            );
          companyProfit =
            Number(amountToAlletteWalletInTheStripeWEBHOOK) -
            Number(auctionWinnerBidAmount) +
            feesAmountOfAlletre;
        } else {
          companyProfit = feesAmountOfAlletre * 2;
        }
        const amountToSellerWallet =
          Number(auctionWinnerBidAmount) - feesAmountOfAlletre;

        // const lastWalletTransactionBalance = await this.walletService.findLastTransaction(auction.userId)
        // const lastWalletTransactionAlletre = await this.walletService.findLastTransactionOfAlletre()

        const [
          lastWalletTransactionBalanceOfSeller,
          lastWalletTransactionAlletre,
        ] = await Promise.all([
          this.walletService.findLastTransaction(auction.userId),
          this.walletService.findLastTransactionOfAlletre(),
        ]);
        const walletData = {
          status: WalletStatus.DEPOSIT,
          transactionType: WalletTransactionType.By_AUCTION,
          description: 'Full payment for auction.',
          amount: Number(amountToSellerWallet),
          auctionId: Number(auctionId),
          balance: lastWalletTransactionBalanceOfSeller
            ? Number(lastWalletTransactionBalanceOfSeller) +
              Number(amountToSellerWallet)
            : Number(amountToSellerWallet),
        };

        const walletDataToAlletre = {
          status: WalletStatus.WITHDRAWAL,
          transactionType: WalletTransactionType.By_AUCTION,
          description: 'Send full auction payment after deducting the fees.',
          amount: Number(amountToSellerWallet),
          auctionId: Number(auctionId),
          balance:
            Number(lastWalletTransactionAlletre) - Number(amountToSellerWallet),
        };

        const confirmDeliveryResult = await this.prismaService.$transaction(
          async (prisma) => {
            const confirmDeliveryResult = await prisma.joinedAuction.update({
              where: { id: auctionWinner.id },
              data: {
                status: JoinedAuctionStatus.COMPLETED,
                auction: {
                  update: {
                    deliveryRequestsStatus: 'DELIVERY_SUCCESS',
                  },
                },
              },
              include: {
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
                user: true,
              },
            });

            await prisma.profit.create({
              data: {
                amount: companyProfit,
                description: 'Profit after confirm delivery by bidder',
                auctionId: confirmDeliveryResult.auctionId,
                userId: auctionWinner.userId,
              },
            });

            return confirmDeliveryResult;
          },
        );
        if (confirmDeliveryResult) {
          console.log(
            'sending email to seller and bidder after delivery confirmation',
          );

          const isAlreadySendFullAmount =
            await this.prismaService.wallet.findFirst({
              where: {
                userId: confirmDeliveryResult.auction.userId,
                auctionId: Number(auctionId),
                status: WalletStatus.DEPOSIT,
                amount: walletData.amount,
              },
            });
          if (!isAlreadySendFullAmount) {
            //full amount to seller wallet after duducting the fees
            const walletCreationData = await this.walletService.create(
              confirmDeliveryResult.auction.userId,
              walletData,
            );

            //sending the full amount from alle tre wallet to seller wallet
            //(due to  buyer pay the full amount, it has already in the alletre wallet )
            const alletreWalletCreationData =
              await this.walletService.addToAlletreWallet(
                confirmDeliveryResult.auction.userId,
                walletDataToAlletre,
              );

            if (!walletCreationData && !alletreWalletCreationData) {
              throw new InternalServerErrorException(
                'Failed to process wallet payment',
              );
            }
          }
          //sending email to seller and bidder after delivery confirmation
          const emailBodyToSeller = {
            subject:
              '🎉 Success! Your Item Has Been Delivered & Payment Received',
            title:
              'Your Auction Sale is Complete – Payment Credited to Your Wallet!',
            Product_Name: confirmDeliveryResult.auction.product.title,
            img: confirmDeliveryResult.auction.product.images[0].imageLink,
            userName: `${confirmDeliveryResult.auction.user.userName}`,
            message1: ` 
            <p>Congratulations! Your item ${confirmDeliveryResult.auction.product.title} has been successfully received by the buyer, and the selling amount has been credited to your wallet.</p>
            <p>Auction Details:</p>
            <ul>
              <li>Title: ${confirmDeliveryResult.auction.product.title} </li>
              <li>Sold For: ${confirmDeliveryResult.auction.bids[0].amount}</li>
              <li>Buyer: ${confirmDeliveryResult.auction.bids[0].user.userName}</li>
              <li>Payment Status: Payment credited to your wallet</li>
            </ul>
            <h3>What’s Next?</h3>
            <p><b>View Your Balance</b>: You can check your wallet and withdraw the funds whenever you’re ready.</p>
            <p><b>Ready to Try Again?</b></p>
            <p>We’d love to help you relist your item and attract the right bidders!</p>`,
            message2: `<p>We hope you enjoyed the process and that your buyer is satisfied with their purchase. We’re here to help you with future sales—don’t hesitate to list more items with us!</p>
                      <p>Thank you for choosing <b>Alletre</b>. We look forward to supporting you in your future auctions.</p>
            <p style="margin-bottom: 0;">Best regards,</p>
                      <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                        <p>P.S. Need help or have any questions? Our support team is just a click away.</p>`,
            Button_text: 'View Wallet ',
            Button_URL: ' https://www.alletre.com/alletre/profile/wallet',
          };
          //email body to winner when delivery completed
          const emailBodyToWinner = {
            subject: '📦 Delivery Confirmed! Enjoy Your Auction Win!',
            title: 'Your Auction Item Has Been Successfully Delivered!',
            Product_Name: confirmDeliveryResult.auction.product.title,
            img: confirmDeliveryResult.auction.product.images[0].imageLink,
            userName: `${confirmDeliveryResult.auction.bids[0].user.userName}`,
            message1: `
                <p>Hi ${confirmDeliveryResult.auction.bids[0].user.userName},</p>
                <p>We’re excited to let you know that your auction win, <b>${confirmDeliveryResult.auction.product.title}</b>, has been successfully delivered!</p>
                <p>Auction Details:</p>
                <ul>
                  <li>Title: ${confirmDeliveryResult.auction.product.title}</li>
                  <li>Winning Bid: ${confirmDeliveryResult.auction.bids[0].amount}</li>
                  <li>Seller: ${confirmDeliveryResult.auction.user.userName}</li>
                  <li>Payment Status: Payment received successfully</li>
                </ul>
                <h3>What’s Next?</h3>
                <p><b>Enjoy Your New Item!</b>: We hope you love your new purchase and that it meets your expectations. Please take a moment to inspect the item and share any feedback.</p>
                <p><b>Leave a Review</b>: Help other buyers by sharing your experience.</p>
              `,
            message2: `
                <p>Thank you for being part of the <b>Alletre</b> community. We hope you continue to find incredible auction items with us!</p>
                <p style="margin-bottom: 0;">Best regards,</p>
                <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
                <p>P.S. Need help or have any questions? Our support team is just a click away.</p>
              `,
            Button_text: 'View Purchases',
            Button_URL: 'https://www.alletre.com/alletre/profile/purchased',
          };

          const auction = confirmDeliveryResult.auction;
          const notificationMessageToSeller = ` Hi, ${confirmDeliveryResult.auction.user.userName}, 
                   Thank you for choosing Alle Tre Auction. The winner of your Auction of ${confirmDeliveryResult.auction.product.title}
                   (Model:${confirmDeliveryResult.auction.product.model}) has been Confrimed the delivery. 
                   The money paid by the winner will be creadited to Alle Tre wallet and the security deposite will be send back to your account. 
                   From the wallet either you can withdraw the money to your bank account or you can keep it in the wallet and can continue the Auction. `;

          const notificationMessageToBidder = ` Thank you for choosing Alle Tre Auction. The delivery has been confirmed of Auction of ${confirmDeliveryResult.auction.product.title}
                   (Model:${confirmDeliveryResult.auction.product.model}). 
                    We would like to thank you and appreciate you for choosing Alle Tre.`;
          const notificationBodyToSeller = {
            status: 'ON_CONFIRM_DELIVERY',
            userType: 'FOR_SELLER',
            usersId: confirmDeliveryResult.auction.userId,
            message: notificationMessageToSeller,
            imageLink: auction.product.images[0].imageLink,
            productTitle: auction.product.title,
            auctionId: confirmDeliveryResult.auctionId,
          };
          const notificationBodyToBidder = {
            status: 'ON_CONFIRM_DELIVERY',
            userType: 'FOR_WINNER',
            usersId: confirmDeliveryResult.userId,
            message: notificationMessageToBidder,
            imageLink: auction.product.images[0].imageLink,
            productTitle: auction.product.title,
            auctionId: confirmDeliveryResult.auctionId,
          };
          const createSellerNotificationData =
            await this.prismaService.notification.create({
              data: {
                userId: confirmDeliveryResult.auction.userId,
                message: notificationMessageToSeller,
                imageLink: notificationBodyToSeller.imageLink,
                productTitle: notificationBodyToSeller.productTitle,
                auctionId: confirmDeliveryResult.auctionId,
              },
            });
          const createWinnerNotificationData =
            await this.prismaService.notification.create({
              data: {
                userId: confirmDeliveryResult.userId,
                message: notificationMessageToBidder,
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

          const whatsappBodyToSeller = {
            1: `${confirmDeliveryResult.auction.user.userName}`,
            2: `🎉 Your item *${confirmDeliveryResult.auction.product.title}* has been delivered, and the payment is now in your wallet.`,
            3: `*Sold For:* ${confirmDeliveryResult.auction.bids[0].amount}`,
            4: `*Buyer:* ${confirmDeliveryResult.auction.bids[0].user.userName}`,
            5: `You can now withdraw your earnings from your wallet anytime.`,
            6: `Relist your item or post something new — we’re here to support your next auction!`,
            7: `Thanks for using *Alletre*!`,
            8: `${confirmDeliveryResult.auction.product.images[0].imageLink}`,
            9: `https://www.alletre.com/alletre/profile/wallet`,
          };

          if (confirmDeliveryResult.auction.user.phone) {
            await this.whatsappService.sendOtherUtilityMessages(
              whatsappBodyToSeller,
              confirmDeliveryResult.auction.user.phone,
              'alletre_common_utility_templet',
            );
          }

          const whatsappBodyToWinner = {
            1: `${confirmDeliveryResult.auction.bids[0].user.userName}`,
            2: `📦 Your auction item *${confirmDeliveryResult.auction.product.title}* has been delivered successfully!`,
            3: `*Winning Bid:* ${confirmDeliveryResult.auction.bids[0].amount}`,
            4: `*Seller:* ${confirmDeliveryResult.auction.user.userName}`,
            5: `We hope you enjoy your purchase! Please check the item and let us know your thoughts.`,
            6: `Don't forget to leave a review to help other buyers!`,
            7: `Thanks for being part of *Alletre*!`,
            8: `${confirmDeliveryResult.auction.product.images[0].imageLink}`,
            9: `https://www.alletre.com/alletre/profile/purchased`,
          };

          if (confirmDeliveryResult.auction.bids[0].user.phone) {
            await this.whatsappService.sendOtherUtilityMessages(
              whatsappBodyToWinner,
              confirmDeliveryResult.auction.bids[0].user.phone,
              'alletre_common_utility_templet',
            );
          }

          await Promise.all([
            this.emailService.sendEmail(
              confirmDeliveryResult.auction.user.email,
              'token',
              EmailsType.OTHER,
              emailBodyToSeller,
            ),
            this.emailService.sendEmail(
              confirmDeliveryResult.user.email,
              'token',
              EmailsType.OTHER,
              emailBodyToWinner,
            ),
          ]);
        }

        return confirmDeliveryResult;
      } else {
        throw new MethodNotAllowedResponse({
          ar: 'حدث خطأ أثناء تأكيد التسليم',
          en: 'An error occurred during delivery confirmation',
        });
      }
    } catch (error) {
      // Handle the error appropriately
      // You can log the error, rethrow it, or return a custom response
      console.error('Error during confirmDelivery:', error);
      throw new MethodNotAllowedResponse({
        ar: 'حدث خطأ أثناء تأكيد التسليم',
        en: 'An error occurred during delivery confirmation',
      });
    }
  }

  async setDeliveryType(auctionId: number, deliveryType: DeliveryType) {
    try {
      return await this.prismaService.auction.update({
        where: { id: auctionId },
        data: { deliveryType },
      });
    } catch (error) {
      console.log('setDeliveryType error : ', error);
      throw new MethodNotAllowedResponse({
        ar: 'حدث خطأ أثناء تغيير نوع التسليم',
        en: 'An error occurred during delivery type change',
      });
    }
  }

  async IsSendItemForDelivery(
    accountId: number,
    auctionId: number,
    message: string,
  ) {
    try {
      console.log('IsSendItemForDelivery:', accountId, auctionId, message);
      const IsItemSend = await this.prismaService.auction.update({
        where: {
          id: auctionId,
          userId: accountId,
        },
        data: { isItemSendForDelivery: true },
        include: {
          bids: {
            include: { user: true },
            orderBy: { amount: 'desc' },
          },
          product: { include: { images: true } },
        },
      });
      const highestBidder = IsItemSend.bids[0].user;
      if (highestBidder) {
        const emailBodyToWinner = {
          subject: 'Auction product has been sent from the seller',
          title: 'Auction product has been sent from the seller',
          Product_Name: IsItemSend.product.title,
          img: IsItemSend.product.images[0].imageLink,
          message: ` Hi, ${highestBidder.userName}, 
                   Thank you for choosing Alle Tre Auction. The seller has been sent the product  of Auction of ${
                     IsItemSend.product.title
                   }
                   (Model:${
                     IsItemSend.product.model
                   }) for delivery. Once the item delivered, please confirm the delivery by cliking the "confirm delivery" button.
                   ${message ? `Seller Message : ${message}` : ' '} 
                    We would like to thank you and appreciate you for choosing Alle Tre. If you would like to participate another auction, Please click the button below. Thank you. `,
          Button_text: 'Click here ',
          Button_URL: process.env.FRONT_URL,
        };

        const auction = IsItemSend;
        const notificationMessageToBidder = ` Thank you for choosing Alle Tre Auction. The seller has been sent the product  of Auction of ${
          IsItemSend.product.title
        }
                   (Model:${
                     IsItemSend.product.model
                   }) for delivery. Once the item delivered, please confirm the delivery by cliking the "confirm delivery" button.
                   ${message ? `Seller Message : ${message}` : ' '} 
                    We would like to thank you and appreciate you for choosing Alle Tre.`;
        const notificationBodyToBidder = {
          status: 'ON_ITEM_SEND_FOR_DELIVERY',
          userType: 'FOR_WINNER',
          usersId: highestBidder.id,
          message: notificationMessageToBidder,
          imageLink: auction.product.images[0].imageLink,
          productTitle: auction.product.title,
          auctionId: IsItemSend.id,
        };
        const notificationBodyToSeller = {
          status: 'ON_ITEM_SEND_FOR_DELIVERY',
          userType: 'FOR_SELLER',
          usersId: auction.userId,
          message: `It is happy to here that you have send the item for delivery successfully`,
          imageLink: auction.product.images[0].imageLink,
          productTitle: auction.product.title,
          auctionId: IsItemSend.id,
        };
        const createWinnerNotificationData =
          await this.prismaService.notification.create({
            data: {
              userId: highestBidder.id,
              message: notificationBodyToBidder.message,
              imageLink: auction.product.images[0].imageLink,
              productTitle: auction.product.title,
              auctionId: notificationBodyToBidder.auctionId,
            },
          });
        const createSellerNotificationData =
          await this.prismaService.notification.create({
            data: {
              userId: auction.userId,
              message: notificationBodyToSeller.message,
              imageLink: auction.product.images[0].imageLink,
              productTitle: auction.product.title,
              auctionId: notificationBodyToSeller.auctionId,
            },
          });
        if (createWinnerNotificationData) {
          try {
            this.notificationService.sendNotificationToSpecificUsers(
              notificationBodyToBidder,
            );
          } catch (error) {
            console.log('sendNotificationToSpecificUsers error', error);
          }
        }
        if (createSellerNotificationData) {
          try {
            this.notificationService.sendNotificationToSpecificUsers(
              notificationBodyToSeller,
            );
          } catch (error) {
            console.log('sendNotificationToSpecificUsers error', error);
          }
        }
        const whatsappBodyToWinner = {
          1: `${highestBidder.userName}`,
          2: `📦 Your auction product *${IsItemSend.product.title}* (Model: ${IsItemSend.product.model}) has been sent by the seller for delivery!`,
          3: `The seller has shipped your auction win. Please confirm the delivery once you receive it by clicking the "Confirm Delivery" button.`,
          4: `*Seller Message:* ${
            message ? message : 'No additional message from the seller.'
          }`,
          5: `Thanks for choosing *Alletre*! We're grateful to have you as part of our community.`,
          6: `Want to participate in another auction? Click below to explore new listings!`,
          7: `${IsItemSend.product.images[0].imageLink}`,
          8: `Thanks again for being part of *Alletre*!`,
          9: `https://www.alletre.com/`,
        };

        if (highestBidder.phone) {
          await this.whatsappService.sendOtherUtilityMessages(
            whatsappBodyToWinner,
            highestBidder.phone,
            'alletre_common_utility_templet',
          );
        }

        await this.emailService.sendEmail(
          highestBidder.email,
          'token',
          EmailsType.OTHER,
          emailBodyToWinner,
        );
        return IsItemSend;
      } else {
        throw new MethodNotAllowedResponse({
          ar: 'لايمكنك تكملة العملية',
          en: 'You Can not Complete Operation',
        });
      }
    } catch (error) {
      console.log('is send item for delivery error : ', error);
      throw new MethodNotAllowedResponse({
        ar: 'لايمكنك تكملة العملية',
        en: 'You Can not Complete Operation',
      });
    }
  }

  async uploadAuctionComplaints(
    userId: number,
    AuctionComplaintsData: AuctionComplaintsDTO,
    images: Express.Multer.File[],
  ) {
    try {
      console.log('at auction service page :', AuctionComplaintsData);
      const imagesHolder = [];
      const newComplaintData =
        await this.prismaService.auctionComplaints.create({
          data: {
            auctionStatus: AuctionComplaintsData.auctionStatus,
            message: AuctionComplaintsData.message,
            auctionId: AuctionComplaintsData.auctionId,
            userId: userId,
          },
        });
      if (images?.length) {
        for (const image of images) {
          const uploadedImage = await this.firebaseService.uploadImage(image);
          imagesHolder.push(uploadedImage);
        }
      }

      if (imagesHolder?.length) {
        imagesHolder.forEach(async (image) => {
          await this.prismaService.complaintImages.create({
            data: {
              complaintId: newComplaintData.id,
              imageLink: image.fileLink,
              imagePath: image.filePath,
            },
          });
        });
      }
      console.log('result');
      return 'result';
    } catch (error) {
      // Handle the error appropriately
      // You can log the error, rethrow it, or return a custom response
      console.error('Error during confirmDelivery:', error);
      throw new MethodNotAllowedResponse({
        ar: 'حدث خطأ عند تحميل شكوى المزاد',
        en: 'An error occurred when upload auction complaint',
      });
    }
  }
  async findAllAuctionBidders(auctionId: number) {
    return await this.prismaService.$queryRawUnsafe(`
    SELECT "U"."id", "U"."userName", MAX(CAST("B"."amount" AS DECIMAL)) AS "lastBidAmount", MAX("B"."createdAt") AS "lastBidTime", "C"."totalBids"
    FROM "User" AS "U"
    LEFT JOIN "Bids" AS "B"
    ON "U"."id" = "B"."userId" AND "B"."auctionId" = ${auctionId}
    INNER JOIN (
    SELECT "Bids"."userId",  CAST(COUNT(*) AS INTEGER) AS "totalBids"
    FROM "Bids"
    WHERE "Bids"."auctionId" = ${auctionId}
    GROUP BY "Bids"."userId"
    ) AS "C"
    ON "U"."id" = "C"."userId"
    GROUP BY "U"."id", "U"."userName", "C"."totalBids"
    `);
  }

  private async _createOnTimeDailyAuction(
    userId: number,
    productId: number,
    auctionDto: AuctionCreationDTO,
  ) {
    const {
      type,
      durationUnit,
      durationInDays,
      startBidAmount,
      isBuyNowAllowed,
      acceptedAmount,
      locationId,
      IsDelivery,
      deliveryPolicyDescription,
      numOfDaysOfExpecetdDelivery,
      IsRetrunPolicy,
      returnPolicyDescription,
      IsWaranty,
      warrantyPolicyDescription,
      DeliveryFees,
    } = auctionDto;

    let auction: Auction;
    try {
      auction = await this.prismaService.auction.create({
        data: {
          userId,
          productId,
          type: AuctionType.ON_TIME,
          durationUnit,
          durationInDays,
          startBidAmount,
          ...(isBuyNowAllowed == 'YES' ? { isBuyNowAllowed: true } : {}),
          ...(acceptedAmount ? { acceptedAmount } : {}),
          ...(IsDelivery === 'true' ? { IsDelivery: true } : {}),
          ...(deliveryPolicyDescription ? { deliveryPolicyDescription } : {}),
          ...(numOfDaysOfExpecetdDelivery
            ? { numOfDaysOfExpecetdDelivery }
            : {}),
          ...(DeliveryFees ? { DeliveryFees } : {}),
          ...(IsRetrunPolicy === 'true' ? { IsReturnPolicy: true } : {}),
          ...(returnPolicyDescription ? { returnPolicyDescription } : {}),
          ...(IsWaranty === 'true' ? { IsWarranty: true } : {}),
          ...(warrantyPolicyDescription ? { warrantyPolicyDescription } : {}),
          locationId,
        },
        include: {
          product: { include: { category: true } },
        },
      });
    } catch (error) {
      console.log('_createOnTimeDailyAuction', error);
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في اضافة الاعلان تأكد من صحة البيانات',
        en: 'Something Went Wrong While Adding Your Auction',
      });
    }

    // TODO: Create Payment Service and set startDate(cuurentDate) & expiryDate=(Date()+durationInDays) & status=PUBLISHED when payment proceed
    return auction;
  }

  private async _updateOnTimeDailyAuction(
    auctionId: number,
    userId: number,
    productId: number,
    auctionCreationDTO: AuctionCreationDTO,
  ) {
    const {
      type,
      durationUnit,
      durationInDays,
      startBidAmount,
      isBuyNowAllowed,
      acceptedAmount,
      locationId,
      IsDelivery,
      deliveryPolicyDescription,
      numOfDaysOfExpecetdDelivery,
      IsRetrunPolicy,
      returnPolicyDescription,
      IsWaranty,
      warrantyPolicyDescription,
      DeliveryFees,
    } = auctionCreationDTO;

    let auction: Auction;
    try {
      auction = await this.prismaService.auction.update({
        where: { id: auctionId },
        data: {
          userId,
          productId,
          type,
          durationUnit,
          durationInDays,
          startBidAmount,
          ...(isBuyNowAllowed == 'YES' ? { isBuyNowAllowed: true } : {}),
          ...(acceptedAmount ? { acceptedAmount } : {}),
          ...(IsDelivery === 'true' ? { IsDelivery: true } : {}),
          ...(deliveryPolicyDescription ? { deliveryPolicyDescription } : {}),
          ...(numOfDaysOfExpecetdDelivery
            ? { numOfDaysOfExpecetdDelivery }
            : {}),
          ...(DeliveryFees ? { DeliveryFees } : {}),
          ...(IsRetrunPolicy === 'true' ? { IsReturnPolicy: true } : {}),
          ...(returnPolicyDescription ? { returnPolicyDescription } : {}),
          ...(IsWaranty === 'true' ? { IsWarranty: true } : {}),
          ...(warrantyPolicyDescription ? { warrantyPolicyDescription } : {}),
          locationId,
          status: AuctionStatus.PENDING_OWNER_DEPOIST,
        },
      });
    } catch (error) {
      console.log(error);
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في اضافة الاعلان تأكد من صحة البيانات',
        en: 'Something Went Wrong While Adding Your Auction',
      });
    }

    // TODO: Create Payment Service and set startDate(cuurentDate) & expiryDate=(Date()+durationInDays) & status=PUBLISHED when payment proceed
    return auction;
  }

  async findAuctionBidsHistoryForUser(auctionId: number, userId: number) {
    const bidderInfo = await this.prismaService.user.findUnique({
      where: { id: userId },
    });
    return {
      biderInfo: {
        imageLink: bidderInfo.imageLink,
        imagePath: bidderInfo.imagePath,
        userName: bidderInfo.userName,
      },
      bidsHistory: await this.prismaService.bids.findMany({
        where: { auctionId, userId },
        orderBy: { createdAt: 'asc' },
      }),
    };
  }
  async listOnlyProduct(
    productData: ProductDTO,
    images: Express.Multer.File[],
    userId: number,
    auctionId?: number,
  ) {
    try {
      let productId: number;
      if (auctionId) {
        // Find the existing draft auction and its product ID
        const auctionDraft = await this.prismaService.auction.findUnique({
          where: { id: auctionId },
        });

        if (!auctionDraft) {
          throw new MethodNotAllowedResponse({
            ar: 'المسودة غير موجودة',
            en: 'Draft not found',
          });
        }

        productId = auctionDraft.productId;
        // Update the existing product with the new data and set isAuctionProduct to false for listings
        await this._updateProduct(productId, productData, false);

        // Upload and link new images if provided
        if (images?.length) {
          for (const image of images) {
            const uploadedImage = await this.firebaseService.uploadImage(image);
            await this.prismaService.image.create({
              data: {
                productId: productId,
                imageLink: uploadedImage.fileLink,
                imagePath: uploadedImage.filePath,
              },
            });
          }
        }

        // Delete the draft container (the record in the Auction table)
        await this.prismaService.auction.delete({
          where: { id: auctionId },
        });
      } else {
        // Create a new product if no draft exists
        const createProductStatus = 'LISTING';
        productId = await this._createProduct(
          productData,
          images,
          createProductStatus,
          userId,
        );
      }

      // Check if this product already has a ListedProducts entry (shouldn't normally happen, but good to be safe)
      const existingListedProduct =
        await this.prismaService.listedProducts.findUnique({
          where: { productId },
        });

      if (existingListedProduct) {
        return await this.prismaService.listedProducts.update({
          where: { productId },
          data: {
            userId,
            ProductListingPrice: productData.ProductListingPrice,
            locationId: productData.locationId,
            status: 'IN_PROGRESS',
          },
        });
      }

      // Create the ListedProducts entry which makes it a live listing
      const newListedProduct = await this.prismaService.listedProducts.create({
        data: {
          productId,
          userId,
          ProductListingPrice: productData.ProductListingPrice,
          locationId: productData.locationId,
        },
        include: {
          product: {
            include: {
              images: true,
            },
          },
        },
      });

      // Send notification
      try {
        const notificationMessage = `Your product "${newListedProduct.product.title}" has been successfully listed.`;
        const notificationData = {
          usersId: userId,
          message: notificationMessage,
          imageLink: newListedProduct.product.images[0]?.imageLink,
          productTitle: newListedProduct.product.title,
          productId: newListedProduct.product.id,
        };

        await this.prismaService.notification.create({
          data: {
            userId: notificationData.usersId,
            message: notificationData.message,
            imageLink: notificationData.imageLink,
            productTitle: notificationData.productTitle,
            productId: notificationData.productId,
          },
        });

        this.notificationService.sendNotificationToSpecificUsers(
          notificationData,
        );
      } catch (error) {
        console.error('Error sending product creation notification:', error);
      }

      return newListedProduct;
    } catch (error) {
      console.error('list new procuct error :', error);
      if (error instanceof MethodNotAllowedResponse) throw error;
      throw new MethodNotAllowedResponse({
        ar: 'لقد حدث خطأ ما أثناء إضافة منتجك',
        en: 'Something Went Wrong While Adding Your Product',
      });
    }
  }

  async fetchAllListedOnlyProduct(
    roles: Role[],
    getListedProductDTO: GetListedProductDTO,
    userId?: number, // This is the filter user ID (owner)
    viewerUserId?: number, // This is the viewer user ID (for isSaved injection)
  ) {
    try {
      console.log('fetchAllListedOnlyProduct', getListedProductDTO);
      const {
        page = 1,
        perPage = 10,
        priceFrom,
        priceTo,
        status = 'IN_PROGRESS',
        isHome,
        sortBy,
        sortOrder = 'desc',
      } = getListedProductDTO;
      // const { page = 1, perPage = 4, status = 'IN_PROGRESS' } = getListedProductDTO;
      const { limit, skip } = this.paginationService.getSkipAndLimit(
        Number(page),
        Number(perPage),
      );
      console.log('limit and skip', limit, skip);
      const productFilter =
        this.auctionsHelper._productFilterApplied(getListedProductDTO);
      console.log('productfilteer,', productFilter);
      const queryOptions: any = {
        where: {
          status,
          ...(roles.includes(Role.Admin) ? {} : { userId }),
          product: {
            is: {
              ...productFilter,
              isAuctionProduct: false,
            },
          },
          AND: [
            { ProductListingPrice: { gte: priceFrom } },
            { ProductListingPrice: { lte: priceTo } },
          ],
        },
        include: {
          product: {
            include: {
              category: true,
              subCategory: true,
              images: true,
              user: {
                include: {
                  locations: { include: { country: true, city: true } },
                },
              },
            },
          },
          location: { include: { city: true, country: true } },
        },
        orderBy: (() => {
          if (sortBy === 'price') {
            return { ProductListingPrice: sortOrder };
          }
          if (sortBy === 'kilometer') {
            return { product: { kilometers: sortOrder } };
          }
          if (sortBy === 'year') {
            return { product: { releaseYear: sortOrder } };
          }
          if (sortBy === 'area') {
            return { product: { totalArea: sortOrder } };
          }
          if (sortBy === 'rooms') {
            return { product: { numberOfRooms: sortOrder } };
          }
          return { [sortBy || 'createdAt']: sortOrder };
        })(),
      };
      // Conditionally add pagination
      if (!isHome) {
        queryOptions.skip = skip;
        queryOptions.take = limit;
      }

      const allListedProducts =
        await this.prismaService.listedProducts.findMany(queryOptions);

      const productsCount = await this.prismaService.listedProducts.count({
        where: queryOptions.where,
      });

      const pagination = this.paginationService.getPagination(
        productsCount,
        page,
        perPage,
      );

      if (viewerUserId) {
        const savedProducts =
          await this.auctionsHelper._injectIsSavedKeyToListedProductsList(
            viewerUserId,
            allListedProducts,
          );

        return {
          products: savedProducts,
          pagination,
        };
      }

      return {
        products: allListedProducts,
        pagination,
      };
    } catch (error) {
      console.error('list new procuct error :', error);
      throw new MethodNotAllowedResponse({
        ar: 'لقد حدث خطأ ما أثناء إضافة منتجك',
        en: 'Something Went Wrong While Fetching all Products',
      });
    }
  }
  async fetchListedProductByOthers(
    roles: Role[],
    getListedProductByOtherDTO: GetListedProductByOhterUserDTO,
    userId?: number, // This is the filter user ID (owner)
    viewerUserId?: number, // This is the viewer user ID (for isSaved injection)
  ) {
    try {
      const {
        page = 1,
        perPage = 10,
        status = 'IN_PROGRESS',
      } = getListedProductByOtherDTO;
      const { limit, skip } = this.paginationService.getSkipAndLimit(
        Number(page),
        Number(perPage),
      );
      const allListedProducts =
        await this.prismaService.listedProducts.findMany({
          where: {
            status,
            userId,
          },
          include: {
            product: {
              include: {
                images: true,
                user: {
                  include: {
                    locations: { include: { country: true, city: true } },
                  },
                },
              },
            },
            location: { include: { city: true, country: true } },
          },
          skip: skip,
          take: limit,
          orderBy: { id: 'desc' },
        });
      const productsCount = await this.prismaService.listedProducts.count({
        where: {
          status,
          userId,
        },
      });
      const pagination = this.paginationService.getPagination(
        productsCount,
        page,
        perPage,
      );

      if (viewerUserId) {
        const savedProducts =
          await this.auctionsHelper._injectIsSavedKeyToListedProductsList(
            viewerUserId,
            allListedProducts,
          );
        return {
          products: savedProducts,
          pagination,
        };
      }

      return {
        products: allListedProducts,
        pagination,
      };
    } catch (error) {
      console.error('list new procuct error :', error);
      throw new MethodNotAllowedResponse({
        ar: 'لقد حدث خطأ ما أثناء إضافة منتجك',
        en: 'Something Went Wrong While Fetching all Products',
      });
    }
  }
  async findProductByIdOr404(
    productId: number,
    roles: Role[],
    userId?: number,
  ) {
    try {
      console.log('product id:', productId, userId);
      const product = await this.prismaService.listedProducts.findUnique({
        where: { productId: productId },
        include: {
          product: {
            include: {
              category: true,
              subCategory: true,
              city: true,
              country: true,
              images: true,
              user: {
                include: {
                  locations: { include: { country: true, city: true } },
                },
              },
            },
          },
          user: true,
          location: { include: { city: true, country: true } },
        },
      });
      console.log('1111', product);
      if (!product) {
        throw new MethodNotAllowedResponse({
          ar: 'لقد حدث خطأ ما أثناء إضافة منتجك',
          en: 'Something Went Wrong While Fetching a Products',
        });
      }
      const userLang = 'en';

      let formatedProduct = await this.filtertProduct(product, userLang);

      if (userId) {
        formatedProduct =
          await this.auctionsHelper._injectIsSavedKeyToListedProduct(
            userId,
            formatedProduct,
          );
      }

      return formatedProduct;
    } catch (error) {
      console.log('find product error : ', error);
    }
  }

  async filtertProduct(listedProduct: any, userLang: any) {
    if (listedProduct['product']['city']) {
      const cityName =
        userLang === 'en'
          ? listedProduct['product']['city']['nameEn']
          : listedProduct['product']['city']['nameAr'];
      delete listedProduct['product']['city'];
      listedProduct['product']['city'] = cityName;
    }
    if (listedProduct['product']['country']) {
      const countryName =
        userLang === 'en'
          ? listedProduct['product']['country']['nameEn']
          : listedProduct['product']['country']['nameAr'];
      delete listedProduct['product']['country'];
      listedProduct['product']['country'] = countryName;
    }

    for (const field in listedProduct['product']) {
      if (listedProduct['product'][field] === null)
        delete listedProduct['product'][field];
    }

    return listedProduct;
  }
  async findListedProductsAnalytics(userId: number) {
    try {
      const count = await this.prismaService.listedProducts.count({
        where: {
          userId,
        },
      });

      const productsGrouping = await this.prismaService.listedProducts.groupBy({
        where: {
          userId,
        },
        by: ['status'],
        _count: { status: true },
      });
      return {
        count,
        productsGrouping: productsGrouping?.length
          ? productsGrouping.map((item) => {
              return {
                count: item['_count']?.status,
                status: item.status,
              };
            })
          : [],
      };
    } catch (error) {
      console.log('find product error : ', error);
    }
  }

  private async _updateListedProduct(productId: number, updateDTO: any) {
    const updateData: any = {};
    const productData = updateDTO.product || updateDTO;

    // String fields
    if (productData?.title) updateData.title = productData?.title;
    if (productData?.description)
      updateData.description = productData?.description;
    if (productData?.usageStatus)
      updateData.usageStatus = productData?.usageStatus;
    if (productData?.brand) updateData.brand = productData?.brand;
    if (productData?.color) updateData.color = productData?.color;
    if (productData?.landType) updateData.landType = productData?.landType;
    if (productData?.cameraType)
      updateData.cameraType = productData?.cameraType;
    if (productData?.carType) updateData.carType = productData?.carType;
    if (productData?.trim) updateData.trim = productData?.trim;
    if (productData?.regionalSpecs)
      updateData.regionalSpecs = productData?.regionalSpecs;
    if (productData?.kilometers)
      updateData.kilometers = productData?.kilometers;
    if (productData?.interiorColor)
      updateData.interiorColor = productData?.interiorColor;
    if (productData?.insuredInUae)
      updateData.insuredInUae = productData?.insuredInUae;
    if (productData?.warranty) updateData.warranty = productData?.warranty;
    if (productData?.fuelType) updateData.fuelType = productData?.fuelType;
    if (productData?.doors) updateData.doors = productData?.doors;
    if (productData?.transmissionType)
      updateData.transmissionType = productData?.transmissionType;
    if (productData?.seatingCapacity)
      updateData.seatingCapacity = productData?.seatingCapacity;
    if (productData?.horsepower)
      updateData.horsepower = productData?.horsepower;
    if (productData?.steeringSide)
      updateData.steeringSide = productData?.steeringSide;
    if (productData?.engineCapacity)
      updateData.engineCapacity = productData?.engineCapacity;
    if (productData?.numberOfCylinders)
      updateData.numberOfCylinders = productData?.numberOfCylinders;
    if (productData?.driverAssistance)
      updateData.driverAssistance = productData?.driverAssistance;
    if (productData?.entertainment)
      updateData.entertainment = productData?.entertainment;
    if (productData?.comfort) updateData.comfort = productData?.comfort;
    if (productData?.exteriorFeatures)
      updateData.exteriorFeatures = productData?.exteriorFeatures;
    if (productData?.material) updateData.material = productData?.material;
    if (productData?.memory) updateData.memory = productData?.memory;
    if (productData?.model) updateData.model = productData?.model;
    if (productData?.processor) updateData.processor = productData?.processor;
    if (productData?.operatingSystem)
      updateData.operatingSystem = productData?.operatingSystem;
    if (productData?.regionOfManufacture)
      updateData.regionOfManufacture = productData?.regionOfManufacture;
    if (productData?.numberOfRooms)
      updateData.numberOfRooms = productData?.numberOfRooms.toString();
    if (productData?.emirate) updateData.emirate = productData?.emirate;
    if (productData?.numberOfBathrooms)
      updateData.numberOfBathrooms = productData?.numberOfBathrooms;
    if (productData?.developer) updateData.developer = productData?.developer;
    if (productData?.readyBy) updateData.readyBy = productData?.readyBy;
    if (productData?.isFurnished)
      updateData.isFurnished = productData?.isFurnished;
    if (productData?.propertyReferenceId)
      updateData.propertyReferenceId = productData?.propertyReferenceId;
    if (productData?.occupancyStatus)
      updateData.occupancyStatus = productData?.occupancyStatus;
    if (productData?.amenities) updateData.amenities = productData?.amenities;
    if (productData?.zonedFor) updateData.zonedFor = productData?.zonedFor;
    if (productData?.freehold) updateData.freehold = productData?.freehold;
    if (productData?.residentialType)
      updateData.residentialType = productData?.residentialType;
    if (productData?.commercialType)
      updateData.commercialType = productData?.commercialType;

    // Decimal fields

    if (productData?.ProductListingPrice) {
      updateData.ProductListingPrice = new Decimal(
        productData?.ProductListingPrice,
      ).toNumber();
    }
    if (productData?.totalClosingFee) {
      updateData.totalClosingFee = new Decimal(
        productData?.totalClosingFee,
      ).toNumber();
    }
    if (productData?.annualCommunityFee) {
      updateData.annualCommunityFee = new Decimal(
        productData?.annualCommunityFee,
      ).toNumber();
    }
    if (productData?.buyerTransferFee) {
      updateData.buyerTransferFee = new Decimal(
        productData?.buyerTransferFee,
      ).toNumber();
    }
    if (productData?.sellerTransferFee) {
      updateData.sellerTransferFee = new Decimal(
        productData?.sellerTransferFee,
      ).toNumber();
    }
    if (productData?.maintenanceFee) {
      updateData.maintenanceFee = new Decimal(
        productData?.maintenanceFee,
      ).toNumber();
    }
    if (productData?.approvedBuildUpArea) {
      updateData.approvedBuildUpArea = new Decimal(
        productData?.approvedBuildUpArea,
      ).toNumber();
    }

    // Integer fields
    if (productData?.age) updateData.age = parseInt(productData?.age);
    if (productData?.ramSize)
      updateData.ramSize = parseInt(productData?.ramSize);
    if (productData?.numberOfFloors)
      updateData.numberOfFloors = parseInt(productData?.numberOfFloors);

    // String fields that look like numbers but should remain strings
    if (productData?.releaseYear)
      updateData.releaseYear = productData?.releaseYear.toString();

    // Float fields
    if (productData?.screenSize)
      updateData.screenSize = parseFloat(productData?.screenSize);
    if (productData?.totalArea)
      updateData.totalArea = parseFloat(productData?.totalArea);

    // Handle relationships using connect
    if (productData?.categoryId) {
      updateData.category = {
        connect: { id: parseInt(productData?.categoryId) },
      };
    }
    if (productData?.subCategoryId) {
      updateData.subCategory = {
        connect: { id: parseInt(productData?.subCategoryId) },
      };
    }
    if (productData?.cityId) {
      updateData.city = {
        connect: { id: parseInt(productData?.cityId) },
      };
    }
    if (productData?.countryId) {
      updateData.country = {
        connect: { id: parseInt(productData?.countryId) },
      };
    }

    return await this.prismaService.product.update({
      where: { id: productId },
      data: updateData,
      include: {
        images: true,
        category: true,
        listedProducts: true,
      },
    });
  }

  async updateListedProductDetails(
    userId: number,
    productId: number,
    productUpdateDTO: ProductUpdateDTO,
    files: Array<Express.Multer.File>,
  ) {
    try {
      // Verify product ownership and get existing product
      const existingProduct = await this.prismaService.product.findFirst({
        where: {
          id: productId,
          userId: userId,
        },
        include: {
          images: true,
          category: true,
          listedProducts: true,
        },
      });

      if (!existingProduct) {
        console.log(
          '[updateListedProductDetails] Product not found or unauthorized. userId:',
          userId,
          'productId:',
          productId,
        );
        throw new MethodNotAllowedResponse({
          ar: 'المنتج غير موجود أو غير مصرح لك بتحديثه',
          en: 'Product not found or you are not authorized to update it',
        });
      }

      // Removed strict check for existingProduct.listedProducts to allow editing/uploading drafts

      // Process images if provided
      const images =
        files?.filter((file) => file.mimetype.startsWith('image/')) || [];
      let imageUrls = [];

      if (images.length > 0) {
        imageUrls = await Promise.all(
          images.map(async (file) => {
            const uploadedImage = await this.firebaseService.uploadImage(file);
            return uploadedImage;
          }),
        );
      }

      // Begin transaction to update product and images with increased timeout
      const updatedProduct = await this.prismaService.$transaction(
        async (prisma) => {
          // Update product details
          const updated = await this._updateListedProduct(
            productId,
            productUpdateDTO,
          );

          // Ensure ListedProducts record exists (Publish draft if needed)
          const listedProduct = await prisma.listedProducts.findUnique({
            where: { productId: productId },
          });

          if (!listedProduct) {
            console.log(
              '[updateListedProductDetails] Creating missing ListedProducts record for draft. productId:',
              productId,
            );
            await prisma.listedProducts.create({
              data: {
                productId: productId,
                userId: userId,
                ProductListingPrice:
                  productUpdateDTO.ProductListingPrice ||
                  updated.ProductListingPrice ||
                  0,
                locationId: productUpdateDTO.locationId || null,
              },
            });
          } else {
            // Update existing listing specific fields if provided
            await prisma.listedProducts.update({
              where: { productId: productId },
              data: {
                ProductListingPrice:
                  productUpdateDTO.ProductListingPrice ||
                  listedProduct.ProductListingPrice,
                locationId:
                  productUpdateDTO.locationId || listedProduct.locationId,
              },
            });
          }

          // Create new image records if any
          if (imageUrls.length > 0) {
            await Promise.all(
              imageUrls.map((image) =>
                prisma.image.create({
                  data: {
                    productId: productId,
                    imageLink: image.fileLink,
                    imagePath: image.filePath,
                  },
                }),
              ),
            );
          }

          // Get the updated product directly from the result
          return updated;
        },
        {
          timeout: 10000, // Increase timeout to 10 seconds
        },
      );

      // Send notification
      try {
        const notificationMessage = `Your product "${updatedProduct.title}" has been successfully updated.`;
        const notificationData = {
          usersId: userId,
          message: notificationMessage,
          imageLink: updatedProduct.images[0]?.imageLink,
          productTitle: updatedProduct.title,
          productId: updatedProduct.id,
        };

        await this.prismaService.notification.create({
          data: {
            userId: notificationData.usersId,
            message: notificationData.message,
            imageLink: notificationData.imageLink,
            productTitle: notificationData.productTitle,
            productId: notificationData.productId,
          },
        });

        this.notificationService.sendNotificationToSpecificUsers(
          notificationData,
        );
      } catch (error) {
        console.error('Error sending product update notification:', error);
      }

      return updatedProduct;
    } catch (error) {
      console.error('Update listed product error:', error);
      throw error;
    }
  }

  async updateListedProductStatus(id: number, status: ListedProductsStatus) {
    try {
      console.log('product id:', id);
      const updatedProduct = await this.prismaService.listedProducts.update({
        where: {
          id: id,
        },
        data: {
          status: status,
        },
      });
      console.log('product :', updatedProduct);
      if (!updatedProduct) {
        throw new MethodNotAllowedResponse({
          ar: 'لقد حدث خطأ ما أثناء إضافة منتجك',
          en: 'Something Went Wrong While Fetching a Products',
        });
      }

      // Send notification
      try {
        const productWithDetails =
          await this.prismaService.listedProducts.findUnique({
            where: { id: id },
            include: {
              product: {
                include: {
                  images: true,
                },
              },
            },
          });

        if (productWithDetails) {
          const notificationMessage = `The status of your product "${
            productWithDetails.product.title
          }" has been changed to ${status.replace('_', ' ')}.`;
          const notificationData = {
            usersId: productWithDetails.userId,
            message: notificationMessage,
            imageLink: productWithDetails.product.images[0]?.imageLink,
            productTitle: productWithDetails.product.title,
            productId: productWithDetails.productId,
          };

          await this.prismaService.notification.create({
            data: {
              userId: notificationData.usersId,
              message: notificationData.message,
              imageLink: notificationData.imageLink,
              productTitle: notificationData.productTitle,
              productId: notificationData.productId,
            },
          });

          this.notificationService.sendNotificationToSpecificUsers(
            notificationData,
          );
        }
      } catch (error) {
        console.error(
          'Error sending product status change notification:',
          error,
        );
      }

      return updatedProduct;
    } catch (error) {
      console.log('find product error : ', error);
    }
  }

  private async _createOnTimeHoursAuction(
    userId: number,
    productId: number,
    auctionDto: AuctionCreationDTO,
  ) {
    const {
      type,
      durationUnit,
      durationInHours,
      startBidAmount,
      isBuyNowAllowed,
      acceptedAmount,
      locationId,
      IsDelivery,
      deliveryPolicyDescription,
      numOfDaysOfExpecetdDelivery,
      IsRetrunPolicy,
      returnPolicyDescription,
      IsWaranty,
      warrantyPolicyDescription,
      DeliveryFees,
    } = auctionDto;

    let auction: Auction;

    try {
      auction = await this.prismaService.auction.create({
        data: {
          userId,
          productId,
          type: AuctionType.ON_TIME,
          durationUnit,
          durationInHours,
          startBidAmount,
          ...(isBuyNowAllowed == 'YES' ? { isBuyNowAllowed: true } : {}),
          ...(acceptedAmount ? { acceptedAmount } : {}),
          ...(IsDelivery === 'true' ? { IsDelivery: true } : {}),
          ...(deliveryPolicyDescription ? { deliveryPolicyDescription } : {}),
          ...(numOfDaysOfExpecetdDelivery
            ? { numOfDaysOfExpecetdDelivery }
            : {}),
          ...(DeliveryFees ? { DeliveryFees } : {}),
          ...(IsRetrunPolicy === 'true' ? { IsReturnPolicy: true } : {}),
          ...(returnPolicyDescription ? { returnPolicyDescription } : {}),
          ...(IsWaranty === 'true' ? { IsWarranty: true } : {}),
          ...(warrantyPolicyDescription ? { warrantyPolicyDescription } : {}),
          locationId,
        },
        include: {
          product: { include: { category: true } },
        },
      });
    } catch (error) {
      console.log(error);
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في اضافة الاعلان تأكد من صحة البيانات',
        en: 'Something Went Wrong While Adding Your Auction',
      });
    }

    // TODO: Create Payment Service and set startDate(currentDate) & expriyDate=(Date()+durationInHours) & status=PUBLISHED when payment proceed

    return auction;
  }

  private async _updateOnTimeHoursAuction(
    auctionId: number,
    userId: number,
    productId: number,
    auctionCreationDTO: AuctionCreationDTO,
  ) {
    const {
      type,
      durationUnit,
      durationInHours,
      startBidAmount,
      isBuyNowAllowed,
      acceptedAmount,
      locationId,
      IsDelivery,
      deliveryPolicyDescription,
      numOfDaysOfExpecetdDelivery,
      IsRetrunPolicy,
      returnPolicyDescription,
      IsWaranty,
      warrantyPolicyDescription,
      DeliveryFees,
    } = auctionCreationDTO;

    let auction: Auction;

    try {
      auction = await this.prismaService.auction.update({
        where: { id: auctionId },
        data: {
          userId,
          productId,
          type,
          durationUnit,
          durationInHours,
          startBidAmount,
          ...(isBuyNowAllowed == 'YES' ? { isBuyNowAllowed: true } : {}),
          ...(acceptedAmount ? { acceptedAmount } : {}),
          ...(IsDelivery === 'true' ? { IsDelivery: true } : {}),
          ...(deliveryPolicyDescription ? { deliveryPolicyDescription } : {}),
          ...(numOfDaysOfExpecetdDelivery
            ? { numOfDaysOfExpecetdDelivery }
            : {}),
          ...(DeliveryFees ? { DeliveryFees } : {}),
          ...(IsRetrunPolicy === 'true' ? { IsReturnPolicy: true } : {}),
          ...(returnPolicyDescription ? { returnPolicyDescription } : {}),
          ...(IsWaranty === 'true' ? { IsWarranty: true } : {}),
          ...(warrantyPolicyDescription ? { warrantyPolicyDescription } : {}),
          locationId,
          status: AuctionStatus.PENDING_OWNER_DEPOIST,
        },
      });
    } catch (error) {
      console.log(error);
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في اضافة الاعلان تأكد من صحة البيانات',
        en: 'Something Went Wrong While Adding Your Auction',
      });
    }

    // TODO: Create Payment Service and set startDate(currentDate) & expriyDate=(Date()+durationInHours) & status=PUBLISHED when payment proceed

    return auction;
  }

  async deleteAuctionImage(
    auctionId: number,
    imageId: number,
    isListing: boolean | string,
  ) {
    const isListingBool = isListing === true || isListing === 'true';

    if (isListingBool) {
      // For listed products, auctionId is actually the productId
      const image = await this.prismaService.image.findUnique({
        where: { id: imageId },
      });
      if (!image || image.productId !== auctionId) {
        throw new NotFoundException({
          ar: 'الصورة غير موجودة أو غير مرتبطة بهذا المنتج',
          en: 'Image not found or not related to this product',
        });
      }
    } else {
      await this.auctionsHelper._isAuctionValidForUpdate(auctionId);
      await this.auctionsHelper._isImageRelatedToAuction(auctionId, imageId);
    }
    try {
      return await this.prismaService.image.delete({ where: { id: imageId } });
    } catch (error) {
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في عملية حذف الصورة',
        en: 'Something went wrong while deleting your image',
      });
    }
  }

  async uploadImageForAuction(
    auctionId: number,
    image: Express.Multer.File,
    isListing: boolean | string,
  ) {
    let productId: number;
    const isListingBool = isListing === true || isListing === 'true';

    if (isListingBool) {
      // For listed products, auctionId is actually the productId
      const product = await this.prismaService.product.findUnique({
        where: { id: auctionId },
        include: { images: true },
      });
      if (!product) {
        throw new NotFoundException({
          ar: 'المنتج غير موجود',
          en: 'Product not found',
        });
      }
      if (product.images.length >= 50) {
        throw new MethodNotAllowedResponse({
          ar: 'لا يمكنك إضافة الصورة',
          en: 'You cannot upload more than 50 images',
        });
      }
      productId = product.id;
    } else {
      // Check auction validation for update
      await this.auctionsHelper._isAuctionValidForUpdate(auctionId);
      const auction = await this.prismaService.auction.findUnique({
        where: { id: auctionId },
        include: { product: { include: { images: true } } },
      });

      if (!auction) {
        throw new NotFoundException({
          ar: 'المزاد غير موجود',
          en: 'Auction not found',
        });
      }

      // Check auction images validation
      if (auction.product.images.length >= 50)
        throw new MethodNotAllowedResponse({
          ar: 'لا يمكنك إضافة الصورة',
          en: 'You Can Not Upload Image, You have been uploaded 50 images',
        });
      productId = auction.productId;
    }

    try {
      // Upload Image to firebase
      const { filePath, fileLink } = await this.firebaseService.uploadImage(
        image,
      );
      // Upload new image
      const newImage = await this.prismaService.image.create({
        data: {
          imageLink: fileLink,
          imagePath: filePath,
          productId: productId,
        },
      });
      return newImage;
    } catch (error) {
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في عملية رفع الصورة',
        en: 'Something went wrong while uploading your image',
      });
    }
  }

  async markExpiredAuctions() {
    const expiredAuctions = await this.prismaService.auction.findMany({
      where: {
        expiryDate: {
          lte: new Date(), // Filter auctions where expiryDate is less than or equal to the current date and time
        },
        status: {
          not: AuctionStatus.EXPIRED, // Exclude auctions that are already marked as expired
        },
      },
    });

    for (const auction of expiredAuctions) {
      await this.prismaService.auction.update({
        where: {
          id: auction.id,
        },
        data: {
          status: AuctionStatus.EXPIRED, // Update the status of the auction to 'EXPIRED'
          endDate: new Date(), // Set the endDate to the current date and time
        },
      });
    }
  }

  private async _createScheduleDailyAuction(
    userId: number,
    productId: number,
    auctionDto: AuctionCreationDTO,
  ) {
    const {
      type,
      durationUnit,
      durationInDays,
      startBidAmount,
      isBuyNowAllowed,
      acceptedAmount,
      locationId,
      startDate,
      IsDelivery,
      deliveryPolicyDescription,
      numOfDaysOfExpecetdDelivery,
      IsRetrunPolicy,
      returnPolicyDescription,
      IsWaranty,
      warrantyPolicyDescription,
      DeliveryFees,
    } = auctionDto;

    let auction: Auction;

    try {
      auction = await this.prismaService.auction.create({
        data: {
          userId,
          productId,
          type: AuctionType.SCHEDULED,
          durationUnit,
          durationInDays,
          startBidAmount,
          ...(isBuyNowAllowed == 'YES' ? { isBuyNowAllowed: true } : {}),
          ...(acceptedAmount ? { acceptedAmount } : {}),
          ...(IsDelivery === 'true' ? { IsDelivery: true } : {}),
          ...(deliveryPolicyDescription ? { deliveryPolicyDescription } : {}),
          ...(numOfDaysOfExpecetdDelivery
            ? { numOfDaysOfExpecetdDelivery }
            : {}),
          ...(DeliveryFees ? { DeliveryFees } : {}),
          ...(IsRetrunPolicy === 'true' ? { IsReturnPolicy: true } : {}),
          ...(returnPolicyDescription ? { returnPolicyDescription } : {}),
          ...(IsWaranty === 'true' ? { IsWarranty: true } : {}),
          ...(warrantyPolicyDescription ? { warrantyPolicyDescription } : {}),
          locationId,
          startDate: new Date(startDate),
        },
        include: {
          product: { include: { category: true } },
        },
      });
    } catch (error) {
      console.log(error);
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في اضافة الاعلان تأكد من صحة البيانات',
        en: 'Something Went Wrong While Adding Your Auction',
      });
    }

    // TODO: Create Payment Service and set expiryDate=(startDate+durationInDays)& status=IN_SCHEDULED if(current date < startDate) when payment proceed
    return auction;
  }

  private async _updateScheduleDailyAuction(
    auctionId: number,
    userId: number,
    productId: number,
    auctionCreationDTO: AuctionCreationDTO,
  ) {
    const {
      type,
      durationUnit,
      durationInDays,
      startBidAmount,
      isBuyNowAllowed,
      acceptedAmount,
      locationId,
      startDate,
      IsDelivery,
      deliveryPolicyDescription,
      numOfDaysOfExpecetdDelivery,
      IsRetrunPolicy,
      returnPolicyDescription,
      IsWaranty,
      warrantyPolicyDescription,
      DeliveryFees,
    } = auctionCreationDTO;

    let auction: Auction;

    try {
      auction = await this.prismaService.auction.update({
        where: { id: auctionId },
        data: {
          userId,
          productId,
          type,
          durationUnit,
          durationInDays,
          startBidAmount,
          ...(isBuyNowAllowed == 'YES' ? { isBuyNowAllowed: true } : {}),
          ...(acceptedAmount ? { acceptedAmount } : {}),
          ...(IsDelivery === 'true' ? { IsDelivery: true } : {}),
          ...(deliveryPolicyDescription ? { deliveryPolicyDescription } : {}),
          ...(numOfDaysOfExpecetdDelivery
            ? { numOfDaysOfExpecetdDelivery }
            : {}),
          ...(DeliveryFees ? { DeliveryFees } : {}),
          ...(IsRetrunPolicy === 'true' ? { IsReturnPolicy: true } : {}),
          ...(returnPolicyDescription ? { returnPolicyDescription } : {}),
          ...(IsWaranty === 'true' ? { IsWarranty: true } : {}),
          ...(warrantyPolicyDescription ? { warrantyPolicyDescription } : {}),
          locationId,
          startDate,
          status: AuctionStatus.PENDING_OWNER_DEPOIST,
        },
      });
    } catch (error) {
      console.log(error);
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في اضافة الاعلان تأكد من صحة البيانات',
        en: 'Something Went Wrong While Adding Your Auction',
      });
    }

    // TODO: Create Payment Service and set expiryDate=(startDate+durationInDays)& status=IN_SCHEDULED if(current date < startDate) when payment proceed else set PUBLISHED
    return auction;
  }

  private async _createScheduleHoursAuction(
    userId: number,
    productId: number,
    auctionDto: AuctionCreationDTO,
  ) {
    const {
      type,
      durationUnit,
      durationInHours,
      startBidAmount,
      isBuyNowAllowed,
      acceptedAmount,
      locationId,
      startDate,
      IsDelivery,
      deliveryPolicyDescription,
      numOfDaysOfExpecetdDelivery,
      IsRetrunPolicy,
      returnPolicyDescription,
      IsWaranty,
      warrantyPolicyDescription,
      DeliveryFees,
    } = auctionDto;

    let auction: Auction;

    try {
      auction = await this.prismaService.auction.create({
        data: {
          userId,
          productId,
          type: AuctionType.SCHEDULED,
          durationUnit,
          durationInHours,
          startBidAmount,
          ...(isBuyNowAllowed == 'YES' ? { isBuyNowAllowed: true } : {}),
          ...(acceptedAmount ? { acceptedAmount } : {}),
          ...(IsDelivery === 'true' ? { IsDelivery: true } : {}),
          ...(deliveryPolicyDescription ? { deliveryPolicyDescription } : {}),
          ...(numOfDaysOfExpecetdDelivery
            ? { numOfDaysOfExpecetdDelivery }
            : {}),
          ...(DeliveryFees ? { DeliveryFees } : {}),
          ...(IsRetrunPolicy === 'true' ? { IsReturnPolicy: true } : {}),
          ...(returnPolicyDescription ? { returnPolicyDescription } : {}),
          ...(IsWaranty === 'true' ? { IsWarranty: true } : {}),
          ...(warrantyPolicyDescription ? { warrantyPolicyDescription } : {}),
          locationId,
          startDate: new Date(startDate),
        },
        include: {
          product: { include: { category: true } },
        },
      });
    } catch (error) {
      console.log(error);
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في اضافة الاعلان تأكد من صحة البيانات',
        en: 'Something Went Wrong While Adding Your Auction',
      });
    }

    // TODO: Create Payment Service and set expiryDate=(startDate+durationInHours) & status=IN_SCHEDULED if(current date < startDate) when payment proceed

    return auction;
  }

  private async _updateScheduleHoursAuction(
    auctionId: number,
    userId: number,
    productId: number,
    auctionCreationDTO: AuctionCreationDTO,
  ) {
    const {
      type,
      durationUnit,
      durationInHours,
      startBidAmount,
      isBuyNowAllowed,
      acceptedAmount,
      locationId,
      startDate,
      IsDelivery,
      deliveryPolicyDescription,
      numOfDaysOfExpecetdDelivery,
      IsRetrunPolicy,
      returnPolicyDescription,
      IsWaranty,
      warrantyPolicyDescription,
      DeliveryFees,
    } = auctionCreationDTO;

    let auction: Auction;

    try {
      auction = await this.prismaService.auction.update({
        where: { id: auctionId },
        data: {
          userId,
          productId,
          type,
          durationUnit,
          durationInHours,
          startBidAmount,
          ...(isBuyNowAllowed == 'YES' ? { isBuyNowAllowed: true } : {}),
          ...(acceptedAmount ? { acceptedAmount } : {}),
          ...(IsDelivery === 'true' ? { IsDelivery: true } : {}),
          ...(deliveryPolicyDescription ? { deliveryPolicyDescription } : {}),
          ...(numOfDaysOfExpecetdDelivery
            ? { numOfDaysOfExpecetdDelivery }
            : {}),
          ...(DeliveryFees ? { DeliveryFees } : {}),
          ...(IsRetrunPolicy === 'true' ? { IsReturnPolicy: true } : {}),
          ...(returnPolicyDescription ? { returnPolicyDescription } : {}),
          ...(IsWaranty === 'true' ? { IsWarranty: true } : {}),
          ...(warrantyPolicyDescription ? { warrantyPolicyDescription } : {}),
          locationId,
          startDate,
          status: AuctionStatus.PENDING_OWNER_DEPOIST,
        },
      });
    } catch (error) {
      console.log(error);
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في اضافة الاعلان تأكد من صحة البيانات',
        en: 'Something Went Wrong While Adding Your Auction',
      });
    }

    // TODO: Create Payment Service and set expiryDate=(startDate+durationInHours) & status=IN_SCHEDULED if(current date < startDate) when payment proceed else set PUBLISHED

    return auction;
  }

  private async _createProduct(
    productBody: ProductDTO,
    images?: Express.Multer.File[],
    createProductStatus?: 'LISTING' | 'AUCTION',
    userId?: number,
  ) {
    const {
      title,
      model,
      categoryId,
      subCategoryId,
      // brandId,
      description,
      usageStatus,
      color,
      screenSize,
      processor,
      operatingSystem,
      releaseYear,
      regionOfManufacture,
      ramSize,
      cameraType,
      material,
      memory,
      age,
      totalArea,
      numberOfRooms,
      numberOfFloors,
      landType,
      countryId,
      cityId,
      isOffer,
      offerAmount,
      brand,
      ProductListingPrice,
      carType,
      trim,
      regionalSpecs,
      kilometers,
      interiorColor,
      insuredInUae,
      warranty,
      fuelType,
      doors,
      transmissionType,
      seatingCapacity,
      horsepower,
      steeringSide,
      engineCapacity,
      numberOfCylinders,
      driverAssistance,
      entertainment,
      comfort,
      exteriorFeatures,
      emirate,
      totalClosingFee,
      numberOfBathrooms,
      developer,
      readyBy,
      annualCommunityFee,
      isFurnished,
      propertyReferenceId,
      buyerTransferFee,
      sellerTransferFee,
      maintenanceFee,
      occupancyStatus,
      amenities,
      zonedFor,
      approvedBuildUpArea,
      freehold,
      residentialType,
      commercialType,
    } = productBody;

    const isAuctionProduct = createProductStatus === 'LISTING' ? false : true;
    const nonNumericOptionalFields = {
      usageStatus,
      color,
      processor,
      operatingSystem,
      releaseYear,
      regionOfManufacture,
      cameraType,
      material,
      memory,
      landType,
      model,
      isOffer,
      brand,
      isAuctionProduct,
      carType,
      trim,
      regionalSpecs,
      kilometers,
      interiorColor,
      insuredInUae,
      warranty,
      fuelType,
      doors,
      transmissionType,
      seatingCapacity,
      horsepower,
      steeringSide,
      engineCapacity,
      numberOfCylinders,
      driverAssistance,
      entertainment,
      comfort,
      exteriorFeatures,
      emirate,
      numberOfBathrooms,
      developer,
      readyBy,
      isFurnished,
      propertyReferenceId,
      occupancyStatus,
      amenities,
      zonedFor,
      freehold,
      residentialType,
      commercialType,
    };
    let createdProduct: Product;
    try {
      createdProduct = await this.prismaService.product.create({
        data: {
          title,
          categoryId: Number(categoryId),
          description,
          ...(userId ? { userId: Number(userId) } : {}),
          ...(age ? { age: Number(age) } : {}),
          ...(subCategoryId
            ? { subCategoryId: Number(subCategoryId) }
            : { subCategoryId: null }),
          ...(brand ? { brand } : { brand: null }),
          ...(screenSize
            ? { screenSize: Number(screenSize) }
            : { screenSize: null }),
          ...(ramSize ? { ramSize: Number(ramSize) } : { ramSize: null }),
          ...(totalArea
            ? { totalArea: Number(totalArea) }
            : { totalArea: null }),
          ...(numberOfRooms
            ? { numberOfRooms: Number(numberOfRooms) }
            : { numberOfRooms: null }),
          ...(numberOfFloors
            ? { numberOfFloors: Number(numberOfFloors) }
            : { numberOfFloors: null }),
          ...(countryId
            ? { countryId: Number(countryId) }
            : { countryId: null }),
          ...(cityId ? { cityId: Number(cityId) } : { cityId: null }),
          ...(offerAmount ? { offerAmount: Number(offerAmount) } : {}),
          ...(ProductListingPrice
            ? { ProductListingPrice: Number(ProductListingPrice) }
            : {}),
          ...(totalClosingFee
            ? { totalClosingFee: Number(totalClosingFee) }
            : {}),
          ...(annualCommunityFee
            ? { annualCommunityFee: Number(annualCommunityFee) }
            : {}),
          ...(buyerTransferFee
            ? { buyerTransferFee: Number(buyerTransferFee) }
            : {}),
          ...(sellerTransferFee
            ? { sellerTransferFee: Number(sellerTransferFee) }
            : {}),
          ...(maintenanceFee ? { maintenanceFee: Number(maintenanceFee) } : {}),
          ...(approvedBuildUpArea
            ? { approvedBuildUpArea: Number(approvedBuildUpArea) }
            : {}),
          ...nonNumericOptionalFields,
        },
      });
    } catch (error) {
      console.log(error);

      throw new MethodNotAllowedResponse({
        ar: 'خطأ في عملية إضافة المنتج',
        en: 'Something Went Wrong While Adding Your Product',
      });
    }

    try {
      const imagesHolder = [];

      if (images?.length) {
        for (const image of images) {
          const uploadedImage = await this.firebaseService.uploadImage(image);
          imagesHolder.push(uploadedImage);
        }
      }

      if (imagesHolder?.length) {
        for (const image of imagesHolder) {
          const createdImage = await this.prismaService.image.create({
            data: {
              productId: createdProduct.id,
              imageLink: image.fileLink,
              imagePath: image.filePath,
            },
          });
        }
      }
    } catch (error) {
      console.log(error);

      throw new MethodNotAllowedResponse({
        ar: 'خطأ في عملية إضافة الم  تج',
        en: 'Something Went Wrong While Adding Your Product',
      });
    }

    return createdProduct.id;
  }

  private async _updateProduct(
    productId: number,
    productBody: ProductDTO,
    isAuctionProduct?: boolean,
  ) {
    const {
      title,
      model,
      categoryId,
      subCategoryId,
      brand,
      description,
      usageStatus,
      color,
      screenSize,
      processor,
      operatingSystem,
      releaseYear,
      regionOfManufacture,
      ramSize,
      cameraType,
      material,
      memory,
      age,
      totalArea,
      numberOfRooms,
      numberOfFloors,
      landType,
      countryId,
      cityId,
      carType,
      trim,
      regionalSpecs,
      kilometers,
      interiorColor,
      insuredInUae,
      warranty,
      fuelType,
      doors,
      transmissionType,
      seatingCapacity,
      horsepower,
      steeringSide,
      engineCapacity,
      numberOfCylinders,
      driverAssistance,
      entertainment,
      comfort,
      exteriorFeatures,
      emirate,
      totalClosingFee,
      numberOfBathrooms,
      developer,
      readyBy,
      annualCommunityFee,
      isFurnished,
      propertyReferenceId,
      buyerTransferFee,
      sellerTransferFee,
      maintenanceFee,
      occupancyStatus,
      amenities,
      zonedFor,
      approvedBuildUpArea,
      freehold,
      residentialType,
      commercialType,
    } = productBody;

    let updatedProduct: Product;
    try {
      updatedProduct = await this.prismaService.product.update({
        where: { id: productId },
        data: {
          title,
          isAuctionProduct,
          ProductListingPrice: productBody.ProductListingPrice
            ? Number(productBody.ProductListingPrice)
            : undefined,
          categoryId: Number(categoryId),
          description,
          ...(age ? { age: Number(age) } : { age: null }),
          ...(subCategoryId
            ? { subCategoryId: Number(subCategoryId) }
            : { subCategoryId: null }),
          ...(brand ? { brand } : { brand: null }),
          ...(screenSize
            ? { screenSize: Number(screenSize) }
            : { screenSize: null }),
          ...(ramSize ? { ramSize: Number(ramSize) } : { ramSize: null }),
          ...(totalArea
            ? { totalArea: Number(totalArea) }
            : { totalArea: null }),
          ...(numberOfRooms
            ? { numberOfRooms: Number(numberOfRooms) }
            : { numberOfRooms: null }),
          ...(numberOfFloors
            ? { numberOfFloors: Number(numberOfFloors) }
            : { numberOfFloors: null }),
          ...(countryId
            ? { countryId: Number(countryId) }
            : { countryId: null }),
          ...(cityId ? { cityId: Number(cityId) } : { cityId: null }),
          ...(usageStatus
            ? { usageStatus: usageStatus }
            : { usageStatus: null }),
          ...(model ? { model } : { model: null }),
          ...(color ? { color } : { color: null }),
          ...(processor ? { processor } : { processor: null }),
          ...(operatingSystem
            ? { operatingSystem }
            : { operatingSystem: null }),
          ...(releaseYear ? { releaseYear } : { releaseYear: null }),
          ...(regionOfManufacture
            ? { regionOfManufacture }
            : { regionOfManufacture: null }),
          ...(cameraType ? { cameraType } : { cameraType: null }),
          ...(material ? { material } : { material: null }),
          ...(memory ? { memory } : { memory: null }),
          ...(landType ? { landType } : { landType: null }),
          ...(numberOfRooms
            ? { numberOfRooms: Number(numberOfRooms) }
            : { numberOfRooms: null }),
          ...(carType ? { carType } : { carType: null }),
          ...(trim ? { trim } : { trim: null }),
          ...(regionalSpecs ? { regionalSpecs } : { regionalSpecs: null }),
          ...(kilometers ? { kilometers } : { kilometers: null }),
          ...(interiorColor ? { interiorColor } : { interiorColor: null }),
          ...(insuredInUae ? { insuredInUae } : { insuredInUae: null }),
          ...(warranty ? { warranty } : { warranty: null }),
          ...(fuelType ? { fuelType } : { fuelType: null }),
          ...(doors ? { doors } : { doors: null }),
          ...(transmissionType
            ? { transmissionType }
            : { transmissionType: null }),
          ...(seatingCapacity
            ? { seatingCapacity }
            : { seatingCapacity: null }),
          ...(horsepower ? { horsepower } : { horsepower: null }),
          ...(steeringSide ? { steeringSide } : { steeringSide: null }),
          ...(engineCapacity ? { engineCapacity } : { engineCapacity: null }),
          ...(numberOfCylinders
            ? { numberOfCylinders }
            : { numberOfCylinders: null }),
          ...(driverAssistance
            ? { driverAssistance }
            : { driverAssistance: null }),
          ...(entertainment ? { entertainment } : { entertainment: null }),
          ...(comfort ? { comfort } : { comfort: null }),
          ...(exteriorFeatures
            ? { exteriorFeatures }
            : { exteriorFeatures: null }),
          ...(emirate ? { emirate } : { emirate: null }),
          ...(totalClosingFee
            ? { totalClosingFee: Number(totalClosingFee) }
            : { totalClosingFee: null }),
          ...(numberOfBathrooms
            ? { numberOfBathrooms: Number(numberOfBathrooms) }
            : { numberOfBathrooms: null }),
          ...(developer ? { developer } : { developer: null }),
          ...(readyBy ? { readyBy } : { readyBy: null }),
          ...(annualCommunityFee
            ? { annualCommunityFee: Number(annualCommunityFee) }
            : { annualCommunityFee: null }),
          ...(isFurnished ? { isFurnished } : { isFurnished: null }),
          ...(propertyReferenceId
            ? { propertyReferenceId }
            : { propertyReferenceId: null }),
          ...(buyerTransferFee
            ? { buyerTransferFee: Number(buyerTransferFee) }
            : { buyerTransferFee: null }),
          ...(sellerTransferFee
            ? { sellerTransferFee: Number(sellerTransferFee) }
            : { sellerTransferFee: null }),
          ...(maintenanceFee
            ? { maintenanceFee: Number(maintenanceFee) }
            : { maintenanceFee: null }),
          ...(occupancyStatus
            ? { occupancyStatus }
            : { occupancyStatus: null }),
          ...(amenities ? { amenities } : { amenities: null }),
          ...(zonedFor ? { zonedFor } : { zonedFor: null }),
          ...(approvedBuildUpArea
            ? { approvedBuildUpArea: Number(approvedBuildUpArea) }
            : { approvedBuildUpArea: null }),
          ...(freehold ? { freehold } : { freehold: null }),
          ...(residentialType
            ? { residentialType }
            : { residentialType: null }),
          ...(commercialType ? { commercialType } : { commercialType: null }),
        },
      });
    } catch (error) {
      console.log(error);

      throw new MethodNotAllowedResponse({
        ar: 'خطأ في عملية إضافة المنتج',
        en: 'Something Went Wrong While Adding Your Product',
      });
    }

    return updatedProduct.id;
  }

  async _checkAuctionExpiredOrReturn(auctionId: number) {
    const auction = await this.checkAuctionExistanceAndReturn(auctionId);
    if (auction.status === AuctionStatus.EXPIRED)
      throw new MethodNotAllowedResponse({
        en: 'Auction has been Expired',
        ar: 'تم غلق الاعلان',
      });

    return auction;
  }

  async _checkAuctionAvailabiltyForSubmittingOrReturn(auctionId: number) {
    const auction = await this.checkAuctionExistanceAndReturn(auctionId);
    if (auction.status !== AuctionStatus.ACTIVE)
      throw new MethodNotAllowedResponse({
        en: 'Auction has been Expired',
        ar: 'تم غلق الاعلان',
      });

    return auction;
  }

  async _isAuctionHasBidders(auctionId: number) {
    const hasBidders = await this.prismaService.bids.findFirst({
      where: { auctionId },
    });
    if (!hasBidders) return false;

    return true;
  }

  async _findLatestBidForAuction(auctionId: number) {
    const maxBid = await this.prismaService.bids.findFirst({
      where: { auctionId },
      orderBy: { amount: 'desc' },
    });
    return maxBid?.amount;
  }
}
