import { Injectable } from '@nestjs/common';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { MethodNotAllowedResponse } from 'src/common/errors';
import { Prisma } from '@prisma/client';
import { CreateWalletDtoFromAdminSide } from './dto/createWalletDtoFromAdminside';
@Injectable()
export class WalletService {
  constructor(private prismaSevice: PrismaService) {}
  async create(
    userId: number,
    createWalletData: CreateWalletDto,
    prismaClient?: Prisma.TransactionClient,
  ) {
    let result: any;
    try {
      const roundedAmount = Number(Number(createWalletData.amount).toFixed(2));
      const roundedBalance = Number(Number(createWalletData.balance).toFixed(2));
      console.log('wallet.service is called', createWalletData);
      const prisma = prismaClient || this.prismaSevice;
      result = await prisma.wallet.create({
        data: {
          userId,
          description: createWalletData.description,
          amount: roundedAmount,
          status: createWalletData.status,
          transactionType: createWalletData.transactionType,
          auctionId: createWalletData.auctionId,
          purchaseId: createWalletData.purchaseId,
          balance: roundedBalance,
        },
      });
      console.log('the create wallet transaction result : ==>', result);
    } catch (error) {
      console.log('create wallet error :', error);
      throw new MethodNotAllowedResponse({
        ar: 'لقد حدث خطأ ما أثناء إجراء معاملتك',
        en: 'Something went wrong while processing your transaction.',
      });
    }
    return result;
  }

  async addToUserWalletByAdmin(
    createWalletData: any,
  ) {
    let result: any;
    try {
      const roundedAmount = Number(Number(createWalletData.amount).toFixed(2));
      console.log('addToUserWalletByAdmin is called', createWalletData);

      await this.prismaSevice.$transaction(async (prisma)=>{
        const lastUserWalletBalance =await this.findLastTransaction(createWalletData.userId, prisma) 
        const newBalanceToUserWallet = createWalletData.status === 'WITHDRAWAL' ?
          Number(lastUserWalletBalance) - Number(createWalletData.amount) :
          Number(lastUserWalletBalance) + Number(createWalletData.amount) 
        const roundedBalance = Number(Number(newBalanceToUserWallet).toFixed(2));
        result = await prisma.wallet.create({
          data: {
            userId: createWalletData.userId,
            description: createWalletData.description,
            amount: roundedAmount,
            status: createWalletData.status,
            transactionType: 'By_AUCTION',
            auctionId: createWalletData.auctionId ? createWalletData.auctionId : null,
            purchaseId: createWalletData.purchaseId,
            balance: roundedBalance,
          },
        });

        if(createWalletData.adminChanges){
          //here based on this condition, we are deduct or add money of admin wallet
          const lastAlletreWalletBalance = await this.findLastTransactionOfAlletre(prisma)
          //here we check the status === WITHDRAWAL , it is status of user trasaction
          //if the admin  WITHDRAW money, then it is need to add in to alletre wallet
          const newBalanceToUserWallet = createWalletData.status === 'WITHDRAWAL' ?
            Number(lastAlletreWalletBalance) + Number(createWalletData.amount) :
            Number(lastAlletreWalletBalance) - Number(createWalletData.amount) 
          const roundedBalance = Number(Number(newBalanceToUserWallet).toFixed(2));
          const createWalletDataForAdmin = {
            userId: createWalletData.userId,
            description: createWalletData.description,
            amount: roundedAmount,
            status: createWalletData.status === 'WITHDRAWAL' ? 'DEPOSIT' :'WITHDRAWAL',
            transactionType: 'By_AUCTION',
            auctionId: createWalletData.auctionId ? createWalletData.auctionId : null,
            purchaseId: createWalletData.purchaseId,
            balance: roundedBalance,
          }
           await this.addToAlletreWalletByAdmin(createWalletData.userId, createWalletDataForAdmin)
      }
      })

      
      console.log('the create wallet transaction result : ==>', result);
    } catch (error) {
      console.log('create wallet error :', error);
      throw new MethodNotAllowedResponse({
        ar: 'لقد حدث خطأ ما أثناء إجراء معاملتك',
        en: 'Something went wrong while processing your transaction.',
      });
    }
    return result;
  }

  //add to alletre wallet(Note : here we add user id to understand from whose mone came to wallet)
  async addToAlletreWallet(
    userId: number,
    createWalletData: CreateWalletDto,
    prismaClient?: Prisma.TransactionClient,
  ) {
    let result: any;
    try {
      const prisma = prismaClient || this.prismaSevice;
      const roundedAmount = Number(Number(createWalletData.amount).toFixed(2));
      const roundedBalance = Number(Number(createWalletData.balance).toFixed(2));
      result = await prisma.alletreWallet.create({
        data: {
          userId,
          description: createWalletData.description,
          amount: roundedAmount,
          status: createWalletData.status,
          transactionType: createWalletData.transactionType,
          auctionId: createWalletData.auctionId,
          purchaseId: createWalletData.purchaseId,
          balance: roundedBalance,
          transactionReference: createWalletData?.transactionReference
        },
      });
    } catch (error) {
      console.log(error);
      throw new MethodNotAllowedResponse({
        ar: 'لقد حدث خطأ ما أثناء إجراء معاملتك',
        en: 'Something went wrong while processing your transaction.',
      });
    }
    return result;
  }



  async addToAlletreWalletByAdmin(
    userId: number,
    createWalletData: any,
  ) {
    let result: any;
    try {
      console.log('wallet.service is called admin', createWalletData);

      const roundedAmount = Number(Number(createWalletData.amount).toFixed(2));
      await this.prismaSevice.$transaction(async (prisma)=>{
        
        const lastAdminWalletBalance = await this.findLastTransactionOfAlletre(prisma)
        const newBalanceToAlletre = createWalletData.status === 'WITHDRAWAL' ?
          Number(lastAdminWalletBalance) - Number(createWalletData.amount) :
          Number(lastAdminWalletBalance) + Number(createWalletData.amount) 
        const roundedBalance = Number(Number(newBalanceToAlletre).toFixed(2));
        result = await prisma.alletreWallet.create({
          data: {
            userId,
            description: createWalletData.description,
            amount: roundedAmount,
            status: createWalletData.status,
            transactionType: 'By_AUCTION',
            auctionId: createWalletData.auctionId ? createWalletData.auctionId : null,
            purchaseId: createWalletData.purchaseId,
            balance:createWalletData.balace ? createWalletData.balace : roundedBalance,
            transactionReference: createWalletData?.transactionReference
          },
        });
      })
    
   
    } catch (error) {
      console.log(error);
      throw new MethodNotAllowedResponse({
        ar: 'لقد حدث خطأ ما أثناء إجراء معاملتك',
        en: 'Something went wrong while processing your transaction.',
      });
    }
    return result;
  }

  async findAdminProfitData(){
    let result: any;
    try {
    
      const [profitData, totalProfit] = await this.prismaSevice.$transaction([
        this.prismaSevice.profit.findMany({
          orderBy: { createdAt: 'desc' }, // optional
        }),
        this.prismaSevice.profit.aggregate({
          _sum: {
            amount: true,
          },
        }),
      ]);
      
      return {
        profitData,
        totalAmount: totalProfit._sum.amount || 0,
      };

    } catch (error) {
      console.log(error);
      throw new MethodNotAllowedResponse({
        ar: 'لقد حدث خطأ ما أثناء إجراء معاملتك',
        en: 'Something went wrong while processing your transaction.',
      });
    }
    return result;
  }

  async findAll(userId: number) {
    const walletData = await this.prismaSevice.wallet.findMany({
      where: { userId },
      include:{
        user: true,
        auction:{
          include:{
            product:{include:{images:true}}
          }
        }
      },
      orderBy: {id:'desc'}
    });

    const one = await this.prismaSevice.wallet.findFirst({
      where:{id:521}
    })
    // console.log('wallet data :',walletData)
    // let balance = walletData[walletData.length-1]
    console.log('walletDataof1',one)
    return walletData;
  }

  async findAllAdminWalletDetails() {
    const walletData = await this.prismaSevice.alletreWallet.findMany({
      include:{
        user: true,
        auction:{
          include:{
            product:{include:{images:true}}
          }
        }
      }
    });
    // console.log('wallet data :',walletData)
    // let balance = walletData[walletData.length-1]
    return walletData;
  }

  async findLastTransaction(
    userId: number,
    prismaClient?: Prisma.TransactionClient,
  ) {
    try {
      const prisma = prismaClient || this.prismaSevice;
      const walletLastTransaction = await prisma.wallet.findFirst({
        where: { userId },
        orderBy: { id: 'desc' },
      });
      return walletLastTransaction?.balance ?? 0;
    } catch (error) {
      console.log('error at findLastTransaction :', error);
      return 0;
    }
  }
  

  async findLastTransactionOfAlletre(prismaClient?: Prisma.TransactionClient) {
    try {
      const prisma = prismaClient || this.prismaSevice;
      const walletLastTransaction = await prisma.alletreWallet.findFirst({
        orderBy: { id: 'desc' },
      });
      return walletLastTransaction?.balance;
    } catch (error) {
      console.log('error at find last transaction of alletre :', error);
    }
  }

  async findAccountBalance() {
    // Find the Alletre wallet balance
    const alletreWalletBalance = await this.findLastTransactionOfAlletre();

    // Find all user  data
    const allUser = await this.prismaSevice.user.findMany();

    // Fetch the last wallet data for all users
    const allUserLastWalletData = await Promise.all(
      allUser.map((user) =>
        this.prismaSevice.wallet.findFirst({
          where: { userId: user.id },
          orderBy: { id: 'desc' },
        }),
      ),
    );

    // Calculate the total balance of all user wallets
    const allUsersWalletBalance = allUserLastWalletData.reduce(
      (sum, walletData) => {
        return sum + (walletData ? Number(walletData.balance) : 0);
      },
      0,
    );
    let NumberOfWelcomeBonusUser = 0;
    if (allUser.length < 100) {
      NumberOfWelcomeBonusUser = allUser.length;
    } else {
      NumberOfWelcomeBonusUser = 100;
    }
    console.log(
      'all users wallet balance :',
      allUsersWalletBalance,
      alletreWalletBalance,
    );
    // Return the total balance (Alletre wallet + all user wallets)
    const accountBalanceWithWelcomeBonus = alletreWalletBalance
      ? Number(alletreWalletBalance) + allUsersWalletBalance
      : allUsersWalletBalance;

    console.log(
      'accountBalanceWithWelcomeBonus:',
      accountBalanceWithWelcomeBonus,
    );

    const accountBalanceWithOutWelcomeBonus =
      accountBalanceWithWelcomeBonus - NumberOfWelcomeBonusUser * 100;

    return {
      accountBalanceWithOutWelcomeBonus,
      accountBalanceWithWelcomeBonus,
    };
  }

  update(id: number, updateWalletDto: UpdateWalletDto) {
    return `This action updates a #${id} wallet`;
  }

  remove(id: number) {
    return `This action removes a #${id} wallet`;
  }
}
