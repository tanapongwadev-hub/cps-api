import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class ListMaterialProcessingDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;

  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @IsIn(['WAITING', 'PARTIAL', 'PROCESSED'])
  status?: 'WAITING' | 'PARTIAL' | 'PROCESSED';
}

export class CreateMaterialProcessingDto {
  @IsUUID()
  requestKey: string;

  @Matches(/^[1-9]\d*$/)
  sourceReceivingId: string;

  @Matches(/^[1-9]\d*$/)
  targetMaterialId: string;

  @IsInt() @Min(1) @Max(1000000)
  sourceQuantity: number;

  @IsInt() @Min(1) @Max(1000000)
  piecesPerUnit: number;

  @IsInt() @Min(0) @Max(1000000000)
  scrapQuantity: number;

  @IsInt() @Min(1) @Max(1000000)
  packingQuantity: number;

  @IsOptional() @IsString() @MaxLength(1000)
  remark?: string;
}
