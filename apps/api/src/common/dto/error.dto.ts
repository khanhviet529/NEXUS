import { ApiProperty } from '@nestjs/swagger';

/** Hình dạng lỗi thống nhất — spec §3.6, cho Swagger */
export class ErrorDto {
  @ApiProperty({ example: 'ORDER.ALREADY_APPROVED' })
  code!: string;

  @ApiProperty({ example: 'Đơn hàng đã được duyệt, không thể sửa' })
  message!: string;

  @ApiProperty({ nullable: true, type: Object })
  details!: Record<string, string[]> | null;

  @ApiProperty({ example: '01JQ8X...' })
  traceId!: string;

  @ApiProperty({ example: '2026-08-07T03:12:45.000Z' })
  timestamp!: string;
}
