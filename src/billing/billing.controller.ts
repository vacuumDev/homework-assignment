import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CreditWalletDto } from './dto/credit-wallet.dto';
import { BalanceView } from './dto/balance.view';
import { SubmitUsageDto } from './dto/submit-usage.dto';
import { BillingService } from './billing.service';
import { UsageEventView } from './dto/usage-event.view';
import { CreditResultView } from './dto/credit-result.view';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('usage')
  async submitUsage(@Body() dto: SubmitUsageDto): Promise<UsageEventView> {
    return this.billingService.submitUsage(dto);
  }

  @Post('credit')
  async creditWallet(@Body() dto: CreditWalletDto): Promise<CreditResultView> {
    return this.billingService.creditWallet(dto);
  }

  @Get('balance/:customerId')
  async getBalance(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
  ): Promise<BalanceView> {
    return this.billingService.getBalance(customerId);
  }
}
