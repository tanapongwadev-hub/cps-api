import { PartialType } from '@nestjs/swagger';
import { CreateMaterialsDisbursementDto } from './create-materials-disbursement.dto';

export class UpdateMaterialsDisbursementDto extends PartialType(
  CreateMaterialsDisbursementDto,
) {}
