import { Injectable, MethodNotAllowedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationService } from '../../common/services/pagination.service';
import {
  AuctionCreationDTO,
  GetAuctionsByOwnerDTO,
  GetAuctionsDTO,
  GetJoinAuctionsDTO,
  PaginationDTO,
  ProductDTO,
} from '../dtos';
import { FirebaseService } from 'src/firebase/firebase.service';
import {
  Auction,
  AuctionStatus,
  AuctionType,
  DurationUnits,
  JoinedAuctionStatus,
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
// import { Decimal } from '@prisma/client/runtime';
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

@Injectable()
export class UserAuctionsService {
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
  ) {}

  // TODO: Add price field in product table and when user select isallowedPayment set price =acceptedAmount
  async createPendingAuction(
    userId: number,
    auctionCreationBody: AuctionCreationDTO,
    images: Express.Multer.File[],
  ) {
    if (images.length < 3)
      throw new MethodNotAllowedResponse({
        ar: 'من فضلك قم برفع من ثلاث الي خمس صور',
        en: 'Please Upload From 3 To 5 Photos',
      });

    // Check user can create auction (hasCompleteProfile)
    await this.auctionsHelper._userHasCompleteProfile(userId);

    const { type, durationUnit, startDate, product } = auctionCreationBody;

    // Create Product
    const productId = await this._createProduct(product, images);

    // Create Auction
    switch (durationUnit) {
      case DurationUnits.DAYS:
        if (type === AuctionType.ON_TIME) {
          // Create ON_TIME Daily auction
          return await this._createOnTimeDailyAuction(
            userId,
            productId,
            auctionCreationBody,
          );
        } else if (type === AuctionType.SCHEDULED) {
          // Create Schedule Daily auction
          return await this._createScheduleDailyAuction(
            userId,
            productId,
            auctionCreationBody,
          );
        }
        break;

      case DurationUnits.HOURS:
        if (type === AuctionType.ON_TIME) {
          // Create ON_TIME hours auction
          return await this._createOnTimeHoursAuction(
            userId,
            productId,
            auctionCreationBody,
          );
        } else if (type === AuctionType.SCHEDULED) {
          // Create Schedule hours auction
          return await this._createScheduleHoursAuction(
            userId,
            productId,
            auctionCreationBody,
          );
        }
        break;
    }
  }
  async createDraftAuction(
    userId: number,
    productDTO: ProductDTO,
    images: Express.Multer.File[],
  ) {
    // Check user can create auction (hasCompleteProfile)
    await this.auctionsHelper._userHasCompleteProfile(userId);

    // Create Product
    const productId = await this._createProduct(productDTO, images);

    // Create Auction
    return await this.prismaService.auction.create({
      data: {
        userId,
        productId,
        status: AuctionStatus.DRAFTED,
      },
    });
  }

  async updateAuctionForCancellation(auctionId: number, userId: number) {
    try {
      const auction = await this.prismaService.auction.findUnique({
        where: { id: auctionId },
        include: {
          product: {
            include: { images: true },
          },
          user: true,
        },
      });
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

        let isSellerPaymentCaptured: any;
        if (sellerSecurityDeposit.isWalletPayment) {
          isSellerPaymentCaptured =
            sellerSecurityDeposit.status === 'SUCCESS' ? true : false;
        } else {
          isSellerPaymentCaptured =
            await this.stripeService.captureDepositPaymentIntent(
              sellerSecurityDeposit.paymentIntentId,
            );
          //find the last transaction balane of the alletre
          const lastBalanceOfAlletre =
            await this.walletService.findLastTransactionOfAlletre();
          //tranfering data for the alletre fees
          const alletreWalletData = {
            status: WalletStatus.DEPOSIT,
            transactionType: WalletTransactionType.By_AUCTION,
            description: `Due to seller cancelled the auction ${
              auction.status === 'ACTIVE' ? 'before' : 'after'
            } expiry date.`,
            amount: Number(isSellerPaymentCaptured.amount) / 100, // Convert from cents to dollars
            auctionId: Number(auctionId),
            balance: lastBalanceOfAlletre
              ? Number(lastBalanceOfAlletre) +
                Number(isSellerPaymentCaptured.amount) / 100
              : Number(isSellerPaymentCaptured.amount) / 100, // Convert from cents to dollars
          };
          await this.walletService.addToAlletreWallet(
            userId,
            alletreWalletData,
          );
        }

        //find highest Bidder
        if (isSellerPaymentCaptured) {
          //send mail to seller
          const body = {
            subject: 'Auction Cancelled',
            title: 'Your acution is cancelled',
            Product_Name: auction.product.title,
            img: auction.product.images[0].imageLink,
            message: ` Hi ${auction.user.userName}, 
                Your Acution of ${auction.product.title}
                (Model:${auction.product.model})
                has been successfully cancelled. 
                You have lost your security deposit due to there are bidders on your auction.
                If you would like to do another auction, 
                Please click the button below. Thank you. `,
            Button_text: 'Click here to create another Auction',
            Button_URL: process.env.FRONT_URL,
          };
          //calling send email function
          await this.emailService.sendEmail(
            auction.user.email,
            'token',
            EmailsType.OTHER,
            body,
          );

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

          BiddersPaymentData?.map(async (data) => {
            if (data.userId === highestBidderId) {
              highestBidderSecurityDeposit = Number(data.amount);
            }
            //send email to bidders
            const body = {
              subject: 'Auction Cancelled',
              title: 'Your acution is cancelled',
              Product_Name: auction.product.title,
              img: auction.product.images[0].imageLink,
              message: ` Hi, ${data.user.userName}, 
                            We are really sorry to say that your Acution of ${
                              auction.product.title
                            }
                          (Model:${auction.product.model})
                          has been cancelled by the owner of the product. 
                          Your Security Deposit has been sent back to your ${
                            data.isWalletPayment ? 'wallet.' : 'banck account.'
                          } 
                            ${
                              data?.user.id === highestBidderId
                                ? 'And also you will get a compansation to your wallet due to you are the highest Bidder.'
                                : ''
                            }. 
                          If you would like to do another auction, 
                          Please click the button below. Thank you. `,
              Button_text: 'Click here to create another Auction',
              Button_URL: process.env.FRONT_URL,
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
                  description: `Due to seller cancelled the auction ${
                    auction.status === 'ACTIVE' ? 'before' : 'after'
                  } expiry date.`,
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
                  description: `Due to seller cancelled the auction ${
                    auction.status === 'ACTIVE' ? 'before' : 'after'
                  } expiry date.`,
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
                await this.emailService.sendEmail(
                  data.user.email,
                  'token',
                  EmailsType.OTHER,
                  body,
                );
              }
            } else if (
              auction.status === 'WAITING_FOR_PAYMENT' &&
              data.userId === highestBidderId
            ) {
              console.log('Auction cancellation with bidders AFTER expiry');

              await this.emailService.sendEmail(
                data.user.email,
                'token',
                EmailsType.OTHER,
                body,
              );
            }
          });

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
            description: `Due to seller cancelled the auction ${
              auction.status === 'ACTIVE' ? 'before' : 'after'
            } expiry date.`,
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
            description: `Due to seller cancelled the auction ${
              auction.status === 'ACTIVE' ? 'before' : 'after'
            } expiry date.`,
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
              );

              //transfer to the  alletre wallet

              await this.walletService.addToAlletreWallet(
                userId,
                alletreWalletData,
              );

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
          return {
            success: true,
            message: 'You have successfully cancelled the auction.',
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
                include: { images: true },
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
          if (sellerPaymentData.isWalletPayment) {
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
              description: `Due to you cancelled the auction ${
                auction.status === 'ACTIVE' ? 'before' : 'after'
              } expiry date.`,
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
              description: `Due to seller cancelled the auction ${
                auction.status === 'ACTIVE' ? 'before' : 'after'
              } expiry date.`,
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
          } else {
            console.log(
              'security deposit of this cancelled auciton is via STRIPE',
            );
            isSendBackS_D = await this.stripeService.cancelDepositPaymentIntent(
              sellerPaymentData.paymentIntentId,
            );
          }
          if (isSendBackS_D) {
            //Email Data
            const body = {
              subject: 'Auction Cancelled',
              title: 'Your acution is cancelled',
              Product_Name: updatedDataOfCancellAuction.product.title,
              img: updatedDataOfCancellAuction.product.images[0].imageLink,
              message: ` Hi ${updatedDataOfCancellAuction.user.userName}, 
                          Your Acution of ${
                            updatedDataOfCancellAuction.product.title
                          }
                         (Model:${updatedDataOfCancellAuction.product.model})
                         has been successfully cancelled. 
                         Your Security Deposit has been sent back to your ${
                           sellerPaymentData.isWalletPayment
                             ? 'wallet.'
                             : 'account.'
                         } . 
                         If you would like to do another auction, 
                         Please click the button below. Thank you. `,
              Button_text: 'Click here to create another Auction',
              Button_URL: process.env.FRONT_URL,
            };
            //calling send email function
            await this.emailService.sendEmail(
              updatedDataOfCancellAuction.user.email,
              'token',
              EmailsType.OTHER,
              body,
            );
          }
          return {
            success: true,
            message: 'You have successfully cancelled your auction.',
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
  ) {
    const auction = await this.checkAuctionExistanceAndReturn(auctionId);

    this.auctionStatusValidator.isActionValidForAuction(
      auction,
      AuctionActions.AUCTION_UPDATE,
    );
    // await this.auctionsHelper._isAuctionValidForUpdate(auctionId);

    const { type, durationUnit, startDate, product } = auctionCreationDTO;

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

    const userAuctions = await this.prismaService.auction.findMany({
      skip: skip,
      take: limit,
      where: {
        userId: userId,
        ...(status ? { status: status } : {}),
        ...(type ? { type } : {}),
      },
      include: {
        product: {
          include: {
            category: true,
            brand: true,
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

    const userOwensAuctionsCount = await this.prismaService.auction.count({
      where: {
        userId: userId,
        ...(status ? { status: status } : {}),
        ...(type ? { type } : {}),
      },
    });

    const pagination = this.paginationService.getPagination(
      userOwensAuctionsCount,
      page,
      perPage,
    );

    return { userAuctions, pagination };
  }

  async findAuctionsAnalyticsForOwner(userId: number) {
    const count = await this.prismaService.auction.count({ where: { userId } });
    const auctionsGrouping = await this.prismaService.auction.groupBy({
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
            brand: true,
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
    // console.log('===>3',roles);
    // console.log('===>4',getAuctionsDTO);
    // console.log('===>5',userId);

    const {
      page = 1,
      perPage = 10,
      brands,
      categories,
      countries,
      priceFrom,
      priceTo,
      sellingType,
      usageStatus,
      title,
      auctionStatus,
    } = getAuctionsDTO;
    // here all data of the getAuctionDTO will come when we do a search and filter in home screen
    // console.log( '===>', page ,perPage ,brands,categories,countries,priceFrom,priceTo,sellingType,usageStatus,title, auctionStatus,);

    const { limit, skip } = this.paginationService.getSkipAndLimit(
      Number(page),
      Number(perPage),
    );

    const productFilter = this.auctionsHelper._productFilterApplied({
      brands,
      categories,
      usageStatus,
      title,
    });

    const auctionFilter = this.auctionsHelper._auctionFilterApplied({
      priceFrom,
      priceTo,
      countries,
      sellingType,
    });

    const auctions = await this.prismaService.auction.findMany({
      where: {
        ...(auctionStatus
          ? { status: auctionStatus }
          : {
              status: {
                in: [AuctionStatus.ACTIVE, AuctionStatus.IN_SCHEDULED],
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
        IsReturnPolicy: true,
        returnPolicyDescription: true,
        IsWarranty: true,
        warrantyPolicyDescription: true,

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
        ...(auctionStatus
          ? { status: auctionStatus }
          : {
              status: {
                in: [AuctionStatus.ACTIVE, AuctionStatus.IN_SCHEDULED],
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
        IsReturnPolicy: true,
        returnPolicyDescription: true,
        IsWarranty: true,
        warrantyPolicyDescription: true,
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
        IsReturnPolicy: true,
        returnPolicyDescription: true,
        IsWarranty: true,
        warrantyPolicyDescription: true,
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
        IsReturnPolicy: true,
        returnPolicyDescription: true,
        IsWarranty: true,
        warrantyPolicyDescription: true,
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
  async findUpCommingAuctionsForUser(
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

    console.log(startOfToday);

    const auctions = await this.prismaService.auction.findMany({
      where: {
        status: AuctionStatus.IN_SCHEDULED,
        startDate: { gte: startOfToday },
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
        IsReturnPolicy: true,
        returnPolicyDescription: true,
        IsWarranty: true,
        warrantyPolicyDescription: true,
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
        status: AuctionStatus.IN_SCHEDULED,
        startDate: { gte: startOfToday },
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
        IsReturnPolicy: true,
        returnPolicyDescription: true,
        IsWarranty: true,
        warrantyPolicyDescription: true,
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
    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
      include: {
        product: {
          include: {
            category: true,
            brand: true,
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

    const resultAuction = await this.auctionsHelper._injectIsSavedKeyToAuction(
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
            brand: true,
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
      return { kycStatus: false, errorMessage: error.message };
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
      console.log('test withdrawal request : ', amount);
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
        message: error.message || 'Failed to process withdrawal request',
      };
    }
  }
  async payToPublish(
    userId: number,
    auctionId: number,
    amount?: number,
    isWalletPayment?: boolean,
  ) {
    await this.auctionsHelper._isAuctionOwner(userId, auctionId);
    const auction = await this.checkAuctionExistanceAndReturn(auctionId);

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

    if (!isWalletPayment) {
      return await this.paymentService.payDepositBySeller(
        user,
        auctionId,
        sellerMainLocation.country.currency,
        Number(auctionCategory.sellerDepositFixedAmount),
      );
    } else {
      return await this.paymentService.walletPayDepositBySeller(
        user,
        auctionId,
        // sellerMainLocation.country.currency,
        amount,
      );
    }
  }

  async payDepositByBidder(
    userId: number,
    auctionId: number,
    bidAmount: number,
    isWalletPayment?: boolean,
    amount_forWalletPay?: number,
  ) {
    console.log('payDepositByBidder test 1', bidAmount);

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
    const isAuctionHasBidders = await this._isAuctionHasBidders(auctionId);
    if (isAuctionHasBidders) {
      latestBidAmount = await this._findLatestBidForAuction(auctionId);
      if (latestBidAmount >= new Prisma.Decimal(bidAmount))
        throw new MethodNotAllowedResponse({
          ar: 'قم برفع السعر',
          en: 'Bid Amount Must Be Greater Than Current Amount1',
        });
    } else {
      latestBidAmount = auction.startBidAmount;
      if (latestBidAmount >= new Prisma.Decimal(bidAmount))
        throw new MethodNotAllowedResponse({
          ar: 'قم برفع السعر',
          en: 'Bid Amount Must Be Greater Than Current Amount2',
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
    if (!isWalletPayment) {
      return await this.paymentService.payDepositByBidder(
        user,
        auctionId,
        bidderMainLocation.country.currency,
        Number(auctionCategory.bidderDepositFixedAmount),
        bidAmount,
      );
    } else {
      return await this.paymentService.walletPayDepositByBidder(
        user,
        auctionId,
        // bidderMainLocation.country.currency,
        // Number(auctionCategory.bidderDepositFixedAmount),
        amount_forWalletPay,
        bidAmount,
      );
    }
  }

  async submitBidForAuction(
    userId: number,
    auctionId: number,
    bidAmount: number,
  ) {
    const auction = await this.checkAuctionExistanceAndReturn(auctionId);

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

    // Validate CurrentBidAmount with bidAmount if there is no bidders else validate with latest bidAmount
    let latestBidAmount: Decimal;
    const isAuctionHasBidders = await this._isAuctionHasBidders(auctionId);
    if (isAuctionHasBidders) {
      latestBidAmount = await this._findLatestBidForAuction(auctionId);
      if (latestBidAmount >= new Prisma.Decimal(bidAmount))
        throw new MethodNotAllowedResponse({
          ar: 'قم برفع السعر',
          en: 'Bid Amount Must Be Greater Than Current Amount3',
        });
    } else {
      latestBidAmount = auction.startBidAmount;
      if (latestBidAmount >= new Prisma.Decimal(bidAmount))
        throw new MethodNotAllowedResponse({
          ar: 'قم برفع السعر',
          en: 'Bid Amount Must Be Greater Than Current Amount4',
        });
    }

    // Create new bid
    await this.prismaService.bids.create({
      data: { userId, auctionId, amount: bidAmount },
    });

    // Get totalBids after my bid
    const totalBids = await this.prismaService.bids.count({
      where: { auctionId },
    });

    // emit to all biders using socket instance
    this.bidsWebSocketGateway.userSubmitBidEventHandler(
      auctionId,
      new Prisma.Decimal(bidAmount),
      totalBids,
    );
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
            product: {
              include: {
                category: true,
                brand: true,
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

    if (!isWalletPayment) {
      return await this.paymentService.payAuctionByBidder(
        user,
        auctionId,
        userMainLocation.country.currency,
        Number(latestBidAmount),
      );
    } else {
      return await this.paymentService.payAuctionByBidderWithWallet(
        user,
        auctionId,
        // userMainLocation.country.currency,
        Number(latestBidAmount),
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
    if (!isWalletPayment) {
      return await this.paymentService.createBuyNowPaymentTransaction(
        user,
        auctionId,
        userMainLocation.country.currency,
        Number(auction.acceptedAmount),
      );
    } else {
      // need to crete the createBuyNowPaymentTransaction for wallet
      return await this.paymentService.createBuyNowPaymentTransactionWallet(
        user,
        auctionId,
        // userMainLocation.country.currency,
        Number(auction.acceptedAmount),
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
          },
        },
        Payment: { select: { createdAt: true, type: true } },
        _count: { select: { bids: true } },
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
      if (auction.userId === winnerId)
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
      });
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
          user: true,
          auction: { include: { product: { include: { images: true } } } },
        },
      });
      console.log('sellerPaymentData :', sellerPaymentData);
      let isSellerDepositSendBack: any = false;
      //checking if seller deposit is through wallet or not
      if (!sellerPaymentData.isWalletPayment) {
        //if not through wallet (which means through stripe) then cancell the payment intent
        isSellerDepositSendBack =
          await this.stripeService.cancelDepositPaymentIntent(
            sellerPaymentData.paymentIntentId,
          );
      } else {
        // const lastWalletTransactionBalance = await this.walletService.findLastTransaction(auction.userId)
        // const lastWalletTransactionAlletre = await this.walletService.findLastTransactionOfAlletre()
        const [lastWalletTransactionBalance, lastWalletTransactionAlletre] =
          await Promise.all([
            this.walletService.findLastTransaction(auction.userId),
            this.walletService.findLastTransactionOfAlletre(),
          ]);
        //if  through wallet then return the deposit to the seller wallet
        const sellerReturnSecurityDepositWalletData = {
          status: WalletStatus.DEPOSIT,
          transactionType: WalletTransactionType.By_AUCTION,
          description:
            'Return Security deposit due to winner confirmed the delivery',
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
            'Return Security deposit of seller due to winner confirmed the delivery',
          amount: Number(sellerPaymentData.amount),
          auctionId: Number(auctionId),
          balance:
            Number(lastWalletTransactionAlletre) -
            Number(sellerPaymentData.amount),
        };
        //  const sellerWalletCreationData = await this.walletService.create(auction.userId, sellerReturnSeucurityDepositWalletData);
        //  const alletreWalletCreationData = await this.walletService.addToAlletreWallet(auction.userId,walletDataToAlletreWhenRetrunSecurityDepositToSeller)
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

      if (isSellerDepositSendBack) {
        const auctionWinnerBidAmount = await this._findLatestBidForAuction(
          auctionWinner.auctionId,
        );

        const feesAmountOfAlletre = (Number(auctionWinnerBidAmount) * 10) / 100;
        const amountToSellerWallet =
          Number(auctionWinnerBidAmount) - feesAmountOfAlletre;

        // const lastWalletTransactionBalance = await this.walletService.findLastTransaction(auction.userId)
        // const lastWalletTransactionAlletre = await this.walletService.findLastTransactionOfAlletre()

        const [lastWalletTransactionBalance, lastWalletTransactionAlletre] =
          await Promise.all([
            this.walletService.findLastTransaction(auction.userId),
            this.walletService.findLastTransactionOfAlletre(),
          ]);
        const walletData = {
          status: WalletStatus.DEPOSIT,
          transactionType: WalletTransactionType.By_AUCTION,
          description: 'Auction full payment',
          amount: Number(amountToSellerWallet),
          auctionId: Number(auctionId),
          balance: lastWalletTransactionBalance
            ? Number(lastWalletTransactionBalance) +
              Number(amountToSellerWallet)
            : Number(amountToSellerWallet),
        };

        const walletDataToAlletre = {
          status: WalletStatus.WITHDRAWAL,
          transactionType: WalletTransactionType.By_AUCTION,
          description: 'Send Auction full payment after deduct the fees',
          amount: Number(amountToSellerWallet),
          auctionId: Number(auctionId),
          balance:
            Number(lastWalletTransactionAlletre) - Number(amountToSellerWallet),
        };

        const [
          walletCreationData,
          confirmDeliveryResult,
          alletreWalletCreationData,
        ] = await this.prismaService.$transaction(async (prisma) => {
          //full amount to seller wallet after duducting the fees
          const walletCreationData = await this.walletService.create(
            auction.userId,
            walletData,
          );

          //sending the full amount from alle tre wallet to seller wallet
          //(due to  buyer pay the full amount, it has already in the alletre wallet )
          const alletreWalletCreationData =
            await this.walletService.addToAlletreWallet(
              auction.userId,
              walletDataToAlletre,
            );
          const confirmDeliveryResult = await prisma.joinedAuction.update({
            where: { id: auctionWinner.id },
            data: { status: JoinedAuctionStatus.COMPLETED },
            include: { user: true },
          });

          return Promise.all([
            walletCreationData,
            confirmDeliveryResult,
            alletreWalletCreationData,
          ]);
        });
        if (
          walletCreationData &&
          confirmDeliveryResult &&
          alletreWalletCreationData
        ) {
          console.log(
            'sending email to seller and bidder after delivery confirmation',
          );
          //sending email to seller and bidder after delivery confirmation
          const emailBodyToSeller = {
            subject: 'Delivery successful',
            title: 'Your Auction winner has confirmed the delivery',
            Product_Name: sellerPaymentData.auction.product.title,
            img: sellerPaymentData.auction.product.images[0].imageLink,
            message: ` Hi, ${sellerPaymentData.user.userName}, 
                   Thank you for choosing Alle Tre Auction. The winner of your Auction of ${sellerPaymentData.auction.product.title}
                   (Model:${sellerPaymentData.auction.product.model}) has been Confrimed the delivery. 
                   The money paid by the winner will be creadited to Alle Tre wallet and the security deposite will be send back to you bank account. 
                   From the wallet either you can withdraw the money to your bank account or you can keep it in the wallet and can continue the Auction. 
                   If you would like to Participate another auction, Please click the button below. Thank you. `,
            Button_text: 'Click here to create another Auction',
            Button_URL: process.env.FRONT_URL,
          };
          const emailBodyToWinner = {
            subject: 'Delivery successful',
            title: 'Delivery successful',
            Product_Name: sellerPaymentData.auction.product.title,
            img: sellerPaymentData.auction.product.images[0].imageLink,
            message: ` Hi, ${confirmDeliveryResult.user.userName}, 
                   Thank you for choosing Alle Tre Auction. You have successfully confirmed the delivery of Auction of ${sellerPaymentData.auction.product.title}
                   (Model:${sellerPaymentData.auction.product.model}). 
                    We would like to thank you and appreciate you for choosing Alle Tre. If you would like to participate another auction, Please click the button below. Thank you. `,
            Button_text: 'Click here to create another Auction',
            Button_URL: process.env.FRONT_URL,
          };
          await Promise.all([
            this.emailService.sendEmail(
              sellerPaymentData.user.email,
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

  async deleteAuctionImage(auctionId: number, imageId: number) {
    await this.auctionsHelper._isAuctionValidForUpdate(auctionId);

    await this.auctionsHelper._isImageRelatedToAuction(auctionId, imageId);
    try {
      await this.prismaService.image.delete({ where: { id: imageId } });
    } catch (error) {
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في عملية حذف الصورة',
        en: 'Something went wrong while deleting your image',
      });
    }
  }

  async uploadImageForAuction(auctionId: number, image: Express.Multer.File) {
    // Check auction validation for update
    await this.auctionsHelper._isAuctionValidForUpdate(auctionId);

    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
      include: { product: { include: { images: true } } },
    });

    // Check auction images validation
    if (auction.product.images.length >= 5)
      throw new MethodNotAllowedResponse({
        ar: 'لا يمكنك إضافة الصورة',
        en: 'You Can Not Upload Image, You have been uploaded 5 images',
      });

    try {
      // Upload Image to firebase
      const { filePath, fileLink } = await this.firebaseService.uploadImage(
        image,
      );
      // Upload new image
      await this.prismaService.image.create({
        data: {
          imageLink: fileLink,
          imagePath: filePath,
          productId: auction.productId,
        },
      });
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
  ) {
    const {
      title,
      model,
      categoryId,
      subCategoryId,
      brandId,
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
      age,
      totalArea,
      numberOfRooms,
      numberOfFloors,
      landType,
      countryId,
      cityId,
      isOffer,
      offerAmount,
    } = productBody;

    console.log('offer price :', offerAmount, 'isoffer:', isOffer);
    const nonNumericOptionalFields = {
      usageStatus,
      color,
      processor,
      operatingSystem,
      releaseYear,
      regionOfManufacture,
      cameraType,
      material,
      landType,
      model,
      isOffer,
    };

    let createdProduct: Product;
    try {
      createdProduct = await this.prismaService.product.create({
        data: {
          title,
          categoryId: Number(categoryId),
          description,
          ...(age ? { age: Number(age) } : {}),
          ...(subCategoryId ? { subCategoryId: Number(subCategoryId) } : {}),
          ...(brandId ? { brandId: Number(brandId) } : {}),
          ...(screenSize ? { screenSize: Number(screenSize) } : {}),
          ...(ramSize ? { ramSize: Number(ramSize) } : {}),
          ...(totalArea ? { totalArea: Number(totalArea) } : {}),
          ...(numberOfRooms ? { numberOfRooms: Number(numberOfRooms) } : {}),
          ...(numberOfFloors ? { numberOfFloors: Number(numberOfFloors) } : {}),
          ...(countryId ? { countryId: Number(countryId) } : {}),
          ...(cityId ? { cityId: Number(cityId) } : {}),
          ...(offerAmount ? { offerAmount: Number(offerAmount) } : {}),
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
        imagesHolder.forEach(async (image) => {
          await this.prismaService.image.create({
            data: {
              productId: createdProduct.id,
              imageLink: image.fileLink,
              imagePath: image.filePath,
            },
          });
        });
      }
    } catch (error) {
      console.log(error);

      throw new MethodNotAllowedResponse({
        ar: 'خطأ في عملية إضافة المنتج',
        en: 'Something Went Wrong While Adding Your Product',
      });
    }

    return createdProduct.id;
  }

  private async _updateProduct(productId: number, productBody: ProductDTO) {
    const {
      title,
      model,
      categoryId,
      subCategoryId,
      brandId,
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
      age,
      totalArea,
      numberOfRooms,
      numberOfFloors,
      landType,
      countryId,
      cityId,
    } = productBody;

    let updatedProduct: Product;
    try {
      updatedProduct = await this.prismaService.product.update({
        where: { id: productId },
        data: {
          title,
          categoryId: Number(categoryId),
          description,
          ...(age ? { age: Number(age) } : { age: null }),
          ...(subCategoryId
            ? { subCategoryId: Number(subCategoryId) }
            : { subCategoryId: null }),
          ...(brandId ? { brandId: Number(brandId) } : { brandId: null }),
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
          ...(landType ? { landType } : { landType: null }),
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
