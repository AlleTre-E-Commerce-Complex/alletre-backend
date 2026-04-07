import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(BadRequestException)
export class BadRequestExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    let message: any = exception.getResponse()['message'];

    if (Array.isArray(message)) {
      message = message.map((msg) => {
        try {
          return JSON.parse(msg);
        } catch (e) {
          return msg;
        }
      });
      // If there's only one error and it's an object (localized), flatten it for the frontend
      if (message.length === 1 && typeof message[0] === 'object') {
        message = message[0];
      }
    } else {
      try {
        message = JSON.parse(message);
      } catch (e) {
        // keep as is
      }
    }

    response.status(400).json({
      success: false,
      message,
      error: 'Bad Request',
    });
  }
}
