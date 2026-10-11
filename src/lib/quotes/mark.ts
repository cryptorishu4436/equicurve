/**
 * Opening price of the launched token, in USD, using the quote token's own
 * market price. The launched token is not the quote token.
 *
 * implied USD = (initial market cap in quote tokens / supply) × USD per quote token.
 */

export type QuoteMarkInput = {
  referenceUsd: string;
  maxGapBps: number;
  quoteUsd: string;
};

export type QuoteMarkStatus = "not-set" | "passed" | "blocked" | "unavailable";

export type QuoteMarkAssessment = {
  status: QuoteMarkStatus;
  referenceUsd: string | null;
  quoteUsd: string | null;
  maxGapBps: number | null;
  /** Opening USD price of one base token. Null when the mark cannot be priced. */
  impliedUsd: string | null;
  gapBps: number | null;
  note: string;
};

export function parsePositiveDecimal(value: string): number | null {
  const raw = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function impliedOpeningUsd(args: {
  initialMarketCap: number;
  supply: number;
  quoteUsd: number;
}): number | null {
  if (!(args.initialMarketCap > 0) || !(args.supply > 0) || !(args.quoteUsd > 0)) return null;
  return (args.initialMarketCap / args.supply) * args.quoteUsd;
}

/** Absolute gap in basis points. Null when the reference is not a positive price. */
export function openingGapBps(impliedUsd: number, referenceUsd: number): number | null {
  if (!(impliedUsd > 0) || !(referenceUsd > 0)) return null;
  return Math.round((Math.abs(impliedUsd - referenceUsd) / referenceUsd) * 10_000);
}

export function assessQuoteMark(args: {
  mark: QuoteMarkInput | undefined;
  initialMarketCap: number;
  supply: number;
}): QuoteMarkAssessment {
  if (!args.mark) {
    return {
      status: "not-set",
      referenceUsd: null,
      quoteUsd: null,
      maxGapBps: null,
      impliedUsd: null,
      gapBps: null,
      note: "No quote-mark limit is set. The search does not compare the opening price with a reference.",
    };
  }
  const reference = parsePositiveDecimal(args.mark.referenceUsd);
  const quoteUsd = parsePositiveDecimal(args.mark.quoteUsd);
  const maxGap = args.mark.maxGapBps;
  if (reference == null || quoteUsd == null || !Number.isInteger(maxGap) || maxGap < 0) {
    return {
      status: "unavailable",
      referenceUsd: reference == null ? null : args.mark.referenceUsd,
      quoteUsd: quoteUsd == null ? null : args.mark.quoteUsd,
      maxGapBps: Number.isInteger(maxGap) ? maxGap : null,
      impliedUsd: null,
      gapBps: null,
      note: "The quote token's market price or the reference price is missing. The mark limit does not pass.",
    };
  }
  const implied = impliedOpeningUsd({
    initialMarketCap: args.initialMarketCap,
    supply: args.supply,
    quoteUsd,
  });
  const gap = implied == null ? null : openingGapBps(implied, reference);
  if (implied == null || gap == null) {
    return {
      status: "unavailable",
      referenceUsd: args.mark.referenceUsd,
      quoteUsd: args.mark.quoteUsd,
      maxGapBps: maxGap,
      impliedUsd: null,
      gapBps: null,
      note: "The opening price could not be priced in USD from the quote token. The mark limit does not pass.",
    };
  }
  const passed = gap <= maxGap;
  return {
    status: passed ? "passed" : "blocked",
    referenceUsd: args.mark.referenceUsd,
    quoteUsd: args.mark.quoteUsd,
    maxGapBps: maxGap,
    impliedUsd: String(implied),
    gapBps: gap,
    note: passed
      ? `Opening price is ${gap} bps from the reference, inside the ${maxGap} bps limit. The quote price is the quote token's market, not a claim that the launched token is that asset.`
      : `Opening price is ${gap} bps from the reference. The limit is ${maxGap} bps. Widen the limit on purpose and run the search again, or change the reference.`,
  };
}

/** Jupiter price payloads use `price` or `usdPrice`. Anything else is unavailable. */
export function parseQuoteUsd(body: unknown, mint: string): string | null {
  if (!body || typeof body !== "object") return null;
  const data = (body as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const row = (data as Record<string, unknown>)[mint];
  if (!row || typeof row !== "object") return null;
  const raw = (row as { price?: unknown; usdPrice?: unknown }).usdPrice ?? (row as { price?: unknown }).price;
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw : "";
  return parsePositiveDecimal(text) == null ? null : text;
}
