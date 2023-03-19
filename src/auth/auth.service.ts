import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FirebaseService } from '../firebase/firebase.service';
import { UserService } from '../user/user.service';
import * as bcrypt from 'bcrypt';
import { MethodNotAllowedResponse } from '../common/errors/MethodNotAllowedResponse';
import { OAuthDto, UserSignUpDTO } from '../user/dtos';
import { Role } from './enums/role.enum';
import { ForbiddenResponse, NotFoundResponse } from '../common/errors';
import { EmailSerivce } from '../emails/email.service';
import { EmailsType } from './enums/emails-type.enum';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly firebaseService: FirebaseService,
    private readonly emailSerivce: EmailSerivce,
  ) {
    /* TODO document why this constructor is empty */
  }

  async validateUser(email: string, password: string) {
    // Get user
    const user = await this.userService.findUserByEmailOr404(email);

    const isEmailVerifed = await this.userService.checkEmailVerification(email);
    if (!isEmailVerifed)
      throw new MethodNotAllowedResponse({
        ar: 'قم بالتحقق من بريدك الالكتروني',
        en: 'Verify your account',
      });

    //  Compare password with userPassword
    try {
      const isPasswordMatches = await bcrypt.compare(password, user.password);
      if (!isPasswordMatches)
        throw new MethodNotAllowedResponse({
          ar: 'خطأ في بيانات المستخدم',
          en: 'Invalid user credentials',
        });
    } catch (error) {
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في بيانات المستخدم',
        en: 'Invalid user credentials',
      });
    }

    return user;
  }
  async signIn(email: string, password: string) {
    // Validate user using validateUser(email,password)
    const user = await this.validateUser(email, password);

    // Generate tokens
    const { accessToken, refreshToken } = this.generateTokens({
      id: user.id,
      email: user.email,
      roles: [Role.User],
    });

    const userWithoutPassword = this.userService.exclude(user, ['password']);

    return {
      ...userWithoutPassword,
      imageLink: undefined,
      imagePath: undefined,
      accessToken,
      refreshToken,
    };
  }
  async signUp(userSignUpBody: UserSignUpDTO) {
    // Hash Password
    const hashedPassword = await bcrypt.hash(
      userSignUpBody.password,
      parseInt(process.env.SALT),
    );

    // Create user
    const user = await this.userService.register(
      userSignUpBody,
      hashedPassword,
    );

    // Generate tokens
    const { accessToken, refreshToken } = this.generateTokens({
      id: user.id,
      email: user.email,
      roles: [Role.User],
    });

    const userWithoutPassword = this.userService.exclude(user, ['password']);

    const token = this.jwtService.sign(
      { email: userSignUpBody.email },
      {
        secret: process.env.EMAIL_VERIFICATION_SECRET,
        expiresIn: '7m',
      },
    );

    // Send email verificaiton to 'email'
    await this.emailSerivce.sendEmail(
      userSignUpBody.email,
      token,
      EmailsType.VERIFICATION,
    );

    return {
      ...userWithoutPassword,
      imageLink: undefined,
      imagePath: undefined,
      accessToken,
      refreshToken,
    };
  }
  async oAuth(data: OAuthDto) {
    const { idToken, phone, email, userName, oAuthType } = data;

    const verificationStatus = await this.firebaseService.verifyIdToken(
      idToken,
    );
    if (verificationStatus === 'ERROR')
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في عملية التسجيل',
        en: 'Invalid authentication',
      });

    if (!email && !phone)
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في التسجيل',
        en: `You have to provide email address or phone number`,
      });

    let user: any;

    if (email) {
      user = await this.userService.findUserByEmail(email);
      if (user) await this.userService.verifyUserEmail(email);
    } else if (phone) user = await this.userService.findUserByPhone(phone);

    if (!user)
      user = await this.userService.oAuth(email, phone, userName, oAuthType);

    // Generate tokens
    const { accessToken, refreshToken } = this.generateTokens({
      id: user.id,
      email: user.email,
      roles: [Role.User],
    });

    const userWithoutPassword = this.userService.exclude(user, ['password']);

    return {
      ...userWithoutPassword,
      imageLink: undefined,
      imagePath: undefined,
      accessToken,
      refreshToken,
    };
  }

  async resendEmailVerification(email: string) {
    const user = await this.userService.findUserByEmailOr404(email);

    const token = this.jwtService.sign(
      { email: email },
      {
        secret: process.env.EMAIL_VERIFICATION_SECRET,
        expiresIn: '7m',
      },
    );

    // Send email verificaiton to 'email'
    await this.emailSerivce.sendEmail(email, token, EmailsType.VERIFICATION);
  }

  async forgetPassword(email: string) {
    const user = await this.userService.findUserByEmailOr404(email);

    const token = this.jwtService.sign(
      { email: email },
      {
        secret: process.env.RESET_PASSWORD_SECRET,
        expiresIn: '15m',
      },
    );

    // Send reset-password to 'email'
    await this.emailSerivce.sendEmail(email, token, EmailsType.RESET_PASSWORD);
  }

  async resetPassword(token: string, newPassword: string) {
    let payload: { email: string };
    try {
      payload = this.jwtService.verify(token, {
        secret: process.env.RESET_PASSWORD_SECRET,
      });
    } catch (error) {
      throw new ForbiddenResponse({
        en: 'Your session for update your credentials has expired,Please try again',
        ar: 'انتهي الوقت المسموح لتعديل بيانات السرية ',
      });
    }

    // Hash Password
    const hashedPassword = await bcrypt.hash(
      newPassword,
      parseInt(process.env.SALT),
    );
    await this.userService.updateUserCredentials(payload.email, hashedPassword);
  }
  async activateAccount(token: string) {
    if (!token)
      throw new ForbiddenResponse({
        en: 'Forbidden Access',
        ar: 'غير مصرح لك ',
      });

    let payload: { email: string };
    try {
      payload = this.jwtService.verify(token, {
        secret: process.env.EMAIL_VERIFICATION_SECRET,
      });
    } catch (error) {
      throw new ForbiddenResponse({
        en: 'Forbidden Access',
        ar: 'غير مصرح لك ',
      });
    }

    const verificationResult = await this.userService.verifyUserEmail(
      payload.email,
    );

    if (verificationResult === 'SUCCESS')
      return `<html> <h1 style={color:Burgundy;text-align=center;}>Verified Successfuly </h1> 
      </html>`;
    else
      return `<html> <h1 style="color:Burgundy;text-align=center;> Verification Failed </h1> </html>`;
  }

  generateTokens(payload: { id: number; email: string; roles: string[] }) {
    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.ACCESS_TOKEN_SECRET,
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.REFRESH_TOKEN_SECRET,
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }
  async refreshToken(oldRefreshToken: string) {
    if (!oldRefreshToken)
      throw new NotFoundResponse({ ar: 'لا يوجد', en: 'not found' });

    // decode refreshToken
    const payload = this.decodeRefreshToken(oldRefreshToken);

    // Check CLientUser Existence
    const user = await this.getUserByRole(payload.id, payload.roles[0]);
    // Generate Tokens
    const { accessToken, refreshToken } = this.generateTokens({
      id: user.id,
      email: user.email,
      roles: payload.roles,
    });

    return { accessToken, refreshToken };
  }
  private decodeRefreshToken(refreshToken: string) {
    try {
      return this.jwtService.verify(refreshToken, {
        secret: process.env.REFRESH_TOKEN_SECRET,
      });
    } catch {
      throw new ForbiddenResponse({
        en: 'Not Authenticated',
        ar: 'غير مصدق للدخول',
      });
    }
  }

  private async getUserByRole(id: number, role: string) {
    if (role == Role.User) return await this.userService.findUserByIdOr404(id);
  }
}
