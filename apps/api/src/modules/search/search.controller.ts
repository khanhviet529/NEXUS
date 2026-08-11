import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AllowAuthenticated } from '../../common/decorators/allow-authenticated.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { RequestContextService } from '../../infra/cls/request-context';
import { SUPPORTED_LOCALES, type Locale } from '../../common/query/localized';
import { SearchRepository } from './search.repository';

class SearchDto {
  @ApiProperty({ minLength: 2, maxLength: 100, example: 'khach' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;
}

export class SearchItemDto {
  @ApiProperty() @Expose() id!: string;
  @ApiProperty() @Expose() code!: string;
  @ApiProperty() @Expose() label!: string;
  @ApiProperty({ example: '/orders/uuid' }) @Expose() href!: string;
}

export class SearchGroupDto {
  @ApiProperty({ enum: ['Product', 'Customer', 'Order', 'User'] })
  @Expose()
  entity!: 'Product' | 'Customer' | 'Order' | 'User';

  @ApiProperty({ type: [SearchItemDto] })
  @Expose()
  @Type(() => SearchItemDto)
  items!: SearchItemDto[];
}

export class SearchResponseDto {
  @ApiProperty({ type: [SearchGroupDto] })
  @Expose()
  @Type(() => SearchGroupDto)
  groups!: SearchGroupDto[];
}

/**
 * [OPT ưu tiên cao] GĐ8 — global search cho Cmd+K (§5C.7).
 * Quyền động theo từng NHÓM (product/customer/order/user) — @AllowAuthenticated,
 * nhóm nào không có quyền read thì không truy vấn nhóm đó.
 */
@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(
    private readonly repo: SearchRepository,
    private readonly ctx: RequestContextService,
  ) {}

  @AllowAuthenticated()
  @Get()
  @ApiOperation({ summary: 'Tìm toàn cục — nhóm theo module, áp row-level (§8.2 #29)' })
  @ApiOkResponse({ type: SearchResponseDto })
  async search(@CurrentUser() user: AuthUser, @Query() dto: SearchDto): Promise<SearchResponseDto> {
    const raw = this.ctx.locale;
    const locale: Locale = (SUPPORTED_LOCALES as readonly string[]).includes(raw)
      ? (raw as Locale)
      : 'vi';
    return { groups: await this.repo.search(user, dto.q, locale) };
  }
}
