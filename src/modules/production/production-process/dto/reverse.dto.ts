import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Take back one produce or transfer request (by its requestId, in the path).
 * `requestId` here is the new idempotency key of the reversal itself;
 * `reason` is required and kept on the ledger and in the audit event.
 */
export class ReverseDto {
  @IsUUID()
  requestId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
