import { describe, expect, it } from "vitest";
import { publishedFeeSplit, publishedPresetCard, resolvePartnerFeeClaimer } from "@/lib/presets/published";

describe("published equity preset", () => {
  it("splits the non-protocol fee and keeps the deployer when no partner is configured", () => {
    const previous = process.env.NEXT_PUBLIC_PARTNER_FEE_CLAIMER;
    delete process.env.NEXT_PUBLIC_PARTNER_FEE_CLAIMER;
    const card = publishedPresetCard();
    const split = publishedFeeSplit();
    expect(split.protocolPct).toBe(20);
    expect(split.creatorPct + split.partnerPct).toBe(80);
    expect(card.fee.partnerFeeClaimer).toBeNull();
    expect(resolvePartnerFeeClaimer("equity", "")).toBe("");
    expect(resolvePartnerFeeClaimer("equity", "So11111111111111111111111111111111111111112")).toBe(
      "So11111111111111111111111111111111111111112",
    );
    expect(card.legal.toLowerCase()).toContain("share");
    if (previous === undefined) delete process.env.NEXT_PUBLIC_PARTNER_FEE_CLAIMER;
    else process.env.NEXT_PUBLIC_PARTNER_FEE_CLAIMER = previous;
  });
});
