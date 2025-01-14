import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { verify } from 'jsonwebtoken';
import { Role } from '../enums/role.enum';
import { UserService } from 'src/user/user.service';

@Injectable()
export class AuthOrGuestGuard implements CanActivate {
  constructor(private readonly userService: UserService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    if (!request.headers.authorization) {
      request.account = { roles: [Role.Guest] };
      return true;
    }

    request.account = this.validateAccessToken(request.headers.authorization);
    return true;
  }

  async validateAccessToken(accessToken: string) {
    if (accessToken.split(' ')[0] !== 'Bearer')
      throw new ForbiddenException('Invalid token');

    const token = accessToken.split(' ')[1];
    try {
      const decoded: any = verify(token, process.env.ACCESS_TOKEN_SECRET);
      // console.log('decoded*** :', decoded.roles);
      // if (!decoded?.roles?.includes(Role.Admin)) {
      //   // Check if the user exists and is not blocked
      //   const user = await this.userService.findUserByIdOr404(
      //     Number(decoded.id),
      //   ); // Assuming `id` is in the token payload
      //   console.log('token***', token);

      //   if (!user) {
      //     throw new UnauthorizedException('User not found');
      //   }

      //   if (user.isBlocked) {
      //     console.log('user is bloced', user.isBlocked);
      //     throw new UnauthorizedException('User is blocked');
      //   }
      // }
      return decoded;
    } catch (err) {
      const message = `Token error: ${err.message || err.name}`;
      throw new ForbiddenException(message);
    }
  }
}
