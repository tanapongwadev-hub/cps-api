import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdatePermissionDto {
  @IsString()
  @IsOptional()
  menuId?: string;

  @IsString()
  @IsOptional()
  actionId?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
