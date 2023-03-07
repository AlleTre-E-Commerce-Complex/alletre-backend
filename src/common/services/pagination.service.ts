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

  getPagination(documentsCount: number, page: number, perPage: number) {
    return {
      totalPages: Math.ceil(documentsCount / perPage) || 0,
      totalItems: documentsCount,
      page,
      perPage,
    };
  }
}
