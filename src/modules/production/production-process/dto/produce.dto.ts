import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { SHIFTS, type Shift } from '../../domain/production-day';

export class RejectLineDto {
  @IsString()
  @IsNotEmpty()
  reasonId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty: number;
}

/**
 * Record real output at a workflow step. `requestId` (client-generated UUID)
 * makes the call idempotent: re-sending it returns the first result.
 * `goodQty` + rejects are drawn from the step's WIP (FIFO); at least one
 * piece in total. Production day/shift default to "now"
 * (A 08:00–16:59, B 17:00–07:59); give both to back-date (up to 2 days).
 */
export class ProduceDto {
  @IsUUID()
  requestId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  goodQty: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RejectLineDto)
  rejects?: RejectLineDto[];

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
