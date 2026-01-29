import { IsInt, IsUUID, Min } from 'class-validator';

export class CreditWalletDto {
  @IsUUID()
  customerId: string;

  @IsInt()
  @Min(1)
  amountCents: number;
}
