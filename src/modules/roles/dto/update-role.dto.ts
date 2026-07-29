import { IsString, IsEnum, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { ScopeType } from '../../../common/enums/scope-type.enum';

export class UpdateRoleDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  actionCodes?: string[];

  @IsString()
  @IsOptional()
  code?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  nameTh?: string;

  @IsString()
  @IsOptional()
  nameEn?: string;

  @IsEnum(ScopeType)
  @IsOptional()
  scopeType?: ScopeType;

  @IsString()
  @IsOptional()
  description?: string;
}
