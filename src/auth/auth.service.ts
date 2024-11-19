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
import { Socket } from 'socket.io';
import { AdminService } from 'src/admin/admin.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly firebaseService: FirebaseService,
    private readonly emailSerivce: EmailSerivce,
    private readonly adminService: AdminService,
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

    const successMessage = `
      <html>
        <head>
          <style>
            body {
              background-color: rgba(0, 0, 0, 0.5);
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
            }
            .modal {
              background-color: white;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
              width: 300px;
              text-align: center;
            }
            .modal-header {
              background-color: #801f50;
              color: white;
              padding: 10px;
              border-top-left-radius: 8px;
              border-top-right-radius: 8px;
            }
            .modal-body {
              padding: 20px;
            }
            .modal-footer {
              padding: 10px;
            }
            .modal a {
              display: inline-block;
              margin-top: 20px;
              padding: 10px 20px;
              background-color: #801f50;
              color: white;
              text-decoration: none;
              border-radius: 4px;
              transition: background-color 0.3s;
            }
            .modal a:hover {
              background-color: #5e1438;
            }
          </style>
        </head>
        <body>
          <div class="modal">
            <div class="modal-header">Email Confirmation</div>
            <div class="modal-body">
              <h1>Verified Successfully</h1>
              <a href=${process.env.FRONT_URL}>Go to Login</a>
            </div>
          </div>
        </body>
      </html>`;

    const failureMessage = `
      <html>
        <head>
          <style>
            body {
              background-color: rgba(0, 0, 0, 0.5);
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
            }
            .modal {
              background-color: white;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
              width: 300px;
              text-align: center;
            }
            .modal-header {
              background-color: #801f50;
              color: white;
              padding: 10px;
              border-top-left-radius: 8px;
              border-top-right-radius: 8px;
            }
            .modal-body {
              padding: 20px;
            }
            .modal-footer {
              padding: 10px;
            }
            .modal a {
              display: inline-block;
              margin-top: 20px;
              padding: 10px 20px;
              background-color: #801f50;
              color: white;
              text-decoration: none;
              border-radius: 4px;
              transition: background-color 0.3s;
            }
            .modal a:hover {
              background-color: #5e1438;
            }
          </style>
        </head>
        <body>
          <div class="modal">
            <div class="modal-header">Email Confirmation</div>
            <div class="modal-body">
              <h1>Verification Failed</h1>
              <a href=${process.env.FRONT_URL}>Go to Login</a>
            </div>
          </div>
        </body>
      </html>`;

    if (verificationResult === 'SUCCESS') {
      return successMessage;
    } else {
      return failureMessage;
    }
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

  authenticateSocketUser(socket: Socket) {
    try {
      const token = socket.handshake.headers['authorization'].split(' ')[1];
      const payload = this.jwtService.verify(token, {
        secret: process.env.ACCESS_TOKEN_SECRET,
      });
      return { id: payload.id, roles: payload.roles };
    } catch {
      socket.disconnect();
    }
  }

  async getUserByRole(id: number, role: string) {
    if (role == Role.User) return await this.userService.findUserByIdOr404(id);
    if (role == Role.Admin)
      return await this.adminService.getAdminByIdOr404(id);
  }

  async adminSignIn(email: string, password: string) {
    const admin = await this.adminService.getAdminByEmailOr404(email);

    //  Compare password with userPassword
    try {
      const isPasswordMatches = await bcrypt.compare(password, admin.password);
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
    // Generate tokens
    const { accessToken, refreshToken } = this.generateTokens({
      id: admin.id,
      email: admin.email,
      roles: [Role.Admin],
    });

    const adminWithoutPassword = this.userService.exclude(admin, ['password']);

    return {
      ...adminWithoutPassword,
      imageLink: undefined,
      imagePath: undefined,
      accessToken,
      refreshToken,
    };
  }
}
