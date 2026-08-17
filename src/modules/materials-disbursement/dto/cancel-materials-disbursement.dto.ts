import { IsNotEmpty, IsString } from 'class-validator';

export class CancelMaterialsDisbursementDto {
  @IsNotEmpty()
  @IsString()
  cancelReason: string;
}
