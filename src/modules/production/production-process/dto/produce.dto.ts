import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { SHIFTS, type Shift } from '../../domain/production-day';

/**
 * Record real output at a workflow step. `requestId` (client-generated UUID)
 * makes the call idempotent: re-sending it returns the first result.
 * Production day/shift default to "now" (A 08:00–16:59, B 17:00–07:59);
 * give both to back-date (up to 2 days).
 */
export class ProduceDto {
  @IsUUID()
  requestId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  goodQty: number;

  @IsOptional()
  @IsDateString({ strict: true })
  productionDate?: string;

  @ValidateIf((o: ProduceDto) => o.productionDate !== undefined)
  @IsIn(SHIFTS)
  shift?: Shift;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
