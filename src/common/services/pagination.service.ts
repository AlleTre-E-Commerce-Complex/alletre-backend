import { Injectable } from '@nestjs/common';

@Injectable()
export class PaginationService {
  constructor() {
    /* TODO document why this constructor is empty */
  }

  getTotalPages(documentsCount: number, limit: number) {
    return Math.ceil(documentsCount / limit);
  }
}
