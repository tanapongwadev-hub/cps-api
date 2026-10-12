import { ArrayUnique, IsArray, IsInt, IsISO8601, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class SaveMaterialDraftDto {
  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) id?: string;
  @IsOptional() @IsISO8601({ strict: true }) updatedAt?: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) materialId?: string | null;
  @IsOptional() @IsISO8601({ strict: true }) materialUpdatedAt?: string | null;
  @IsOptional() @IsISO8601({ strict: true }) outputUpdatedAt?: string | null;
  @IsInt() @Min(0) @Max(2) step: number;
  @IsObject() data: Record<string, unknown>;
  @IsArray() @ArrayUnique() @IsString({ each: true }) @Matches(/^[1-9]\d*$/, { each: true }) supplierIds: string[];
  @IsOptional() @IsString() @MaxLength(500) imagePath?: string | null;
  @IsOptional() @IsString() @MaxLength(500) outputImagePath?: string | null;
}
