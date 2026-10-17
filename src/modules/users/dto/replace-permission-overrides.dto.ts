import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class PermissionOverrideItemDto {
  @IsString()
  @Matches(/^[1-9]\d*$/)
  permissionId: string;

  @IsIn(['ALLOW', 'DENY'])
  effect: 'ALLOW' | 'DENY';

  /** ISO date-time; null/omitted = no expiry. */
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}

export class ReplacePermissionOverridesDto {
  /** Required by the Audit catalog for access changes. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  /** The complete override set of the assignment; [] removes every override. */
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PermissionOverrideItemDto)
  items: PermissionOverrideItemDto[];
}
