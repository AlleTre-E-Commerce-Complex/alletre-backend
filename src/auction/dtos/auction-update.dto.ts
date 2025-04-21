import {
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsObject,
} from 'class-validator';
import { DeliveryType } from '../enums/delivery-type.enum';
import { ProductUpdateDTO } from './product-update.dto';

export class AuctionUpdateDTO {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  durationUnit?: string;

  @IsOptional()
  @IsNumber()
  duration?: number;

  @IsOptional()
  @IsNumber()
  startingPrice?: number;

  @IsOptional()
  @IsNumber()
  purchasePrice?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(DeliveryType)
  deliveryType?: DeliveryType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  product?: ProductUpdateDTO;
}
