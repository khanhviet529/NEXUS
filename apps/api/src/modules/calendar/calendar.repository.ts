import { Injectable } from '@nestjs/common';
import type { CalendarConfig, WorkingInterval } from '@nexus/shared';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * [CORE nhẹ] GĐ7 — nạp business calendar từ DB thành CalendarConfig thuần
 * (§5C.4). Hàm tính (addWorkingDays…) nằm ở packages/shared — repository chỉ IO.
 */
@Injectable()
export class CalendarRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getDefaultWithDetails() {
    const calendar = await this.prisma.client.businessCalendar.findFirst({
      where: { isDefault: true },
      include: {
        workingHours: { orderBy: [{ dayOfWeek: 'asc' }, { fromTime: 'asc' }] },
        holidays: { orderBy: { date: 'asc' } },
      },
    });
    if (!calendar) throw new AppException('COMMON.NOT_FOUND');
    return calendar;
  }

  /** DB rows → config thuần cho hàm tính */
  toConfig(calendar: Awaited<ReturnType<CalendarRepository['getDefaultWithDetails']>>): CalendarConfig {
    const workingHours: Record<number, WorkingInterval[]> = {};
    for (const wh of calendar.workingHours) {
      (workingHours[wh.dayOfWeek] ??= []).push({ from: wh.fromTime, to: wh.toTime });
    }
    const holidays = new Set<string>();
    const recurringHolidays = new Set<string>();
    for (const h of calendar.holidays) {
      const iso = h.date.toISOString().slice(0, 10);
      if (h.isRecurring) recurringHolidays.add(iso.slice(5));
      else holidays.add(iso);
    }
    return { workingHours, holidays, recurringHolidays };
  }

  addHoliday(tenantId: string, calendarId: string, date: string, name: string, isRecurring: boolean) {
    return this.prisma.client.calendarHoliday.create({
      data: { tenantId, calendarId, date: new Date(`${date}T00:00:00Z`), name, isRecurring },
    });
  }

  async removeHoliday(id: string): Promise<number> {
    const res = await this.prisma.client.calendarHoliday.deleteMany({ where: { id } });
    return res.count;
  }
}
