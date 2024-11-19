// withdrawal.dto.ts
import { IsString, MinLength, Matches, IsNotEmpty } from 'class-validator';

export class addNewBankAccountDto {
  // @IsNumber()
  // @Min(1, { message: 'Amount must be greater than 0' })
  // @IsNotEmpty()
  // amount: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Account name must be at least 3 characters long' })
  @Matches(/^[a-zA-Z\s]*$/, {
    message: 'Account name can only contain letters and spaces',
  })
  accountHolderName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Bank name must be at least 3 characters long' })
  @Matches(/^[a-zA-Z\s]*$/, {
    message: 'Bank name can only contain letters and spaces',
  })
  bankName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, {
    message: 'Account number must be at least 8 characters long',
  })
  @Matches(/^[0-9]+$/, { message: 'Account number must contain only numbers' })
  accountNumber: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^AE[0-9]{21}$/, {
    message: 'Invalid IBAN format. Must start with AE followed by 21 digits',
  })
  routingNumber: string;
}
