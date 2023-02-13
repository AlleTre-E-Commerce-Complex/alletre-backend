import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  UserSignUpDTO,
  UserSignInDTO,
  OAuthDto,
  ResendVerificationDTO,
  ResetCredentialsDTO,
} from '../user/dtos';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('/sign-up')
  async userSignUpController(@Body() userSignUpBody: UserSignUpDTO) {
    return {
      success: true,
      data: await this.authService.signUp(userSignUpBody),
    };
  }

  @Post('/sign-in')
  async userSignController(@Body() UserSignInBody: UserSignInDTO) {
    return {
      success: true,
      data: await this.authService.signIn(
        UserSignInBody.email,
        UserSignInBody.password,
      ),
    };
  }
  @Post('/oAuth')
  async OAuthController(@Body() oAuthDto: OAuthDto) {
    return {
      success: true,
      data: await this.authService.oAuth(oAuthDto),
    };
  }
  @Post('/refresh-token')
  async refreshTokenController(@Body('refreshToken') refreshToken: string) {
    return {
      success: true,
      data: await this.authService.refreshToken(refreshToken),
    };
  }
  @Post('/resend-verification')
  async resendVerificationController(
    @Body() resendVerificationDTO: ResendVerificationDTO,
  ) {
    return {
      success: true,
      data: await this.authService.resendEmailVerification(
        resendVerificationDTO.email,
      ),
    };
  }

  @Post('/forget-password')
  async forgetPasswordController(
    @Body() resendVerificationDTO: ResendVerificationDTO,
  ) {
    return {
      success: true,
      data: await this.authService.forgetPassword(resendVerificationDTO.email),
    };
  }

  @Post('/reset-credentials')
  async resetCredentialsController(
    @Body() resetCredentialsDTO: ResetCredentialsDTO,
  ) {
    return {
      success: true,
      data: await this.authService.resetPassword(
        resetCredentialsDTO.token,
        resetCredentialsDTO.newPassword,
      ),
    };
  }
  @Get('/activate')
  async activateEmailController(@Query('token') token: string) {
    return await this.authService.activateAccount(token);
  }
}
