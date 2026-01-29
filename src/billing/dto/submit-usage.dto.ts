import { IsInt, IsUUID, Min } from 'class-validator';

export class SubmitUsageDto {
  @IsUUID()
  customerId: string;

  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  units: number;
}
