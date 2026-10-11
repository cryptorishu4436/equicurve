import { PublicKey } from "@solana/web3.js";
import { tradingFeeSplit } from "@/lib/dbc/presets";
import { QUOTE_ASSETS } from "@/lib/quotes/catalog";

/**
 * The equity-tuned curve sold as a published config.
 * The partner fee claimer is the wallet in NEXT_PUBLIC_PARTNER_FEE_CLAIMER.
 * When that variable is unset, the deploying wallet remains the claimer.
 * Publishing the card does not deploy a pool and does not create a share.
 */
export const PUBLISHED_EQUITY = {
  id: "equity-constrained",
  presetId: "equity" as const,
  name: "Equity-tuned constrained config",
  summary:
    "A 15× curve with a decaying base fee and a dynamic fee. The issuer still has to pass the constraint search, or explicitly accept a wider budget, before this config can be signed.",
  constraints: {
    maxThresholdGap: 0.15,
    maxReferenceImpactBps: 150,
    maxWhaleImpactBps: 400,
    maxConcentration: 0.35,
    minRetailProgress: 0.2,
  },
  creatorTradingFeePercentage: 50,
  quotes: QUOTE_ASSETS.map((asset) => ({
    id: asset.id,
    symbol: asset.symbol,
    kind: asset.kind,
    decimals: asset.decimals,
    issuer: asset.issuer,
    claim: asset.claim,
  })),
  legal:
    "Paying for this config, or setting EquiCurve as the partner fee claimer, does not make the launched token a share. A stock quote remains the quote asset issued by its own issuer.",
} as const;

export function publishedFeeSplit(creatorTradingFeePercentage = PUBLISHED_EQUITY.creatorTradingFeePercentage) {
  return tradingFeeSplit(creatorTradingFeePercentage);
}

/** Partner wallet that receives the published preset's partner fee, when configured. */
export function publishedPartnerFeeClaimer(): string | null {
  const raw = process.env.NEXT_PUBLIC_PARTNER_FEE_CLAIMER?.trim() ?? "";
  if (!raw) return null;
  try {
    return new PublicKey(raw).toBase58();
  } catch {
    return null;
  }
}

/**
 * Fee claimer written on a create transaction.
 * An explicit address wins. The published equity preset otherwise uses the
 * configured partner wallet. Anything else stays blank so the payer is used.
 */
export function resolvePartnerFeeClaimer(presetId: string, typed: string): string {
  const explicit = typed.trim();
  if (explicit) return explicit;
  if (presetId === PUBLISHED_EQUITY.presetId) return publishedPartnerFeeClaimer() ?? "";
  return "";
}

export function publishedPresetCard() {
  const partner = publishedPartnerFeeClaimer();
  const split = publishedFeeSplit();
  return {
    ...PUBLISHED_EQUITY,
    fee: {
      ...split,
      creatorTradingFeePercentage: PUBLISHED_EQUITY.creatorTradingFeePercentage,
      partnerFeeClaimer: partner,
      partnerFeeClaimerSource: partner
        ? "NEXT_PUBLIC_PARTNER_FEE_CLAIMER"
        : "deployer wallet, because no partner fee claimer is configured",
    },
  };
}
