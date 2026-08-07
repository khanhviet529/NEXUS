import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class MembershipSummaryDto {
  @ApiProperty()
  @Expose()
  tenantId!: string;

  @ApiProperty()
  @Expose()
  tenantCode!: string;

  @ApiProperty()
  @Expose()
  tenantName!: string;
}

export class LoginResponseDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'null khi user thuộc nhiều tenant và chưa chọn — FE hiện màn chọn tenant rồi gọi lại kèm tenantId. Web dùng cookie (đã set kèm response), mobile dùng giá trị này làm Bearer.',
  })
  @Expose()
  accessToken!: string | null;

  @ApiProperty()
  @Expose()
  expiresIn!: number;

  @ApiProperty({ type: [MembershipSummaryDto] })
  @Expose()
  @Type(() => MembershipSummaryDto)
  memberships!: MembershipSummaryDto[];
}
