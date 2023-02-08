import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FirebaseService } from '../firebase/firebase.service';
import { UserService } from '../user/user.service';
import * as bcrypt from 'bcrypt';
import { MethodNotAllowedResponse } from '../common/errors/MethodNotAllowedResponse';
import { OAuthDto, UserSignUpDTO, UserSignInDTO } from '../user/dtos';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly firebaseService: FirebaseService,
  ) {
    /* TODO document why this constructor is empty */
  }

  /**
   * --> user validation method, which retrieves the user and verifies the user’s password.
   * @param email
   * @param password
   */
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
    const isPasswordMatches = await bcrypt.compare(password, user.password);
    if (!isPasswordMatches)
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في بيانات المستخدم',
        en: 'Invalid user credentials',
      });

    return user;
  }
  async signIn(email: string, password: string) {
    // Validate user using validateUser(email,password)
    const user = await this.validateUser(email, password);

    // Generate tokens
    const { accessToken, refreshToken } = this.generateTokens({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      ...user,
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
      role: user.role,
    });

    return {
      ...user,
      accessToken,
      refreshToken,
    };
  }
  async oAuth(data: OAuthDto) {
    const { idToken, phone, email } = data;

    const verificationStatus = await this.firebaseService.verifyIdToken(
      idToken,
    );
    if (verificationStatus === 'ERROR')
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في عملية التسجيل',
        en: 'Invalid authentication',
      });

    if (!email)
      throw new MethodNotAllowedResponse({
        ar: 'قم بأختيار البريدالالكتروني',
        en: `You have to provide email address`,
      });

    let user: any;

    if (email) user = await this.userService.findUserByEmail(email);

    if (!user) user = await this.userService.oAuth(email, phone);

    // Generate tokens
    const { accessToken, refreshToken } = this.generateTokens({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      ...user,
      accessToken,
      refreshToken,
    };
  }

  generateTokens(payload: { id: number; email: string; role: string }) {
    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.ACCESS_TOKEN_SECRET,
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.REFRESH_TOKEN_SECRET,
      expiresIn: '7m',
    });

    return { accessToken, refreshToken };
  }
}
