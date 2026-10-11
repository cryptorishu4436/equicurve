import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { QUOTE_ASSETS, isQuoteId, quoteDecimals, stockQuoteForMint } from "@/lib/quotes/catalog";
import { designPolicy, materializeRecipe } from "@/lib/market/policy";
import { marketConfigFingerprint } from "@/lib/dbc/configFingerprint";

describe("quote catalog", () => {
  it("pins unique mainnet mints that decode as public keys", () => {
    const mints = QUOTE_ASSETS.map((asset) => asset.mainnetMint);
    expect(new Set(mints).size).toBe(mints.length);
    for (const asset of QUOTE_ASSETS) {
      expect(asset.mainnetMint && new PublicKey(asset.mainnetMint).toBase58()).toBe(asset.mainnetMint);
      if (asset.kind === "stock") {
        expect(stockQuoteForMint(asset.mainnetMint ?? "")?.id).toBe(asset.id);
        expect(asset.claim.toLowerCase()).toContain("not");
      }
    }
  });

  it("searches a stock quote in quote-token units and keeps 8 decimals", () => {
    const policy = designPolicy({
      asset: "tokenized-equity",
      objective: "controlled-discovery",
      quote: "AAPLx",
      targetRaise: "10",
      typicalTrade: "0.25",
      participants: 12,
      stressPaths: 4,
      seed: 1,
    });
    expect(policy.brief.quote).toBe("AAPLx");
    expect(quoteDecimals("AAPLx")).toBe(8);
    const config = materializeRecipe(policy.chosen.recipe);
    const sol = materializeRecipe(designPolicy({ ...policy.brief, quote: "SOL" }).chosen.recipe);
    const stockAtoms = (config as { migrationQuoteThreshold: { toString(): string } }).migrationQuoteThreshold.toString();
    const solAtoms = (sol as { migrationQuoteThreshold: { toString(): string } }).migrationQuoteThreshold.toString();
    expect(stockAtoms).not.toBe(solAtoms);
    expect(isQuoteId("AAPLx")).toBe(true);
    expect(marketConfigFingerprint(config)).toHaveLength(32);
  });
});
