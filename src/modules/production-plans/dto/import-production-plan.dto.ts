import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ImportProductionPlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string;
}
