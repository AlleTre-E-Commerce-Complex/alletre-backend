import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {
    /* TODO document why this constructor is empty */
  }

  /**
   * --> user validation method, which retrieves the user and verifies the user’s password.
   * @param email
   * @param password
   */
  async validateUser(email: string, password: string) {
    console.log(email + ' - ' + password);

    // TODO: Get user

    // TODO: Compare password with userPassword and return it if true else return null
  }
  async login(email: string, password: string) {
    // TODO: Validate user using validateUser(email,password)
    // TODO: Generate Tokens for user and return
  }

  generateTokens(payload: { id: number; emai: string; role: string }) {
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
