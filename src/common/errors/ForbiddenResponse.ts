/* eslint-disable prettier/prettier */
import { ForbiddenException } from '@nestjs/common';
export class ForbiddenResponse extends ForbiddenException {
  constructor(message: { ar: string; en: string }) {
    super({ success: false, message: message });
  }
}
