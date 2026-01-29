import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
