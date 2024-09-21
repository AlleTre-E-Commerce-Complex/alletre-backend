import { IsOptional } from "@nestjs/class-validator";
import { WalletStatus, WalletTransactionType } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsDate, IsIn, IsNotEmpty, IsNumber, IsString } from "class-validator";


export class CreateWalletDto {
    @IsNotEmpty()
    @IsIn(Object.keys(WalletStatus))
    status : WalletStatus;

    @IsNotEmpty()
    @IsIn(Object.keys(WalletTransactionType))
    transactionType : WalletTransactionType;

    @IsNotEmpty()
    @IsString()
    description : string;

    @Transform(({value}):number => parseFloat(value))
    @IsNumber()
    amount:number
    

    @Transform(({ value }): number => parseFloat(value))
    @IsNumber()
    balance: number;

    @IsOptional()
    @Transform(({ value }): number => parseInt(value))
    @IsNumber()
    auctionId?: number;

    @IsOptional()
    @Transform(({ value }): number => parseInt(value))
    @IsNumber()
    purchaseId?: number;
}
 