import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class DeleteMaterialDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  confirmationCode: string;

  /** Also delete the material's own BOM versions (material_boms + items). */
  @IsOptional()
  @IsBoolean()
  includeBom?: boolean;
}
