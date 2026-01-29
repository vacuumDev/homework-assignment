import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingCron } from './billing.cron';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomersModule } from '../customers/customers.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [PrismaModule, CustomersModule, ProductsModule],
  controllers: [BillingController],
  providers: [BillingService, BillingCron],
})
export class BillingModule {}
