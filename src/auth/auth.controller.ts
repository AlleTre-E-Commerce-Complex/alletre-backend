import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
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
  async userSignController(
    @Body() userSignInBody: UserSignInDTO,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userIp = req.ip;
    console.log('User sign-in data:', 'IP:', userIp);
    const result = await this.authService.signIn(
      userSignInBody.email,
      userSignInBody.password,
      userIp,
    );
    const { refreshToken, ...userDataWithoutSensitive } = result;
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      // maxAge: 5 * 60 * 1000, // set 5 minutes for testment
    });
    return {
      success: true,
      data: userDataWithoutSensitive,
    };
  }

  // @Post('/oAuth')
  // async OAuthController(@Body() oAuthDto: OAuthDto, @Req() req: Request) {
  //   const userIp = req.ip;
  //   console.log('OAuth data:', 'IP:', userIp);
  //   return {
  //     success: true,
  //     data: await this.authService.oAuth(oAuthDto, userIp),
  //   };
  // }

  @Post('/oAuth')
  async OAuthController(
    @Body() oAuthDto: OAuthDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userIp = req.ip;
    const result = await this.authService.oAuth(oAuthDto, userIp);
    const { refreshToken, ...userDataWithoutSensitive } = result;
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      // maxAge: 5 * 60 * 1000, // set 5 minutes for testment
    });
    return {
      success: true,
      data: userDataWithoutSensitive,
    };
  }
  // @Post('/refresh-token')
  // async refreshTokenController(@Body('refreshToken') refreshToken: string) {
  //   return {
  //     success: true,
  //     data: await this.authService.refreshToken(refreshToken),
  //   };
  // }

  @Post('/refresh-token')
  async refreshTokenController(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const oldRefreshToken = req.cookies?.refreshToken;

    const { accessToken, refreshToken } = await this.authService.refreshToken(
      oldRefreshToken,
    );

    // Cookie options - adapt domain / sameSite based on your deployment
    const cookieOptions: any = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      // maxAge: 5 * 60 * 1000, // 5 minuts for testment
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    };

    // Set the rotated refresh token in HttpOnly cookie
    res.cookie('refreshToken', refreshToken, cookieOptions);

    // Return only access token (do not return refresh token)
    return {
      success: true,
      data: {
        accessToken,
      },
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

  @Post('/admin/sign-in')
  async adminSignInController(@Body() UserSignInBody: UserSignInDTO) {
    return {
      success: true,
      data: await this.authService.adminSignIn(
        UserSignInBody.email,
        UserSignInBody.password,
      ),
    };
  }

  @Post('/admin/refresh-token')
  async adminRefreshTokenController(
    @Body('refreshToken') refreshToken: string,
  ) {
    return {
      success: true,
      data: await this.authService.adminRefreshToken(refreshToken),
    };
  }

  // @Post('/logout')
  // async logoutController(@Body('refreshToken') refreshToken: string) {
  //   return {
  //     success: true,
  //     data: await this.authService.logout(refreshToken),
  //   };
  // }

  @Post('/logout')
  async logoutController(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refreshToken; // read cookie
    const data = await this.authService.logout(refreshToken);

    // Clear cookie on response (use same options as you set earlier)
    const cookieOptions: any = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
      // domain: process.env.COOKIE_DOMAIN || undefined,
    };
    res.clearCookie('refreshToken', cookieOptions);

    return {
      success: true,
      data,
    };
  }
}
