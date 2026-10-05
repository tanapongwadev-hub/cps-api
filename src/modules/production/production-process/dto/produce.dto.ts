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
import { TransferAllocationDto } from './transfer.dto';

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

  /**
   * How good pieces pick their source lots: FIFO (default) or MANUAL, where
   * `allocations` names source lots (lots of the previous step waiting here)
   * and quantities adding up to `goodQty`. Rejects are always FIFO.
   */
  @IsOptional()
  @IsIn(['FIFO', 'MANUAL'])
  allocationMode?: 'FIFO' | 'MANUAL';

  @ValidateIf((o: ProduceDto) => o.allocationMode === 'MANUAL')
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TransferAllocationDto)
  allocations?: TransferAllocationDto[];

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
