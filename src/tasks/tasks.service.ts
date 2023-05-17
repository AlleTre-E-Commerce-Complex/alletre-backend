import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { UserAuctionsService } from '../auction/services/user-auctions.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private userAuctionsService: UserAuctionsService) {}

  /**
   * Function will run every mintue to set all auction expired
   */
  @Interval(60000) // Run every minute (adjust the interval as per your requirements)
  async handleCron() {
    await this.userAuctionsService.markExpiredAuctions();
  }
}
