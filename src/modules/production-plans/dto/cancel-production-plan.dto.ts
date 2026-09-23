import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancelProductionPlanDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
