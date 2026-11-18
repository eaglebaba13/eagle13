/** Shared form validation. Returns a user-facing error without changing research formulas. */
export function dateRangeError(from: string, to: string): string | null {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid(from) || !valid(to)) return "Choose valid start and end dates.";
  return from > to ? "End date must be on or after start date." : null;
}

export function isThemeColor(value: string): boolean {
  if (/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) return true;
  const match = /^(rgb|rgba)\(([^)]+)\)$/i.exec(value.trim());
  if (!match) return false;
  const parts = match[2].split(",").map((part) => part.trim());
  if (parts.length !== (match[1].toLowerCase() === "rgba" ? 4 : 3) || parts.some((part) => !/^\d*\.?\d+$/.test(part))) return false;
  return parts.every((part, index) => Number(part) >= 0 && Number(part) <= (index === 3 ? 1 : 255));
}
