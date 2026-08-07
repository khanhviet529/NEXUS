import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarRepository } from './calendar.repository';

/** [CORE nhẹ] Business calendar §5C.4 — SLA engine là OPT, KHÔNG nằm ở đây */
@Module({
  controllers: [CalendarController],
  providers: [CalendarRepository],
  exports: [CalendarRepository],
})
export class CalendarModule {}
