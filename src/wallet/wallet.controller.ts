import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { Account } from 'src/auth/decorators/account.decorator';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {
    console.log('wallet called-->')
  }

  @Post()
  @UseGuards(AuthGuard)
  create(
    @Account() account:any,
    @Body() createWalletDto: CreateWalletDto,

  ) {
    console.log('create in wallet controller ')
    return this.walletService.create(account.id,createWalletDto);
  }

  @Get('get_from_wallet')
  @UseGuards(AuthGuard)
  findAll(@Account() account:any) {
    console.log('account details from wallet controll :',account)
    return this.walletService.findAll(account.id);
  }



  @Get('get_balance')
  @UseGuards(AuthGuard)
  findOne(@Account() account:any) {
    return this.walletService.findLastTransaction(+account.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateWalletDto: UpdateWalletDto) {
    return this.walletService.update(+id, updateWalletDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.walletService.remove(+id);
  }
}
