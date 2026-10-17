import { Type } from 'class-transformer';
import {
  IsArray,
  IsString,
  IsNotEmpty,
  IsEmail,
  MinLength,
  IsOptional,
  ArrayNotEmpty,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class CreateAssignmentDto {
  /** null for a SYSTEM-scope role (e.g. SUPER_ADMIN). */
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  departmentId: string | null;

  @IsString()
  @IsNotEmpty()
  roleId: string;

  @IsOptional()
  permissionIds?: string[];
}

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  telephone?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateAssignmentDto)
  assignments: CreateAssignmentDto[];
}
