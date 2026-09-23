const DECIMAL_SCALE = 4;

/**
 * Scaled-integer decimal helpers for NUMERIC(18,4) inventory quantities.
 * Extracted from the duplicated `toScaled`/`fromScaled` pair that used to
 * live independently in both `materials-disbursement.service.ts` and
 * `production-plans.service.ts` — keep every caller on this one
 * implementation so the scale/rounding behavior can never drift between
 * the two modules that share the same package-quantity ledger.
 */
export function toScaled(value: string | number): bigint {
  const text = String(value).trim();
  const sign = text.startsWith('-') ? -1n : 1n;
  const [wholeRaw, fractionRaw = ''] = text.replace(/^[+-]/, '').split('.');
  const whole = BigInt(wholeRaw || '0');
  const fraction = BigInt(
    (fractionRaw + '0'.repeat(DECIMAL_SCALE)).slice(0, DECIMAL_SCALE),
  );
  return sign * (whole * 10n ** BigInt(DECIMAL_SCALE) + fraction);
}

export function fromScaled(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const divisor = 10n ** BigInt(DECIMAL_SCALE);
  const whole = absolute / divisor;
  const fraction = String(absolute % divisor).padStart(DECIMAL_SCALE, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}
