const bangkokDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Bangkok',
  calendar: 'gregory',
  numberingSystem: 'latn',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Warehouse calendar date, independent of server timezone and locale layout. */
export function getBangkokDate(date: Date = new Date()): string {
  const parts = bangkokDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')!.value;
  const month = parts.find((part) => part.type === 'month')!.value;
  const day = parts.find((part) => part.type === 'day')!.value;
  return `${year}-${month}-${day}`;
}
