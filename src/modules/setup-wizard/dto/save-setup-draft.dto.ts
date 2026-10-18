import { IsISO8601, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class SaveSetupDraftDto {
  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/)
  id?: string;

  @IsOptional() @IsISO8601({ strict: true })
  updatedAt?: string;

  @IsString() @MaxLength(255)
  title: string;

  @IsInt() @Min(0) @Max(4)
  step: number;

  @IsObject()
  data: Record<string, unknown>;
}
