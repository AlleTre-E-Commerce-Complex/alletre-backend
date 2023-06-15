import { Injectable } from '@nestjs/common';
import { Auction, AuctionStatus } from '@prisma/client';
import { AuctionActions } from 'src/common/enums/auction-actions.enum';
import { MethodNotAllowedResponse } from 'src/common/errors';

@Injectable()
export class AuctionStatusValidator {
  private StatusHirarchy = {
    [AuctionStatus.PENDING_OWNER_DEPOIST]: [
      AuctionStatus.ACTIVE,
      AuctionStatus.IN_SCHEDULED,
    ],
    [AuctionStatus.DRAFTED]: [AuctionStatus.ACTIVE, AuctionStatus.IN_SCHEDULED],
    [AuctionStatus.ACTIVE]: [AuctionStatus.EXPIRED, AuctionStatus.SOLD],
    [AuctionStatus.IN_SCHEDULED]: [AuctionStatus.ACTIVE],
  };

  private ActionsHirarchy = {
    [AuctionStatus.PENDING_OWNER_DEPOIST]: [AuctionActions.SELLER_DEPOSIT],
    [AuctionStatus.DRAFTED]: [
      AuctionActions.AUCTION_UPDATE,
      AuctionActions.AUCTION_DELETE,
    ],
    [AuctionStatus.ACTIVE]: [
      AuctionActions.BIDDER_DEPOSIT,
      AuctionActions.SUBMIT_BID,
      AuctionActions.BUY_NOW,
    ],
    [AuctionStatus.WAITING_FOR_PAYMENT]: [AuctionActions.BIIDER_PURCHASE],
    [AuctionStatus.IN_SCHEDULED]: [],
    [AuctionStatus.SOLD]: [],
    [AuctionStatus.EXPIRED]: [],
  };

  constructor() {}

  isStatusValidForAuction(auction: Auction, newStatus: AuctionStatus) {
    try {
      if (this.StatusHirarchy[auction.status].includes(newStatus)) return true;
    } catch {
      throw new MethodNotAllowedResponse({
        ar: 'هذا الاعلان غير موجود',
        en: 'This Auction does not exist',
      });
    }
    throw new MethodNotAllowedResponse({
      ar: 'حالة الاعلان غير مناسبة',
      en: 'Not valid AuctionStatus for the current status',
    });
  }

  isActionValidForAuction(auction: Auction, auctionAction: AuctionActions) {
    try {
      if (this.ActionsHirarchy[auction.status].includes(auctionAction))
        return true;
    } catch {
      throw new MethodNotAllowedResponse({
        ar: 'هذا الاعلان غير موجود',
        en: 'This Auction does not exist',
      });
    }
    throw new MethodNotAllowedResponse({
      ar: 'حالة الاعلان غير مناسبة',
      en: 'Not valid AuctionStatus for the current status',
    });
  }
}
