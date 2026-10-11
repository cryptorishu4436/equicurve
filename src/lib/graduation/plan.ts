import { sha256Hex } from "@/lib/market/hash";
import { FINGERPRINT_HEX_LEN } from "@/lib/dbc/configFingerprint";

/**
 * Where the issuer wants liquidity to live after the curve fills.
 *
 * DBC's program migrates a new config to DAMM v2. A DLMM plan does not change
 * that. It is a second pool, opened by the issuer, whose bin step, fee, and
 * range are bound by this fingerprint.
 */

export const DLMM_BIN_STEPS = [1, 5, 10, 15, 20, 25, 50, 80, 100] as const;
export type DlmmBinStep = (typeof DLMM_BIN_STEPS)[number];

/** DLMM base factor is a u16. Fee bps must land on an integer factor. */
export const DLMM_MAX_BASE_FACTOR = 65_535;

export type DammV2Graduation = { venue: "damm-v2" };

export type DlmmGraduation = {
  venue: "dlmm";
  binStep: DlmmBinStep;
  /** Swap fee in basis points. Must divide evenly into a u16 base factor. */
  feeBps: number;
  /** Bins on each side of the active bin the issuer intends to cover. */
  rangeBins: number;
};

export type GraduationPlan = DammV2Graduation | DlmmGraduation;

export type GraduationAttestation = {
  plan: GraduationPlan;
  canonical: string;
  fingerprint: string;
  note: string;
};

const DAMM_NOTE =
  "The DBC program migrates this config into a DAMM v2 pool. That migration is part of the curve fingerprint.";

const DLMM_NOTE =
  "The DBC program still migrates into DAMM v2. This plan opens a separate DLMM pool after that migration. The bin step, fee, and range are bound here. They are not a claim that the bonding curve migrates directly into DLMM. Opening the pool does not add liquidity.";

export function isDlmmBinStep(value: number): value is DlmmBinStep {
  return (DLMM_BIN_STEPS as readonly number[]).includes(value);
}

/**
 * baseFee numerator uses power factor 0:
 * feeBps = baseFactor * binStep / 10_000, so baseFactor = feeBps * 10_000 / binStep.
 * FEE_PRECISION is 1e9 and the SDK multiplies by 10, which cancels to this ratio.
 */
export function baseFactorForFee(binStep: number, feeBps: number): number | null {
  if (!Number.isInteger(binStep) || binStep <= 0) return null;
  if (!Number.isInteger(feeBps) || feeBps <= 0) return null;
  const numerator = feeBps * 10_000;
  if (numerator % binStep !== 0) return null;
  const factor = numerator / binStep;
  if (factor < 1 || factor > DLMM_MAX_BASE_FACTOR) return null;
  return factor;
}

export function feeBpsFromBaseFactor(binStep: number, baseFactor: number): number | null {
  if (!Number.isInteger(binStep) || !Number.isInteger(baseFactor)) return null;
  const product = baseFactor * binStep;
  if (product % 10_000 !== 0) return null;
  return product / 10_000;
}

export function parseGraduationPlan(
  input:
    | { venue: "damm-v2" }
    | { venue: "dlmm"; binStep: number; feeBps: number; rangeBins: number }
    | undefined
    | null,
): GraduationPlan {
  if (!input || input.venue === "damm-v2") return { venue: "damm-v2" };
  if (input.venue !== "dlmm") {
    throw new Error("Graduation venue must be damm-v2 or dlmm.");
  }
  if (!isDlmmBinStep(input.binStep)) {
    throw new Error(`DLMM bin step must be one of ${DLMM_BIN_STEPS.join(", ")}.`);
  }
  if (!Number.isInteger(input.rangeBins) || input.rangeBins < 1 || input.rangeBins > 34) {
    throw new Error("DLMM range must be a whole number of bins from 1 to 34 on each side of the active bin.");
  }
  const factor = baseFactorForFee(input.binStep, input.feeBps);
  if (factor == null) {
    throw new Error(
      `DLMM fee ${input.feeBps} bps does not land on an integer base factor for bin step ${input.binStep}.`,
    );
  }
  return {
    venue: "dlmm",
    binStep: input.binStep,
    feeBps: input.feeBps,
    rangeBins: input.rangeBins,
  };
}

export function canonicalGraduationPlan(plan: GraduationPlan): string {
  if (plan.venue === "damm-v2") return "damm-v2\n-\n-\n-";
  return ["dlmm", String(plan.binStep), String(plan.feeBps), String(plan.rangeBins)].join("\n");
}

export function graduationFingerprint(plan: GraduationPlan): string {
  return sha256Hex(canonicalGraduationPlan(plan)).slice(0, FINGERPRINT_HEX_LEN);
}

export function attestGraduation(
  input: Parameters<typeof parseGraduationPlan>[0],
): GraduationAttestation {
  const plan = parseGraduationPlan(input);
  return {
    plan,
    canonical: canonicalGraduationPlan(plan),
    fingerprint: graduationFingerprint(plan),
    note: plan.venue === "dlmm" ? DLMM_NOTE : DAMM_NOTE,
  };
}

export function sameGraduation(a: GraduationPlan, b: GraduationPlan): boolean {
  return canonicalGraduationPlan(a) === canonicalGraduationPlan(b);
}
