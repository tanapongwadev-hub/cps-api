import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Close pieces waiting at a step that will not be produced (e.g. material ran
 * short). `qty` defaults to everything waiting there; taken oldest first.
 * The reason is required.
 */
export class CloseRemainingDto {
  @IsUUID()
  requestId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
