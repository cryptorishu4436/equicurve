import type { CurvePhase, DestinationCheck } from "@/lib/dbc/curveState";

export function formatProgressRatio(progress: number | null, fractionDigits = 2): string {
  if (progress == null || !Number.isFinite(progress)) return "unknown";
  return `${(Math.min(1, Math.max(0, progress)) * 100).toFixed(fractionDigits)}%`;
}

function fixedSignificant(value: number, digits = 6): string {
  if (!(value > 0) || !Number.isFinite(value)) return "—";
  const places = Math.min(18, Math.max(0, digits - Math.floor(Math.log10(value)) - 1));
  return value.toFixed(places).replace(/\.?0+$/, "");
}

/** Keep a plain decimal string's leading zeros. Number() would round 0.00000001366. */
function formatDecimalString(value: string, significant = 8): string | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  if (whole !== "0") {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) && numeric > 0 ? fixedSignificant(numeric, significant) : null;
  }
  const zeros = frac.match(/^0*/)?.[0].length ?? 0;
  const digits = frac.slice(zeros, zeros + significant).replace(/0+$/, "");
  if (!digits) return null;
  return `0.${"0".repeat(zeros)}${digits}`;
}

function quotePrice(precise: string, quote: string, ticker?: string) {
  const unit = quote === "USD" ? `$${precise}` : `${precise} ${quote}`;
  return {
    primary: ticker ? `${unit} / ${ticker}` : unit,
    secondary: unit,
  };
}

export function formatTokenPrice(price: number, quote: string, ticker = "token") {
  if (!(price > 0) || !Number.isFinite(price)) return { primary: "Unavailable", secondary: "Price unavailable" };
  return quotePrice(fixedSignificant(price, 8), quote, ticker);
}

/** Exact-string counterpart used by the server metrics contract. */
export function formatTokenPriceExact(price: string | null, quote: string, ticker = "token") {
  if (!price) return { primary: "Unavailable", secondary: "Price unavailable" };
  const precise = formatDecimalString(price, 8) ?? (() => {
    const numeric = Number(price);
    return numeric > 0 && Number.isFinite(numeric) ? fixedSignificant(numeric, 8) : null;
  })();
  if (!precise) return { primary: "Unavailable", secondary: "Price unavailable" };
  return quotePrice(precise, quote, ticker);
}

export function formatPriceAxis(price: number, quote: string): string {
  if (!(price >= 0) || !Number.isFinite(price)) return "—";
  if (price === 0) return quote === "USD" ? "$0" : "0";
  const precise = fixedSignificant(price, price < 0.001 ? 8 : 4);
  return quote === "USD" ? `$${precise}` : precise;
}

export function formatMetricValue(value: string | null, unit: "SOL" | "USD"): string {
  if (value == null) return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  if (numeric === 0) return unit === "USD" ? "$0" : "0 SOL";
  if (unit === "USD") {
    if (Math.abs(numeric) >= 1_000) {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(numeric);
    }
    return `$${fixedSignificant(numeric, 8)}`;
  }
  return `${fixedSignificant(numeric, 8)} SOL`;
}

/** Locale/time-zone independent output keeps server and browser hydration identical. */
export function formatMarketTimestamp(value: string | number | Date, includeDate = true): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "unknown";
  const text = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...(includeDate ? { year: "numeric", month: "short", day: "2-digit" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${text} UTC`;
}

export function formatPermanentLock(lockPct: number | null | undefined): string {
  if (lockPct == null || !Number.isFinite(lockPct)) return "Configured lock unavailable";
  return lockPct === 100
    ? "100% permanently locked"
    : `${lockPct}% configured permanent lock`;
}

export function formatQuoteReserveLabel(quoteLabel: string): string {
  return `Quote reserve (${quoteLabel})`;
}

export type MarketLifecycle = { label: string; activeVenue: "DBC" | "DAMM v2" | "Pending" | "Unknown"; tradeEnabled: boolean };

export function marketLifecycle(phase: CurvePhase, destination: DestinationCheck): MarketLifecycle {
  if (phase === "migrated") return {
    label: destination === "exists" ? "Migrated · DAMM v2" : destination === "rpc_unavailable" ? "Migrated · venue unknown" : "Migrated · verifying DAMM v2",
    activeVenue: destination === "exists" ? "DAMM v2" : destination === "rpc_unavailable" ? "Unknown" : "Pending",
    tradeEnabled: destination === "exists",
  };
  if (phase === "complete") return { label: "Curve complete · eligible to migrate", activeVenue: "Pending", tradeEnabled: false };
  if (phase === "raising") return { label: "Raising on DBC", activeVenue: "DBC", tradeEnabled: true };
  return { label: "Lifecycle unknown", activeVenue: "Unknown", tradeEnabled: false };
}
