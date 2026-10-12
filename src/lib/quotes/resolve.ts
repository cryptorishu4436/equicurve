import { getCluster, getUsdcMint, WSOL_MINT } from "@/lib/constants";
import { getQuoteAsset, isQuoteId, isStockQuote, type QuoteId } from "./catalog";

export type ResolvedQuote = {
  id: QuoteId;
  symbol: string;
  decimals: 6 | 7 | 8 | 9;
  mint: string | null;
  available: boolean;
  /** Why a transaction cannot use this quote on the active cluster. */
  unavailableReason: string | null;
  claim: string;
  issuer: string | null;
};

export type WizardQuoteResolution = {
  mint: string | null;
  decimals: 6 | 7 | 8 | 9;
  available: boolean;
  unavailableReason: string | null;
  claim: string;
};

export function resolveWizardQuote(input: {
  quote: QuoteId | "CUSTOM";
  customQuoteMint?: string;
  customQuoteDecimals?: 6 | 7 | 8 | 9 | null;
}): WizardQuoteResolution {
  if (input.quote === "CUSTOM") {
    const ready = Boolean(input.customQuoteMint && input.customQuoteDecimals);
    return {
      mint: ready ? input.customQuoteMint ?? null : null,
      decimals: input.customQuoteDecimals ?? 9,
      available: ready,
      unavailableReason: ready ? null : "Paste a quote mint and wait for the decimal and badge check.",
      claim: "Custom quote mint. The launched token is not this asset.",
    };
  }
  const resolved = resolveActiveQuote(input.quote);
  return {
    mint: resolved.mint,
    decimals: resolved.decimals,
    available: resolved.available,
    unavailableReason: resolved.unavailableReason,
    claim: resolved.claim,
  };
}

/** Mint EquiCurve will put on a create transaction for the active cluster. */
export function resolveActiveQuote(id: QuoteId): ResolvedQuote {
  const asset = getQuoteAsset(id);
  if (asset.kind === "native") {
    return {
      id,
      symbol: asset.symbol,
      decimals: asset.decimals,
      mint: WSOL_MINT.toBase58(),
      available: true,
      unavailableReason: null,
      claim: asset.claim,
      issuer: asset.issuer,
    };
  }
  if (asset.kind === "stable") {
    const mint = getUsdcMint();
    return {
      id,
      symbol: asset.symbol,
      decimals: asset.decimals,
      mint: mint?.toBase58() ?? null,
      available: Boolean(mint),
      unavailableReason: mint ? null : "USDC is not configured on this cluster.",
      claim: asset.claim,
      issuer: asset.issuer,
    };
  }
  const onMainnet = getCluster() === "mainnet-beta";
  return {
    id,
    symbol: asset.symbol,
    decimals: asset.decimals,
    mint: asset.mainnetMint,
    available: onMainnet && Boolean(asset.mainnetMint),
    unavailableReason:
      onMainnet && asset.mainnetMint
        ? null
        : `${asset.symbol} is a mainnet ${asset.issuer} mint. This cluster cannot deploy a pool quoted in it.`,
    claim: asset.claim,
    issuer: asset.issuer,
  };
}

/** Mainnet mint for a catalog quote. USDC stays with the cluster helper. */
export function mintHintForQuote(quote: string): string | null {
  if (!isQuoteId(quote) || quote === "USDC") return null;
  return getQuoteAsset(quote).mainnetMint;
}

export function assertQuoteDeployable(id: QuoteId): ResolvedQuote {
  const resolved = resolveActiveQuote(id);
  if (!resolved.available || !resolved.mint) {
    throw new Error(resolved.unavailableReason ?? `${id} is not deployable on this cluster.`);
  }
  if (isStockQuote(id) && getCluster() !== "mainnet-beta") {
    throw new Error(resolved.unavailableReason ?? `${id} is mainnet-only.`);
  }
  return resolved;
}
