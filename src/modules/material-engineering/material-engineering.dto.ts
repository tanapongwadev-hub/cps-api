import { OmitType } from '@nestjs/mapped-types';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateBomDto, CreateBomItemDto } from '../boms/dto/create-bom.dto';
import { CreateProductWorkflowDto } from '../product-workflows/dto/create-product-workflow.dto';

class MaterialBomItemDto extends OmitType(CreateBomItemDto, ['quantity', 'wastagePercent'] as const) {
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(1000000000) quantity: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) wastagePercent?: number | null;
}
export class CreateMaterialBomDto extends OmitType(CreateBomDto, ['productId', 'effectiveFrom', 'effectiveTo', 'items'] as const) {
  @IsString() @Matches(/^[1-9]\d*$/) materialId: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => MaterialBomItemDto) items: MaterialBomItemDto[];
}
export class CreateMaterialWorkflowDto extends OmitType(CreateProductWorkflowDto, ['productId'] as const) {
  @IsString() @Matches(/^[1-9]\d*$/) materialId: string;
}
