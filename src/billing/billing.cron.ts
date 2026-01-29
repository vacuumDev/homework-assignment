import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillingService } from './billing.service';

function formatError(err: unknown): { message: string; trace?: string } {
  if (err instanceof Error) {
    return {
      message: err.message || 'Unknown error',
      trace: err.stack,
    };
  }

  if (typeof err === 'string') {
    return { message: err };
  }

  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: 'Unknown non-serializable error' };
  }
}

@Injectable()
export class BillingCron {
  private readonly logger = new Logger(BillingCron.name);
  private isRunning = false;

  constructor(private readonly billingService: BillingService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    if (this.isRunning) {
      this.logger.warn('Billing cron skipped: previous run still in progress');
      return;
    }

    this.isRunning = true;
    try {
      const processed = await this.billingService.runBillingCron();
      this.logger.log(`Billing cron processed ${processed} usage events`);
    } catch (err: unknown) {
      // if crash log the error and continue running the cron
      const { message, trace } = formatError(err);
      this.logger.error(`Billing cron failed: ${message}`, trace);
    } finally {
      this.isRunning = false;
    }
  }
}
