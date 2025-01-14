import { Injectable, UnauthorizedException } from '@nestjs/common';
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
import { WalletStatus, WalletTransactionType } from '@prisma/client';
import { WalletService } from 'src/wallet/wallet.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly firebaseService: FirebaseService,
    private readonly emailSerivce: EmailSerivce,
    private readonly adminService: AdminService,
    private readonly walletService: WalletService,
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

    if (user && user.id <= 100 && !user.wallet.length) {
      const newUserWalletData = {
        status: WalletStatus.DEPOSIT,
        transactionType: WalletTransactionType.By_AUCTION,
        description: 'Welcome Bonus',
        amount: 100,
        auctionId: null,
        balance: 100,
      };
      const addedBonus = await this.walletService.create(
        user.id,
        newUserWalletData,
      );
      return { user, addedBonus };
    }

    return { user, addedBonus: null };
  }
  async signIn(email: string, password: string, userIp: string) {
    // Validate user using validateUser(email,password)
    const { user, addedBonus } = await this.validateUser(email, password);
    //check user is blocked or not
    if (user?.isBlocked) throw new UnauthorizedException('User is blocked');
    // Update user ip address
    if (user) await this.userService.updateUserIpAddress(user.id, userIp);
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
      isAddedBonus: addedBonus ? true : false,
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

    if (!user) {
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
    });

    const userWithoutPassword = this.userService.exclude(user, ['password']);

    return {
      ...userWithoutPassword,
      imageLink: undefined,
      imagePath: undefined,
      accessToken,
      refreshToken,
      isAddedBonus: addedBonus ? true : false,
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
    if (verificationResult.status === 'SUCCESS') {
      // const emailBodyToNewUser = {
      //   subject: 'Welcome to Alle Tre!',
      //   title: 'We’re Excited to Have You Onboard!',
      //   message: `
      //     Hi ${verificationResult.user.userName},

      //     Welcome to Alle Tre! We’re thrilled to have you as part of our growing community. Whether you're here to explore, buy, or sell, we’re here to support you every step of the way.

      //     Start discovering amazing auctions, creating your own, and connecting with a vibrant community of auction enthusiasts. Your journey begins now, and we’re excited to see you succeed!

      //     If you ever have questions or need assistance, our team is just a click away.
      //   `,
      //   Button_text: 'Get Started',
      //   Button_URL: process.env.FRONT_URL,
      // };
      const emailBodyToNewUser = {
        subject: 'Welcome to Alle Tre!',
        title: 'We’re Excited to Have You Onboard!',
        userName: `${verificationResult.user.userName}`,
        message1: `
          Welcome to Alle Tre! We’re thrilled to have you as part of our growing community. Whether you're here to explore, buy, or sell, we’re here to support you every step of the way.
      
          Start discovering amazing auctions, creating your own, and connecting with a vibrant community of auction enthusiasts. Your journey begins now, and we’re excited to see you succeed!
          
          If you ever have questions or need assistance, our team is just a click away. 
        `,
        message2: `
          <h3>What’s Next?</h3>
          <ul>
            <li>1. <b>Explore More Auctions</b>: Browse our platform for more items you’ll love.</li>
            <li>2. <b>Bid Smarter</b>: Use the “Buy Now” feature or set higher auto-bids to secure your favorite items next time.</li>
          </ul>
          <p>Thank you for Joining our platform. We look forward to seeing you in future bids!</p>
           <p style="margin-bottom: 0;">Best regards,</p>
       <p style="margin-top: 0;">The <b>Alletre</b> Team</p>
          <p>P.S. If you have any questions or need assistance, don’t hesitate to contact our support team.</p>
        `,
        Button_text: 'Browse Auctions',
        Button_URL: 'https://www.alletre.com/alletre/',
      };
      await this.emailSerivce.sendEmail(
        payload.email,
        'token',
        EmailsType.OTHER,
        emailBodyToNewUser,
        verificationResult.user.userName,
      );
    }

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

    if (verificationResult.status === 'SUCCESS') {
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
