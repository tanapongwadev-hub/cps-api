import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Matches,
  ValidateNested,
} from 'class-validator';

export class CreateProductionPlanLineDto {
  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d*$/)
  productId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d*$/)
  materialId?: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsDateString()
  needByDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remark?: string;
}

export class CreateProductionPlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateProductionPlanLineDto)
  lines: CreateProductionPlanLineDto[];
}
