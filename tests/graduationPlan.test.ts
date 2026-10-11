import { describe, expect, it } from "vitest";
import { marketConfigFingerprint } from "@/lib/dbc/configFingerprint";
import {
  attestGraduation,
  baseFactorForFee,
  feeBpsFromBaseFactor,
  graduationFingerprint,
} from "@/lib/graduation/plan";
import { designPolicy, materializeRecipe } from "@/lib/market/policy";

const brief = {
  asset: "tokenized-equity" as const,
  objective: "controlled-discovery" as const,
  quote: "SOL" as const,
  targetRaise: "20",
  typicalTrade: "0.5",
  participants: 8,
  stressPaths: 4,
  seed: 2,
};

describe("graduation plan", () => {
  it("binds a DLMM fee to an integer base factor without changing the curve fingerprint", () => {
    expect(baseFactorForFee(25, 100)).toBe(40_000);
    expect(feeBpsFromBaseFactor(25, 40_000)).toBe(100);
    expect(baseFactorForFee(15, 2)).toBeNull();

    const plain = designPolicy(brief);
    const planned = designPolicy({
      ...brief,
      graduation: { venue: "dlmm", binStep: 25, feeBps: 100, rangeBins: 10 },
    });
    const plainConfig = materializeRecipe(plain.chosen.recipe);
    const plannedConfig = materializeRecipe(planned.chosen.recipe);
    expect(marketConfigFingerprint(plannedConfig)).toBe(marketConfigFingerprint(plainConfig));
    const attestation = attestGraduation(planned.brief.graduation);
    expect(attestation.plan.venue).toBe("dlmm");
    expect(attestation.fingerprint).not.toBe(graduationFingerprint({ venue: "damm-v2" }));
    expect(attestation.note.toLowerCase()).toContain("damm v2");
  });
});
