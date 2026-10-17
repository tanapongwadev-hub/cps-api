import { IsString, IsOptional, Matches, ValidateIf } from 'class-validator';

export class UpdateDepartmentDto {
  @IsString()
  @IsOptional()
  nameTh?: string;

  @IsString()
  @IsOptional()
  nameEn?: string;

  @IsString()
  @IsOptional()
  description?: string;

  /** Group department id, or null to make it a top-level group. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Matches(/^[1-9]\d*$/)
  parentId?: string | null;
}
