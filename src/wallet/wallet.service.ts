import { Injectable } from '@nestjs/common';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { MethodNotAllowedResponse } from 'src/common/errors';
import { Prisma } from '@prisma/client';
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
      console.log('wallet.service is called', createWalletData);
      const prisma = prismaClient || this.prismaSevice;
      result = await prisma.wallet.create({
        data: {
          userId,
          description: createWalletData.description,
          amount: createWalletData.amount,
          status: createWalletData.status,
          transactionType: createWalletData.transactionType,
          auctionId: createWalletData.auctionId,
          purchaseId: createWalletData.purchaseId,
          balance: createWalletData.balance,
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

  //add to alletre wallet(Note : here we add user id to understand from whose mone came to wallet)
  async addToAlletreWallet(
    userId: number,
    createWalletData: CreateWalletDto,
    prismaClient?: Prisma.TransactionClient,
  ) {
    let result: any;
    try {
      const prisma = prismaClient || this.prismaSevice;
      result = await prisma.alletreWallet.create({
        data: {
          userId,
          description: createWalletData.description,
          amount: createWalletData.amount,
          status: createWalletData.status,
          transactionType: createWalletData.transactionType,
          auctionId: createWalletData.auctionId,
          purchaseId: createWalletData.purchaseId,
          balance: createWalletData.balance,
        },
      });
      console.log('the create wallet transaction result : ==>', result);
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
    });
    // console.log('wallet data :',walletData)
    // let balance = walletData[walletData.length-1]
    return walletData;
  }

  async findAllAdminWalletDetails() {
    const walletData = await this.prismaSevice.alletreWallet.findMany({
      include: { user: true },
    });
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
      return walletLastTransaction?.balance;
    } catch (error) {
      console.log('error at findLastTransaction :', error);
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
