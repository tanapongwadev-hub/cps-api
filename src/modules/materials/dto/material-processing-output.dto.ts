import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { MaterialLocationType } from '../../../entities/master/material.entity';

export class MaterialProcessingOutputDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @Matches(/^[1-9]\d*$/)
  unitId: string;

  @ValidateIf((dto: MaterialProcessingOutputDto) => dto.locationType !== undefined)
  @IsIn(Object.values(MaterialLocationType))
  locationType?: MaterialLocationType;

  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d*$/)
  modelId?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d*$/)
  loadingPointId?: string | null;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() || null : value)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  processLineName?: string | null;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() || null : value)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  scale?: string | null;

  @IsInt()
  @Min(1)
  @Max(1000000)
  packingQuantity: number;

  @IsOptional()
  @IsString()
  specification?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imagePath?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  updatedAt?: string;
}
