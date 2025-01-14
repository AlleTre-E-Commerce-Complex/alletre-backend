import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { UserService } from 'src/user/user.service';

@Injectable()
export class CheckUserBlockMiddleware implements NestMiddleware {
  constructor(private readonly userService: UserService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const excludedRoutes = ['/api/users/admin/all', '/api/auctions/admin/all'];

    if (excludedRoutes.includes(req.baseUrl + req.path)) {
      console.log(`Skipping middleware for route: ${req.path}`);
      return next();
    }
    const authHeader = req.headers['authorization']; // Get the Authorization header

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is missing');
    }

    const token = authHeader.split(' ')[1]; // Extract the token from "Bearer <token>"
    if (!token) {
      throw new UnauthorizedException('Token is missing');
    }

    try {
      // Verify the token
      const decoded: any = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

      // Check if the user exists and is not blocked
      const user = await this.userService.findUserByIdOr404(decoded.id); // Assuming `id` is in the token payload
      console.log('token***', token);

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      if (user.isBlocked) {
        throw new UnauthorizedException('User is blocked');
      }

      // Attach user to request object for further use
      req['user'] = user;
      next();
    } catch (error) {
      console.error('Token verification error:', error.message);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
