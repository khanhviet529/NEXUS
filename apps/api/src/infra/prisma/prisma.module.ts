import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PartitionMaintenanceRepository } from './partition-maintenance.repository';

@Global()
@Module({
  providers: [PrismaService, PartitionMaintenanceRepository],
  exports: [PrismaService, PartitionMaintenanceRepository],
})
export class PrismaModule {}
