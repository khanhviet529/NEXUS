import { ApiProperty } from '@nestjs/swagger';

/** meta phân trang — spec §3.2. total = COUNT SAU filter + row-level permission */
export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 137 })
  total!: number;

  @ApiProperty({ example: 7 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNext!: boolean;
}

export function buildMeta(page: number, limit: number, total: number): PaginationMetaDto {
  const totalPages = Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasNext: page < totalPages };
}
