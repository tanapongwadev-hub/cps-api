import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateProductionOrderDto {
  @IsString()
  @IsNotEmpty()
  productionPlanId: string;

  /**
   * PACKET (default) = per-step boxes; LOT = lot traceability (plan quantity
   * released as WIP at the first step). Stays PACKET until the lot screens
   * ship (plan Phase 8).
   */
  @IsOptional()
  @IsIn(['PACKET', 'LOT'])
  trackingModel?: 'PACKET' | 'LOT';
}
