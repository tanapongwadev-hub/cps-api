import { IsNotEmpty, IsString } from 'class-validator';

export class CreateProductionOrderDto {
  @IsString()
  @IsNotEmpty()
  productionPlanId: string;
}
