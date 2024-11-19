import { Injectable } from '@nestjs/common';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { MethodNotAllowedResponse } from 'src/common/errors';
@Injectable()
export class WalletService {
  constructor(private prismaSevice: PrismaService) {}
  async create(userId: number, createWalletData: CreateWalletDto) {
    let result: any;
    try {
      console.log('wallet.service is called', createWalletData);
      result = await this.prismaSevice.wallet.create({
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
  async addToAlletreWallet(userId: number, createWalletData: CreateWalletDto) {
    let result: any;
    try {
      result = await this.prismaSevice.alletreWallet.create({
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

  async findLastTransaction(userId: number) {
    const walletLastTransaction = await this.prismaSevice.wallet.findFirst({
      where: { userId },
      orderBy: { id: 'desc' },
    });
    return walletLastTransaction?.balance;
  }

  async findLastTransactionOfAlletre() {
    const walletLastTransaction =
      await this.prismaSevice.alletreWallet.findFirst({
        orderBy: { id: 'desc' },
      });
    return walletLastTransaction?.balance;
  }
  update(id: number, updateWalletDto: UpdateWalletDto) {
    return `This action updates a #${id} wallet`;
  }

  remove(id: number) {
    return `This action removes a #${id} wallet`;
  }
}
