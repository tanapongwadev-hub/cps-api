import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

const DECIMAL_PATTERN = /^\d+(\.\d{1,4})?$/;

export class IssueMaterialJobOrderItemDto {
  /** The pick line (ProductionPlanReservation.id) to consume. */
  @IsString()
  @IsNotEmpty()
  reservationId: string;

  /** Quantity to cut now, ≤ outstanding (reserved − issued). */
  @IsString()
  @Matches(DECIMAL_PATTERN, {
    message: 'quantity must be a positive decimal with up to 4 places',
  })
  quantity: string;
}

export class IssueMaterialJobOrderDto {
  @IsInt()
  version: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IssueMaterialJobOrderItemDto)
  items: IssueMaterialJobOrderItemDto[];
}
