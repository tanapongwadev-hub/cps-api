import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

/**
 * Pack pieces of an FG/STORE lot into QR boxes. `qty` defaults to everything
 * still unpacked in the lot; `packSize` defaults to the line's packing
 * quantity. The last box holds the remainder.
 */
export class GeneratePackagesDto {
  @IsUUID()
  requestId: string;

  @IsString()
  @IsNotEmpty()
  fgLotId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  packSize?: number;
}
