/* eslint-disable prettier/prettier */
import { UnauthorizedException } from '@nestjs/common';
export class UnAuthorizedResponse extends UnauthorizedException {
  constructor(message: { ar: string; en: string }) {
    super({ success: false, message: message });
  }
}
