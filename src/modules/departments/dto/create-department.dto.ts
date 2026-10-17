import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  nameTh: string;

  @IsString()
  @IsNotEmpty()
  nameEn: string;

  @IsString()
  @IsOptional()
  description?: string;

  /** Group department id; omit for a top-level group. */
  @Matches(/^[1-9]\d*$/)
  @IsOptional()
  parentId?: string;
}
