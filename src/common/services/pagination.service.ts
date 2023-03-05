import { Injectable } from '@nestjs/common';

@Injectable()
export class PaginationService {
  constructor() {
    /* TODO document why this constructor is empty */
  }

  getSkipAndLimit(page: number, perPage: number) {
    const skip = (page - 1) * perPage;
    const limit = perPage;
    return { skip: Number(skip), limit: Number(limit) };
  }

  getTotalPages(documentsCount: number, limit: number) {
    return Math.ceil(documentsCount / limit);
  }
}
