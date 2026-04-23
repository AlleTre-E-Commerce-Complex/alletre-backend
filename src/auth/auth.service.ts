import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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
import axios from 'axios';
// import { WalletStatus, WalletTransactionType } from '@prisma/client';
import { WalletService } from 'src/wallet/wallet.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuthService {
  private readonly MAX_SESSIONS_PER_USER = 5;

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly firebaseService: FirebaseService,
    private readonly emailSerivce: EmailSerivce,
    private readonly adminService: AdminService,
    private readonly walletService: WalletService,
    private readonly prismaService: PrismaService,
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
          ar: 'كلمة مرور غير صالحة',
          en: 'Invalid user password',
        });
    } catch (error) {
      throw new MethodNotAllowedResponse({
        ar: 'كلمة مرور غير صالحة',
        en: 'Invalid user password',
      });
    }

    // if (user && user.id <= 100 && !user.wallet.length) {
    //   const newUserWalletData = {
    //     status: WalletStatus.DEPOSIT,
    //     transactionType: WalletTransactionType.By_AUCTION,
    //     description: 'Welcome Bonus',
    //     amount: 100,
    //     auctionId: null,
    //     balance: 100,
    //   };
    //   const addedBonus = await this.walletService.create(
    //     user.id,
    //     newUserWalletData,
    //   );
    //   return { user, addedBonus };
    // }

    return { user, addedBonus: null };
  }

  async signIn(email: string, password: string, userIp: string) {
    try {
      const { user, addedBonus } = await this.validateUser(email, password);

      if (user?.isBlocked) throw new UnauthorizedException('User is blocked');

      // Clear old sessions for this user
      await this.clearUserSessions(user.id);

      if (user) await this.userService.updateUserIpAddress(user.id, userIp);

      const { accessToken, refreshToken } = this.generateTokens({
        id: user.id,
        email: user.email,
        roles: [Role.User],
        phone: user.phone,
      });

      // Manage new session
      await this.manageUserSession(user.id, refreshToken);

      const userWithoutPassword = this.userService.exclude(user, ['password']);

      return {
        ...userWithoutPassword,
        imageLink: undefined,
        imagePath: undefined,
        accessToken,
        refreshToken,
        isAddedBonus: addedBonus ? true : false,
      };
    } catch (error) {
      console.log('111', error);
      if (error instanceof HttpException) throw error;
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async clearUserSessions(userId: number) {
    try {
      await (this.prismaService as any).refreshToken.deleteMany({
        where: { userId },
      });
    } catch (error) {
      console.error('Error clearing user sessions:', error);
    }
  }

  private async manageUserSession(userId: number, refreshToken: string) {
    try {
      // Enforce session limit
      const sessionCount = await (this.prismaService as any).refreshToken.count({
        where: { userId },
      });

      if (sessionCount >= this.MAX_SESSIONS_PER_USER) {
        const oldestSession = await (this.prismaService as any).refreshToken.findFirst({
          where: { userId },
          orderBy: { createdAt: 'asc' },
        });
        if (oldestSession) {
          await (this.prismaService as any).refreshToken.delete({
            where: { id: oldestSession.id },
          });
        }
      }

      await (this.prismaService as any).refreshToken.create({
        data: {
          token: refreshToken,
          userId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });
    } catch (error) {
      console.error('Error managing user session:', error);
    }
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

    // Clear any lingering sessions for this ID (in case of ID reuse after DB reset)
    await this.clearUserSessions(user.id);

    // Generate tokens
    const { accessToken, refreshToken } = this.generateTokens({
      id: user.id,
      email: user.email,
      roles: [Role.User],
      phone: user.phone,
    });

    // Manage new session
    await this.manageUserSession(user.id, refreshToken);

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
      {},
      userSignUpBody.userName,
    );

    return {
      ...userWithoutPassword,
      imageLink: undefined,
      imagePath: undefined,
      accessToken,
      refreshToken,
    };
  }

  async oAuth(data: OAuthDto, userIp: string) {
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
    let addedBonus: any;
    console.log('new user register 1');

    if (email) {
      console.log('new user register 2');
      user = await this.userService.findUserByEmail(email);
      if (user) await this.userService.verifyUserEmail(email);
    } else if (phone) user = await this.userService.findUserByPhone(phone);

    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      const oAuthData = await this.userService.oAuth(
        email,
        phone,
        userName,
        oAuthType,
      );
      user = oAuthData.user;
      addedBonus = oAuthData.addedBonus;
    }
    //check user is blocked or not
    if (user?.isBlocked) throw new UnauthorizedException('User is blocked');
    // Update user ip address
    if (user) await this.userService.updateUserIpAddress(user.id, userIp);
    // Generate tokens
    const { accessToken, refreshToken } = this.generateTokens({
      id: user.id,
      email: user.email,
      roles: [Role.User],
      phone: user.phone,
    });

    const userWithoutPassword = this.userService.exclude(user, ['password']);
    return {
      ...userWithoutPassword,
      imageLink: undefined,
      imagePath: undefined,
      accessToken,
      refreshToken,
      isAddedBonus: isNewUser || (addedBonus ? true : false),
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
    await this.emailSerivce.sendEmail(
      email,
      token,
      EmailsType.VERIFICATION,
      {},
      user.userName,
    );
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
    await this.emailSerivce.sendEmail(
      email,
      token,
      EmailsType.RESET_PASSWORD,
      {},
      user.userName,
    );
  }

  async resetPassword(token: string, newPassword: string) {
    let payload: { email: string };
    try {
      payload = this.jwtService.verify(token, {
        secret: process.env.RESET_PASSWORD_SECRET,
      });
    } catch (error) {
      throw new ForbiddenResponse({
        en: 'Your password reset link has expired. Please request a new one.',
        ar: 'انتهت صلاحية رابط إعادة تعيين كلمة المرور. يرجى طلب رابط جديد.',
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
    const successMessage = `
        <html>
        <head>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Plus+Jakarta+Sans:wght@400;600&display=swap');
            
            body {
              background-color: #0f172a;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              font-family: 'Plus Jakarta Sans', sans-serif;
            }
            .modal {
              background-color: #1e293b;
              border-radius: 24px;
              box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
              width: 440px;
              padding: 60px 40px;
              text-align: center;
              border: 1px solid #334155;
            }
            .icon-wrapper {
              width: 100px;
              height: 100px;
              background-color: rgba(234, 179, 8, 0.1);
              border-radius: 50%;
              display: flex;
              justify-content: center;
              align-items: center;
              margin: 0 auto 40px auto;
              border: 3px solid #eab308;
            }
            h1 {
              font-family: 'Playfair Display', serif;
              color: white;
              font-size: 32px;
              margin: 0 0 15px 0;
              line-height: 1.2;
            }
            p {
              color: #94a3b8;
              font-size: 16px;
              margin-bottom: 40px;
            }
            .btn {
              display: inline-block;
              padding: 16px 40px;
              background-color: #fbbf24;
              color: #1e293b;
              text-decoration: none;
              border-radius: 14px;
              font-weight: 700;
              font-size: 16px;
              transition: all 0.3s ease;
              box-shadow: 0 10px 15px -3px rgba(251, 191, 36, 0.3);
            }
            .btn:hover {
              background-color: #f59e0b;
              transform: translateY(-2px);
              box-shadow: 0 20px 25px -5px rgba(251, 191, 36, 0.4);
            }
          </style>
        </head>
        <body>
          <div class="modal">
            <div class="icon-wrapper">
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 13l4 4L19 7" stroke="#fbbf24" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <h1>Verified Successfully</h1>
            <p>Your account is now fully active. Ready to explore the elite world of listing?</p>
            <a href="${process.env.FRONT_URL}/home?isLoginModal=true" class="btn">Login to Your Account</a>
          </div>
        </body>
      </html>`;

    const failureMessage = `
        <html>
        <head>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Plus+Jakarta+Sans:wght@400;600&display=swap');
            
            body {
              background-color: #0f172a;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              font-family: 'Plus Jakarta Sans', sans-serif;
            }
            .modal {
              background-color: #1e293b;
              border-radius: 24px;
              box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
              width: 440px;
              padding: 60px 40px;
              text-align: center;
              border: 1px solid #334155;
            }
            .icon-wrapper {
              width: 100px;
              height: 100px;
              background-color: rgba(251, 191, 36, 0.1);
              border-radius: 50%;
              display: flex;
              justify-content: center;
              align-items: center;
              margin: 0 auto 40px auto;
              border: 3px solid #fbbf24;
            }
            h1 {
              font-family: 'Playfair Display', serif;
              color: white;
              font-size: 32px;
              margin: 0 0 15px 0;
              line-height: 1.2;
            }
            p {
              color: #94a3b8;
              font-size: 16px;
              margin-bottom: 40px;
            }
            .btn {
              display: inline-block;
              padding: 16px 40px;
              background-color: #fbbf24;
              color: #1e293b;
              text-decoration: none;
              border-radius: 14px;
              font-weight: 700;
              font-size: 16px;
              transition: all 0.3s ease;
              box-shadow: 0 10px 15px -3px rgba(251, 191, 36, 0.3);
            }
            .btn:hover {
              background-color: #f59e0b;
              transform: translateY(-2px);
              box-shadow: 0 20px 25px -5px rgba(251, 191, 36, 0.4);
            }
          </style>
        </head>
        <body>
          <div class="modal">
            <div class="icon-wrapper">
              <svg width="50" height="50" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6l12 12" stroke="#fbbf24" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <h1>Verification Failed</h1>
            <p>We couldn't verify your email. The link might be expired or invalid.</p>
            <a href="${process.env.FRONT_URL}/home" class="btn">Return to Home</a>
          </div>
        </body>
      </html>`;

    if (!token) return failureMessage;

    let payload: { email: string };
    try {
      payload = this.jwtService.verify(token, {
        secret: process.env.EMAIL_VERIFICATION_SECRET,
      });
    } catch (error) {
      return failureMessage;
    }
    console.log(payload);

    const verificationResult = await this.userService.verifyUserEmail(
      payload.email,
    );

    if (verificationResult.status === 'SUCCESS') {
      const emailBodyToNewUser = {
        subject: 'Welcome to 3arbon!',
        preHeader: 'WELCOME ONBOARD',
        title: 'We’re Excited to Have You Onboard!',
        userName: `${verificationResult.user.userName}`,
        features: [
          {
            text: 'Secure Account',
            icon: 'https://img.icons8.com/ios-filled/50/d4af37/shield.png',
          },
          {
            text: 'Stay Updated',
            icon: 'https://img.icons8.com/ios-filled/50/d4af37/appointment-reminders--v1.png',
          },
          {
            text: 'Easy Listing',
            icon: 'https://img.icons8.com/ios-filled/50/d4af37/add-list.png',
          },
        ],
        message1: `
          Welcome to 3arbon! You've just joined a community where finding and listing great products is easier than ever. Dive in and start discovering!
        `,
        message2: `
          <h3>Ready to start?</h3>
          <ul style="list-style-type: none; padding: 0;">
            <li style="margin-bottom: 10px;">🌟 <b>Explore</b> unique products from trusted sellers.</li>
            <li>🚀 <b>List</b> your own products in minutes.</li>
          </ul>
          <p>We’re excited to see what you’ll find (and list) first!</p>
        `,
        Button_text: 'Browse Products',
        Button_URL: 'https://www.3arbon.com',
      };
      await this.emailSerivce.sendEmail(
        payload.email,
        'token',
        EmailsType.WELCOME,
        emailBodyToNewUser,
        verificationResult.user.userName,
      );
      return successMessage;
    } else {
      return failureMessage;
    }
  }

  async logout(refreshToken: string) {
    // If there's no cookie/token, treat as success (idempotent)
    if (!refreshToken) {
      return { message: 'Logged out successfully' };
    }

    try {
      // 1. Verify and decode refreshToken (optional, but good for validation)
      // const payload = this.decodeRefreshToken(refreshToken);

      // 2. Delete the session from DB
      await (this.prismaService as any).refreshToken.deleteMany({
        where: { token: refreshToken },
      });

      return { message: 'Logged out successfully' };
    } catch (error) {
      // If token is invalid or already expired, still respond success (idempotent)
      console.error('Logout error:', error);
      return { message: 'Logged out successfully' };
    }
  }

  async refreshToken(oldRefreshToken: string) {
    if (!oldRefreshToken)
      throw new NotFoundResponse({
        ar: 'لا يوجد',
        en: 'not found',
      });

    try {
      // 1. Verify and decode refreshToken
      const payload = this.decodeRefreshToken(oldRefreshToken);

      // 2. Check if token exists in Database
      const session = await (this.prismaService as any).refreshToken.findUnique({
        where: { token: oldRefreshToken },
      });

      if (!session) {
        // This could be a replay attack or a cleared session
        throw new ForbiddenResponse({
          en: 'Token has been invalidated or expired',
          ar: 'تم إبطال رمز التحديث أو انتهت صلاحيته',
        });
      }

      // 3. Check Admin/User role mismatch or stale session (Optional)
      const user = await this.getUserByRole(payload.id, payload.roles[0]);
      if (!user) {
        throw new ForbiddenResponse({
          en: 'User not found',
          ar: 'المستخدم غير موجود',
        });
      }

      // 4. Delete old token (Rotation)
      await (this.prismaService as any).refreshToken.delete({
        where: { id: session.id },
      });

      // 5. Generate new tokens
      const userWithPhone = user as { phone: string | null };
      const { accessToken, refreshToken } = this.generateTokens({
        id: user.id,
        email: user.email,
        roles: payload.roles,
        phone: userWithPhone.phone,
      });

      // 6. Save new session to DB
      await this.manageUserSession(user.id, refreshToken);

      return {
        accessToken,
        refreshToken,
      };
    } catch (error) {
      console.error('Refresh token error:', error);
      if (error instanceof HttpException) throw error;
      throw new ForbiddenResponse({
        en: 'Invalid or expired session',
        ar: 'جلسة غير صالحة أو منتهية الصلاحية',
      });
    }
  }

  private async clearAdminSessions(adminId: number) {
    try {
      await (this.prismaService as any).refreshToken.deleteMany({
        where: { adminId },
      });
    } catch (error) {
      console.error('Error clearing admin sessions:', error);
    }
  }

  private async manageAdminSession(adminId: number, refreshToken: string) {
    try {
      // Enforce session limit
      const sessionCount = await (this.prismaService as any).refreshToken.count({
        where: { adminId },
      });

      if (sessionCount >= this.MAX_SESSIONS_PER_USER) {
        const oldestSession = await (this.prismaService as any).refreshToken.findFirst({
          where: { adminId },
          orderBy: { createdAt: 'asc' },
        });
        if (oldestSession) {
          await (this.prismaService as any).refreshToken.delete({
            where: { id: oldestSession.id },
          });
        }
      }

      await (this.prismaService as any).refreshToken.create({
        data: {
          token: refreshToken,
          adminId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });
    } catch (error) {
      console.error('Error managing admin session:', error);
    }
  }

  async adminSignIn(email: string, password: string) {
    const admin = await this.adminService.getAdminByEmailOr404(email);

    //  Compare password with userPassword
    try {
      const hashedPassword = await bcrypt.hash(
        password,
        parseInt(process.env.SALT),
      );
      console.log(hashedPassword);
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

    // Clear any existing admin sessions
    this.clearAdminSessions(admin.id);

    // Generate tokens
    const { accessToken, refreshToken } = this.generateTokens({
      id: admin.id,
      email: admin.email,
      roles: [Role.Admin],
    });

    // Manage admin session
    this.manageAdminSession(admin.id, refreshToken);

    const adminWithoutPassword = this.userService.exclude(admin, ['password']);

    return {
      ...adminWithoutPassword,
      imageLink: undefined,
      imagePath: undefined,
      accessToken,
      refreshToken,
    };
  }

  async adminRefreshToken(oldRefreshToken: string) {
    if (!oldRefreshToken)
      throw new NotFoundResponse({
        ar: 'لا يوجد',
        en: 'not found',
      });

    try {
      // 1. Verify and decode refreshToken
      const payload = this.decodeRefreshToken(oldRefreshToken);

      // 2. Validate admin role from payload
      if (!payload.roles.includes(Role.Admin)) {
        throw new ForbiddenResponse({
          en: 'Not authorized as admin',
          ar: 'غير مصرح به كمسؤول',
        });
      }

      // 3. Check if token exists in Database
      const session = await (this.prismaService as any).refreshToken.findUnique({
        where: { token: oldRefreshToken },
      });

      if (!session || session.adminId !== payload.id) {
        throw new ForbiddenResponse({
          en: 'Invalid admin session',
          ar: 'جلسة المسؤول غير صالحة',
        });
      }

      // 4. Check Admin Existence
      const admin = await this.adminService.getAdminByIdOr404(payload.id);

      // 5. Delete old token (Rotation)
      await (this.prismaService as any).refreshToken.delete({
        where: { id: session.id },
      });

      // 6. Generate new tokens
      const { accessToken, refreshToken: newRefreshToken } = this.generateTokens({
        id: admin.id,
        email: admin.email,
        roles: payload.roles,
      });

      // 7. Save new session to DB
      await this.manageAdminSession(admin.id, newRefreshToken);

      return { accessToken, refreshToken: newRefreshToken };
    } catch (error) {
      console.error('Admin refresh token error:', error);
      if (error instanceof HttpException) throw error;
      throw new ForbiddenResponse({
        en: 'Invalid admin session',
        ar: 'جلسة المسؤول غير صالحة',
      });
    }
  }

  generateTokens(payload: {
    id: number;
    email: string;
    roles: string[];
    phone?: string;
  }) {
    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.ACCESS_TOKEN_SECRET,
      expiresIn: '24h',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.REFRESH_TOKEN_SECRET,
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }

  async verifyToken(token: string) {
    if (!token) {
      throw new ForbiddenResponse({
        en: 'No token provided',
        ar: 'لم يتم توفير رمز الدخول',
      });
    }

    try {
      // Verify the token using JWT
      const payload = this.jwtService.verify(token, {
        secret: process.env.ACCESS_TOKEN_SECRET, // Replace with the appropriate secret
      });
      return payload;
    } catch (error) {
      console.log(error);
      throw new ForbiddenResponse({
        en: 'Invalid or expired token',
        ar: 'رمز الدخول غير صالح أو منتهي الصلاحية',
      });
    }
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

  async getAuthorizationUrl(): Promise<string> {
    const scope = 'urn:uae:digitalid:profile';
    const state = Math.random().toString(36).substring(7);
    console.log('state', state);
    return (
      `${process.env.UAE_PASS_SANDBOX_URL}/authorize?` +
      `client_id=${process.env.UAE_PASS_CLIENT_ID}&` +
      `response_type=code&` +
      `scope=${scope}&` +
      `state=${state}&` +
      `redirect_uri=${process.env.UAE_PASS_REDIRECT_URI}`
    );
  }

  async handleCallback(code: string): Promise<any> {
    try {
      // Get access token
      const tokenResponse = await this.getAccessToken(code);
      const accessToken = tokenResponse.access_token;

      // Get user profile
      const userProfile = await this.getUserProfile(accessToken);
      console.log('userProfile', userProfile);
      // Create or update user
      //   const user = await this.upsertUser(userProfile);

      // Generate JWT token
      //   const tokens = await this.authService.generateTokens(user);

      return {
        // user,
        // ...tokens,
        userProfile,
      };
    } catch (error) {
      throw new HttpException(
        'UAE Pass authentication failed',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  private async getAccessToken(code: string): Promise<any> {
    const tokenUrl = `${process.env.UAE_PASS_SANDBOX_URL}/token`;
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.UAE_PASS_REDIRECT_URI,
      client_id: process.env.UAE_PASS_CLIENT_ID,
      client_secret: process.env.UAE_PASS_CLIENT_SECRET,
    });

    const response = await axios.post(tokenUrl, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return response.data;
  }

  private async getUserProfile(accessToken: string): Promise<any> {
    const userInfoUrl = `${process.env.UAE_PASS_SANDBOX_URL}/userinfo`;
    const response = await axios.get(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.data;
  }
}
