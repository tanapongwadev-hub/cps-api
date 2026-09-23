import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class PickMaterialJobOrderDto {
  @IsInt()
  version: number;

  /** The pick line (ProductionPlanReservation.id) being confirmed. */
  @IsString()
  @IsNotEmpty()
  reservationId: string;

  /** The scanned/typed QR content — must equal that package's lotDetailNo. */
  @IsString()
  @IsNotEmpty()
  scannedCode: string;
}
