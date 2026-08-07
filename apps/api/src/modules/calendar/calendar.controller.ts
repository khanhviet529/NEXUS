import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { addWorkingDays, isWorkingDay, workingMinutesBetween } from '@nexus/shared';
import { AllowAuthenticated } from '../../common/decorators/allow-authenticated.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/errors/app.exception';
import { CalendarRepository } from './calendar.repository';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

class AddWorkingDaysDto {
  @ApiProperty({ example: '2026-02-13' })
  @Matches(DATE_RE)
  date!: string;

  @ApiProperty({ example: 3, description: 'Âm = lùi về trước' })
  @Type(() => Number)
  @IsInt()
  days!: number;
}

class WorkingMinutesDto {
  @ApiProperty({ example: '2026-02-13T08:00' })
  @Matches(DATETIME_RE)
  from!: string;

  @ApiProperty({ example: '2026-02-23T12:00' })
  @Matches(DATETIME_RE)
  to!: string;
}

class AddHolidayDto {
  @ApiProperty({ example: '2031-02-05' })
  @Matches(DATE_RE)
  date!: string;

  @ApiProperty({ example: 'Tết Nguyên đán' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;
}

/**
 * [CORE nhẹ] GĐ7 — business calendar (§5C.4). Đọc: mọi người đã đăng nhập.
 * Sửa ngày nghỉ: setting:update (cấu hình vận hành của tenant).
 */
@ApiTags('business-calendar')
@Controller('business-calendar')
export class CalendarController {
  constructor(private readonly repo: CalendarRepository) {}

  @AllowAuthenticated()
  @Get()
  @ApiOperation({ summary: 'Lịch mặc định: giờ làm việc + ngày nghỉ' })
  async get() {
    const cal = await this.repo.getDefaultWithDetails();
    return {
      id: cal.id,
      name: cal.name,
      timezone: cal.timezone,
      workingHours: cal.workingHours.map((w) => ({
        dayOfWeek: w.dayOfWeek,
        from: w.fromTime,
        to: w.toTime,
      })),
      holidays: cal.holidays.map((h) => ({
        id: h.id,
        date: h.date.toISOString().slice(0, 10),
        name: h.name,
        isRecurring: h.isRecurring,
      })),
    };
  }

  @AllowAuthenticated()
  @Get('add-working-days')
  @ApiOperation({ summary: 'date + n ngày LÀM VIỆC (bỏ cuối tuần + lễ VN) — §5C.4' })
  async addWorkingDays(@Query() q: AddWorkingDaysDto) {
    const cal = await this.repo.getDefaultWithDetails();
    const config = this.repo.toConfig(cal);
    return {
      input: q.date,
      days: q.days,
      result: addWorkingDays(q.date, q.days, config),
      inputIsWorkingDay: isWorkingDay(q.date, config),
    };
  }

  @AllowAuthenticated()
  @Get('working-minutes')
  @ApiOperation({ summary: 'Số phút làm việc giữa hai thời điểm (naive theo TZ lịch)' })
  async workingMinutes(@Query() q: WorkingMinutesDto) {
    if (q.from >= q.to) throw new AppException('COMMON.VALIDATION_FAILED');
    const cal = await this.repo.getDefaultWithDetails();
    return { minutes: workingMinutesBetween(q.from, q.to, this.repo.toConfig(cal)) };
  }

  @Post('holidays')
  @RequirePermission('setting:update')
  @ApiOperation({ summary: 'Thêm ngày nghỉ (lịch nghỉ chính thức từng năm là DATA)' })
  async addHoliday(@CurrentUser() user: AuthUser, @Body() dto: AddHolidayDto) {
    const cal = await this.repo.getDefaultWithDetails();
    const row = await this.repo.addHoliday(
      user.tenantId,
      cal.id,
      dto.date,
      dto.name,
      dto.isRecurring ?? false,
    );
    return { id: row.id, date: dto.date, name: dto.name, isRecurring: dto.isRecurring ?? false };
  }

  @Delete('holidays/:id')
  @RequirePermission('setting:update')
  @ApiOperation({ summary: 'Xoá ngày nghỉ' })
  async removeHoliday(@Param('id', ParseUUIDPipe) id: string) {
    const count = await this.repo.removeHoliday(id);
    if (count === 0) throw new AppException('COMMON.NOT_FOUND');
    return { ok: true };
  }
}
