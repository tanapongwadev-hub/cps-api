import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class RoleActionsItemDto {
  @IsString()
  @Matches(/^[1-9]\d*$/)
  roleId: string;

  /** The complete set of action codes the role should have. */
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  actionCodes: string[];
}

export class UpdateRoleActionsDto {
  /** Required by the Audit catalog for permission changes. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RoleActionsItemDto)
  items: RoleActionsItemDto[];
}
