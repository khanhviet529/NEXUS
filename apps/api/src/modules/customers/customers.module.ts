import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomersController } from './customers.controller';
import { CustomersRepository } from './customers.repository';

@Module({
  imports: [AuthModule],
  controllers: [CustomersController],
  providers: [CustomersRepository],
})
export class CustomersModule {}
