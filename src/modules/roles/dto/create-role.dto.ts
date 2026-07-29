import { IsString, IsNotEmpty, IsEnum, IsOptional, IsArray } from 'class-validator';
import { ScopeType } from '../../../common/enums/scope-type.enum';

export class CreateRoleDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  actionCodes?: string[];

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  nameTh: string;

  @IsString()
  @IsNotEmpty()
  nameEn: string;

  @IsEnum(ScopeType)
  @IsOptional()
  scopeType?: ScopeType;

  @IsString()
  @IsOptional()
  description?: string;
}
