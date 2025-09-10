import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { Account } from 'src/auth/decorators/account.decorator';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Role } from 'src/auth/enums/role.enum';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CreateWalletDtoFromAdminSide } from './dto/createWalletDtoFromAdminside';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {
    console.log('wallet called-->');
  }

  @Post('/admin/add-to-user-wallet')
  @UseGuards(AuthGuard)
  async create(
    @Account() account: any,
    @Body() createWalletDto: CreateWalletDtoFromAdminSide,
  ) {
    return await this.walletService.addToUserWalletByAdmin(createWalletDto);
  }

  @Post('/admin/add-to-alletre-wallet')
  @UseGuards(AuthGuard)
  async addToAlletreWallet(
    @Account() account: any,
    @Body() createWalletDto: CreateWalletDtoFromAdminSide,
  ) {
    return await this.walletService.addToAlletreWalletByAdmin(
      account.id,
      createWalletDto,
    );
  }

  @Get('/admin/get-admin-profit')
  @UseGuards(AuthGuard)
  async getAdminProfit() {
    const response = await this.walletService.findAdminProfitData();

    return { adminProfit: response?.totalAmount };
  }

  @Get('/admin/get-admin-all-profit-data')
  @UseGuards(AuthGuard)
  async getAdminAllProfitData() {
    const response = await this.walletService.findAdminProfitData();

    return { profitData: response?.profitData };
  }

  @Get('get_from_wallet')
  @UseGuards(AuthGuard)
  async findAll(@Account() account: any) {
    console.log('account details from wallet controll :', account);
    return await this.walletService.findAll(account.id);
  }

  @Get('get_balance')
  @UseGuards(AuthGuard)
  async findOne(@Account() account: any) {
    return await this.walletService.findLastTransaction(+account.id);
  }

  @Get('get-admin-wallet-details')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async findAdminWalletDetails(@Account() account: any) {
    console.log('account details from wallet controll :', account);
    return await this.walletService.findAllAdminWalletDetails();
  }

  @Get('get-admin-wallet-balance')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async findAdminWalletBalance() {
    return await this.walletService.findLastTransactionOfAlletre();
  }

  @Get('get-account-balance')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async findAccountBalance() {
    //here we are finding the Bank account balance (admin wallet balace + all users wallet balance)
    return await this.walletService.findAccountBalance();
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateWalletDto: UpdateWalletDto,
  ) {
    return await this.walletService.update(+id, updateWalletDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.walletService.remove(+id);
  }
}
