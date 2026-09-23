// en-US locale guarantees the "$" symbol regardless of the host's ICU data
// completeness (es-PA can fall back to "USD 7,240" on a small-icu Node build).
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const unitPriceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// timeZone: "UTC" matters here: Postgres DATE columns come back as JS Date
// objects at UTC midnight (via the `postgres` driver), so formatting in the
// host's local timezone would shift the displayed day backward whenever the
// server runs west of UTC (e.g. 2026-06-12 rendering as "11 jun").
const dateFormatter = new Intl.DateTimeFormat("es-419", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return currencyFormatter.format(value);
}

export function formatUnitPrice(value: number | null | undefined): string {
  if (value == null) return "—";
  return unitPriceFormatter.format(value);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormatter.format(date);
}

export function formatDays(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value} día${Math.abs(value) === 1 ? "" : "s"}`;
}
