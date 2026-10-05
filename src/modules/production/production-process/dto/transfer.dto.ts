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

export class TransferAllocationDto {
  @IsString()
  @IsNotEmpty()
  lotId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty: number;
}

/**
 * Send produced pieces of a step on to the next step. FIFO (default) takes
 * the step's oldest lots first; MANUAL names the lots and quantities, which
 * must add up to `qty`. The rest stays "ready to transfer" at the step.
 */
export class TransferDto {
  @IsUUID()
  requestId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty: number;

  @IsOptional()
  @IsIn(['FIFO', 'MANUAL'])
  allocationMode?: 'FIFO' | 'MANUAL';

  @ValidateIf((o: TransferDto) => o.allocationMode === 'MANUAL')
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TransferAllocationDto)
  allocations?: TransferAllocationDto[];

  @IsOptional()
  @IsDateString({ strict: true })
  transferDate?: string;

  @ValidateIf((o: TransferDto) => o.transferDate !== undefined)
  @IsIn(SHIFTS)
  shift?: Shift;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
