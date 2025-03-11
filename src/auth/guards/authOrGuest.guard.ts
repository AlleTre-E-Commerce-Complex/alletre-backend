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

    // If no auth header, treat as guest
    if (!request.headers.authorization) {
      request.account = { roles: [Role.Guest] };
      return true;
    }

    try {
      request.account = await this.validateAccessToken(
        request.headers.authorization,
      );
      return true;
    } catch (error) {
      // If token validation fails, still allow access as guest
      request.account = { roles: [Role.Guest] };
      return true;
    }
  }

  async validateAccessToken(accessToken: string) {
    if (!accessToken) {
      throw new ForbiddenException('No token provided');
    }

    const [type, token] = accessToken.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new ForbiddenException('Invalid token format');
    }

    try {
      const decoded: any = verify(token, process.env.ACCESS_TOKEN_SECRET);

      if (!decoded || !decoded.id || !decoded.roles) {
        throw new ForbiddenException('Invalid token payload');
      }

      // Only check user status for non-admin users
      if (!decoded.roles.includes(Role.Admin)) {
        const user = await this.userService.findUserByIdOr404(
          Number(decoded.id),
        );

        if (!user) {
          throw new UnauthorizedException('User not found');
        }

        if (user.isBlocked) {
          throw new UnauthorizedException('User is blocked');
        }
      }

      return decoded;
    } catch (err) {
      throw new ForbiddenException(
        `Token error: ${err.message || 'Invalid token'}`,
      );
    }
  }
}
