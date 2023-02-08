/* eslint-disable prettier/prettier */
import { MethodNotAllowedException } from '@nestjs/common';
export class MethodNotAllowedResponse extends MethodNotAllowedException {
  constructor(message: { ar: string; en: string }) {
    super({ success: false, message: message });
  }
}
