import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { PermissionAccessScope } from '../../../entities/iam/permission.entity';

const ID_PATTERN = /^[1-9]\d*$/;

export class PermissionAccessItemDto {
  @IsString()
  @Matches(ID_PATTERN)
  permissionId: string;

  @IsIn(['ALL', 'DEPARTMENTS'])
  accessScope: PermissionAccessScope;

  /** Must be empty when accessScope is ALL. */
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(ID_PATTERN, { each: true })
  departmentIds: string[];
}

export class UpdatePermissionAccessDto {
  /** The `version` from GET /permissions/matrix the client edited. */
  @IsString()
  @IsNotEmpty()
  version: string;

  /** Required by the Audit catalog for access changes. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => PermissionAccessItemDto)
  items: PermissionAccessItemDto[];
}
