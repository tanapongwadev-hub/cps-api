import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class UpdateUserAssignmentInputDto {
  @IsString()
  @IsOptional()
  id?: string;

  @ValidateIf((_object, value) => value !== null)
  @IsString()
  departmentId: string | null;

  @IsString()
  @IsNotEmpty()
  roleId: string;
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  telephone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  employeeCode?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UpdateUserAssignmentInputDto)
  @IsOptional()
  assignments?: UpdateUserAssignmentInputDto[];
}
