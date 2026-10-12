import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateProductStockMovementDto {
  @IsUUID('4')
  requestId: string;

  @IsIn(['receive', 'issue'])
  type: 'receive' | 'issue';

  @IsNumber({ maxDecimalPlaces: 4, allowNaN: false, allowInfinity: false })
  @Min(0.0001)
  @Max(1000000000)
  quantity: number;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  referenceNo: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remark?: string;
}
