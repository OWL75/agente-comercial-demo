/**
 * The founder offer shown on /fernan and in the demo's closing message.
 * Prices are the user's decision (2026-10-02): half price for the first
 * five businesses, monthly fee fixed for 12 months, 60-day guarantee.
 */
export const FOUNDER_OFFER = {
  slots: 5,
  setup: { list: 1500, founder: 750 },
  monthly: { list: 297, founder: 197, months: 12 },
  guaranteeDays: 60,
} as const;

export function usd(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** Public page where a prospect sees the offer and pays. */
export function landingUrl(): string | null {
  const base = process.env.PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  return base ? `${base}/fernan` : null;
}
