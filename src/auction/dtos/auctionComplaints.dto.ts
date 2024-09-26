import { IsOptional, IsEnum, IsNumber } from "class-validator";
import { JoinedAuctionStatus, ComplaintImages, ProblemStatus } from "@prisma/client";
import { IsNotEmpty, IsString } from "class-validator";
import { Transform } from "class-transformer";

export class AuctionComplaintsDTO {
    @IsNotEmpty()
    @IsString()
    message: string;

    @IsNotEmpty()
    @Transform(({ value }): number => parseInt(value))
    @IsNumber()
    auctionId: number;

    // Use IsEnum instead of IsIn to validate against enum values
    @IsNotEmpty()
    @IsEnum(JoinedAuctionStatus)
    auctionStatus: JoinedAuctionStatus;

    @IsEnum(ProblemStatus)
    @IsOptional()
    problemStatus?: ProblemStatus;
}
