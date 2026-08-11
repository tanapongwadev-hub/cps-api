import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { trimString } from './transforms';

export class CancelMaterialsReceivingDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1, { message: 'cancelReason is required' })
  @MaxLength(500)
  cancelReason: string;
}
