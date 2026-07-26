import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsNotEmpty,
} from 'class-validator';

export class UpdateAssignmentDto {
  @IsString()
  @IsNotEmpty()
  departmentId: string;

  @IsString()
  @IsNotEmpty()
  roleId: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsOptional()
  permissionIds?: string[];
}
