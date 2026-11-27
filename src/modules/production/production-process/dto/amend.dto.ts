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
import { RejectLineDto } from './produce.dto';

/**
 * Edit one produce/receive request (by its requestId, in the path) before its
 * pieces move on: the old record is reversed and the new values recorded, in
 * one transaction. Two idempotency keys — `reverseRequestId` for the reversal
 * and `requestId` for the new record — so a retry replays both.
 */
export class AmendDto {
  @IsUUID()
  requestId: string;

  @IsUUID()
  reverseRequestId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

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

  @ValidateIf((o: AmendDto) => o.productionDate !== undefined)
  @IsIn(SHIFTS)
  shift?: Shift;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
