import { describe, expect, it } from "vitest";
import { WSOL_MINT } from "@/lib/constants";
import { resolveWizardQuote } from "@/lib/quotes/resolve";

describe("resolveWizardQuote", () => {
  it("resolves the default SOL quote instead of recursing", () => {
    const quote = resolveWizardQuote({ quote: "SOL" });
    expect(quote.available).toBe(true);
    expect(quote.mint).toBe(WSOL_MINT.toBase58());
    expect(quote.decimals).toBe(9);
    expect(quote.claim.length).toBeGreaterThan(0);
  });

  it("keeps a custom quote unresolved until the mint and decimals are checked", () => {
    expect(resolveWizardQuote({
      quote: "CUSTOM",
      customQuoteMint: "",
      customQuoteDecimals: null,
    })).toMatchObject({
      available: false,
      mint: null,
      unavailableReason: "Paste a quote mint and wait for the decimal and badge check.",
    });
    expect(resolveWizardQuote({
      quote: "CUSTOM",
      customQuoteMint: "Mint111111111111111111111111111111111111111",
      customQuoteDecimals: 6,
    })).toMatchObject({
      available: true,
      mint: "Mint111111111111111111111111111111111111111",
      decimals: 6,
      unavailableReason: null,
    });
  });
});
