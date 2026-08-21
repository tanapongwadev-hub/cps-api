import {
  IsString,
  IsIn,
  IsOptional,
  IsNumber,
  IsBoolean,
} from 'class-validator';

// Accept both the legacy UI enum (MAIN | MENU | BUTTON) and the
// entity enum (MAIN | SUB) — the service normalises to MAIN | SUB before save.
const MENU_TYPES = ['MAIN', 'MENU', 'BUTTON', 'SUB'] as const;

export class UpdateMenuDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  parentId?: string;

  @IsString()
  @IsOptional()
  nameTh?: string;

  @IsString()
  @IsOptional()
  nameEn?: string;

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

  @IsBoolean()
  @IsOptional()
  isVisible?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
