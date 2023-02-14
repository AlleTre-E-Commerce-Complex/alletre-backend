import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class OwnerGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    if (!request.headers.authorization) return false;

    const userId = request.account.id;
    const auctionId = request.params.auctionId;
    // Check user with auctions authorization
    return true;
  }
}
