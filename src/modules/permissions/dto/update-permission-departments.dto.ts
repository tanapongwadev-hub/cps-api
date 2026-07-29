import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class UpdatePermissionDepartmentsDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  departmentIds: string[];
}
