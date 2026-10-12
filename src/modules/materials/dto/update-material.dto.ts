import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  MaterialShape,
  MaterialLocationType,
  MaterialType,
} from '../../../entities/master/material.entity';

import { MaterialProcessingOutputDto } from './material-processing-output.dto';

const POSITIVE_DECIMAL_ID = /^[1-9]\d*$/;

function sourceValue(params: TransformFnParams): unknown {
  const source: unknown = params.obj;
  if (
    source !== null &&
    typeof source === 'object' &&
    Object.prototype.hasOwnProperty.call(source, params.key)
  ) {
    return Reflect.get(source, params.key);
  }
  return params.value;
}

function trimString(params: TransformFnParams): unknown {
  const value = sourceValue(params);
  return typeof value === 'string' ? value.trim() : value;
}

function nullableTrimmedString(params: TransformFnParams): unknown {
  const value = sourceValue(params);
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function trimStringArray(params: TransformFnParams): unknown {
  const value = sourceValue(params);
  if (!Array.isArray(value)) return value;
  const items: unknown[] = value;
  return items.map((item) => (typeof item === 'string' ? item.trim() : item));
}

export class UpdateMaterialDto {
  @IsOptional() @IsString() @Matches(POSITIVE_DECIMAL_ID)
  draftId?: string;
  @IsOptional() @IsISO8601({ strict: true })
  draftUpdatedAt?: string;
  @ValidateIf((value: UpdateMaterialDto) => value.processingOutput !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => MaterialProcessingOutputDto)
  processingOutput?: MaterialProcessingOutputDto;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @IsIn(['PC', 'OF', 'OF_MAT'])
  type?: MaterialType | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @IsIn(['PCS', 'PIPE', 'SHEET', 'COIL'])
  materialType?: MaterialShape | null;

  @ValidateIf((dto: UpdateMaterialDto) => dto.locationType !== undefined)
  @IsIn(Object.values(MaterialLocationType))
  locationType?: MaterialLocationType;

  /**
   * `ratio` is required when changing `materialType` to PIPE / SHEET / COIL.
   * For PCS, ratio must be omitted (and the service will force it to null).
   * When `materialType` is not provided, ratio is validated only if it is sent.
   * If the client omits `ratio` while `materialType` is PIPE/SHEET/COIL, the
   * service layer (`resolveUpdateRatio`) will reject the request.
   */
  @Transform(sourceValue)
  @IsOptional()
  @ValidateIf(
    (o: UpdateMaterialDto) =>
      o.materialType === undefined ||
      o.materialType === null ||
      o.materialType !== MaterialShape.PCS,
  )
  @IsInt({ message: 'ratio must be an integer number' })
  @Min(1, { message: 'ratio must be >= 1' })
  ratio?: number | null;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  unitId?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  deliveryTypeId?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  materialTypeId?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  modelId?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  loadingPointId?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  processLineName?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  scale?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imagePath?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  specification?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  description?: string | null;

  @Transform(sourceValue)
  @IsOptional()
  @IsInt()
  @Min(1)
  packingQuantity?: number | null;

  @Transform(sourceValue)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  minimumStock?: number;

  @Transform(trimStringArray)
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(POSITIVE_DECIMAL_ID, { each: true })
  supplierIds?: string[];

  @Transform(sourceValue)
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Transform(sourceValue)
  @IsISO8601({ strict: true })
  updatedAt: string;
}
