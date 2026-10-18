import { IsString, MaxLength, MinLength } from 'class-validator';

export class DeleteProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  confirmationCode: string;
}
