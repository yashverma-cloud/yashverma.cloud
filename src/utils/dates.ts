const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** '2026-03' -> 'Mar 2026'. Partial dates stay partial; nothing is guessed. */
export function formatMonth(value: string): string {
  const [year, month] = value.split('-');
  if (!year) return value;
  if (!month) return year;
  const label = MONTHS[Number(month) - 1];
  return label ? `${label} ${year}` : year;
}

/**
 * '2026-09-27' -> '27 Sep 2026'. Posts carry a full date, and `formatMonth` drops the day,
 * so a post line needs its own formatter rather than a looser date on the page.
 * A value with no day falls back to the month label; nothing is guessed.
 */
export function formatDay(value: string): string {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return formatMonth(value);
  const label = MONTHS[Number(month) - 1];
  return label ? `${Number(day)} ${label} ${year}` : formatMonth(value);
}

/** Inclusive range label for a role. An absent end means the role is current. */
export function formatRange(start: string, end?: string): string {
  return `${formatMonth(start)} – ${end ? formatMonth(end) : 'present'}`;
}

/** ISO value for <time datetime="..."> — the machine-readable half. */
export function isoRange(start: string, end?: string): string {
  return end ? `${start}/${end}` : start;
}
