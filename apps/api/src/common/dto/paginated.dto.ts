import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/** meta phân trang — spec §3.2. total = COUNT SAU filter + row-level permission */
export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  @Expose()
  page!: number;

  @ApiProperty({ example: 20 })
  @Expose()
  limit!: number;

  @ApiProperty({ example: 137 })
  @Expose()
  total!: number;

  @ApiProperty({ example: 7 })
  @Expose()
  totalPages!: number;

  @ApiProperty({ example: true })
  @Expose()
  hasNext!: boolean;
}

export function buildMeta(page: number, limit: number, total: number): PaginationMetaDto {
  const totalPages = Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasNext: page < totalPages };
}
