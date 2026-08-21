import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsIn,
  IsArray,
  ValidateNested,
} from 'class-validator';

// Accept both the legacy UI enum (MAIN | MENU | BUTTON) and the
// entity enum (MAIN | SUB) — the service normalises to MAIN | SUB before save.
const MENU_TYPES = ['MAIN', 'MENU', 'BUTTON', 'SUB'] as const;

export class CreateMenuPermissionDto {
  @IsString()
  @IsNotEmpty()
  permissionCode: string;

  @IsString()
  @IsNotEmpty()
  permissionName: string;

  @IsString()
  @IsNotEmpty()
  resource: string;

  @IsString()
  @IsNotEmpty()
  action: string;
}

export class CreateSubMenuDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  nameTh: string;

  @IsString()
  @IsNotEmpty()
  nameEn: string;

  @IsIn(MENU_TYPES)
  @IsOptional()
  menuType?: string;

  @IsString()
  @IsOptional()
  path?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateMenuPermissionDto)
  permissions?: CreateMenuPermissionDto[];
}

export class CreateMenuDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  nameTh: string;

  @IsString()
  @IsNotEmpty()
  nameEn: string;

  @IsIn(MENU_TYPES)
  @IsOptional()
  menuType?: string;

  @IsString()
  @IsOptional()
  path?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @IsString()
  @IsOptional()
  parentId?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateMenuPermissionDto)
  permissions?: CreateMenuPermissionDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateSubMenuDto)
  submenus?: CreateSubMenuDto[];
}
