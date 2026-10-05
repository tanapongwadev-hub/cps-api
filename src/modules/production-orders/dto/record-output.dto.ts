import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** "บันทึกผลผลิต" at the first workflow step of one order line. */
export class RecordOutputDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  /** Production day YYYY-MM-DD; defaults to today (Asia/Bangkok). */
  @IsOptional()
  @IsDateString({ strict: true })
  workDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  shift?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

/** "ปิดยอดค้าง" — close the unproduced remainder of a line with a reason. */
export class CloseRemainingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
