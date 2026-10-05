import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Omit `quantity` to move the whole box. A smaller quantity means only that
 * many pieces were produced at this step: they are split into a new box that
 * moves on, and the rest stays on hold at the current step.
 */
export class AdvancePacketDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;
}
