import { DeliveryType } from '@prisma/client';

import { IsEnum, IsNotEmpty } from 'class-validator';

export class DeliveryTypeDTO {
  // Use IsEnum instead of IsIn to validate against enum values
  @IsNotEmpty()
  @IsEnum(DeliveryType)
  deliveryType: DeliveryType;
}
