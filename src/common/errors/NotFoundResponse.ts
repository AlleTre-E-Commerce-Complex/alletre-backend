/* eslint-disable prettier/prettier */
import { NotFoundException } from '@nestjs/common';
export class NotFoundResponse extends NotFoundException {
  constructor(message: { ar: string; en: string }) {
    super({ success: false, message: message });
  }
}
