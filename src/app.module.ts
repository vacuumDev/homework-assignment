import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProductsModule } from './products/products.module';
import { CustomersModule } from './customers/customers.module';
import { BillingModule } from './billing/billing.module';
import Joi from 'joi';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string()
          .pattern(/^file:(\.\/.+|\/.+|[A-Za-z]:\\.+|\/[A-Za-z]:\/.+)$/)
          .required(),
      }),
    }),
    ProductsModule,
    CustomersModule,
    BillingModule,
  ],
})
export class AppModule {}
