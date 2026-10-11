import { describe, expect, it } from "vitest";
import { assessQuoteMark, openingGapBps, parseQuoteUsd } from "@/lib/quotes/mark";
import { classifyQuoteMint } from "@/lib/quotes/inspect";
import { dlmmRangeMatches, plannedRangeWidth } from "@/lib/graduation/range";
import { WSOL_MINT } from "@/lib/constants";

describe("quote mark", () => {
  it("blocks an opening price outside the issuer's limit and passes after the limit is widened", () => {
    const blocked = assessQuoteMark({
      mark: { referenceUsd: "1", maxGapBps: 50, quoteUsd: "100" },
      initialMarketCap: 2,
      supply: 100,
    });
    expect(blocked.status).toBe("blocked");
    expect(blocked.gapBps).toBe(openingGapBps(2, 1));
    const widened = assessQuoteMark({
      mark: { referenceUsd: "1", maxGapBps: 10_000, quoteUsd: "100" },
      initialMarketCap: 2,
      supply: 100,
    });
    expect(widened.status).toBe("passed");
  });

  it("does not invent a price when the payload has none", () => {
    expect(parseQuoteUsd({ data: {} }, "mint")).toBeNull();
    expect(parseQuoteUsd({ data: { mint: { usdPrice: "1.25" } } }, "mint")).toBe("1.25");
    expect(assessQuoteMark({ mark: { referenceUsd: "1", maxGapBps: 10, quoteUsd: "" }, initialMarketCap: 1, supply: 1 }).status).toBe("unavailable");
  });
});

describe("custom quote inspection", () => {
  it("keeps SOL unlabelled as a stock and refuses a mint without a badge", () => {
    expect(classifyQuoteMint({ mint: WSOL_MINT.toBase58(), decimals: 9, badgeExists: false }).ok).toBe(true);
    const refused = classifyQuoteMint({
      mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
      decimals: 8,
      badgeExists: false,
    });
    expect(refused.ok).toBe(false);
    const custom = classifyQuoteMint({
      mint: "11111111111111111111111111111112",
      decimals: 8,
      badgeExists: true,
    });
    expect(custom.ok && custom.label).toBe("CUSTOM");
  });
});

describe("DLMM range", () => {
  it("matches a position that covers the planned bins on each side", () => {
    const plan = { venue: "dlmm" as const, binStep: 25 as const, feeBps: 100, rangeBins: 10 };
    expect(plannedRangeWidth(10)).toBe(20);
    expect(dlmmRangeMatches(plan, { lowerBinId: 80, upperBinId: 100 }).ok).toBe(true);
    expect(dlmmRangeMatches(plan, { lowerBinId: 80, upperBinId: 90 }).ok).toBe(false);
    expect(dlmmRangeMatches(plan, null).ok).toBe(false);
  });
});
