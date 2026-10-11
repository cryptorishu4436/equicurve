import DLMM, { ActivationType, StrategyType } from "@meteora-ag/dlmm";
import { BN } from "@coral-xyz/anchor";
import { Keypair, type Connection, type PublicKey, type Transaction } from "@solana/web3.js";
import {
  feeBpsFromBaseFactor,
  type DlmmGraduation,
} from "./plan";
import { dlmmRangeMatches } from "./range";

export type DlmmObservation = {
  pool: string;
  binStep: number;
  feeBps: number | null;
};

function sortMints(a: PublicKey, b: PublicKey): [PublicKey, PublicKey] {
  return Buffer.compare(a.toBuffer(), b.toBuffer()) <= 0 ? [a, b] : [b, a];
}

/**
 * Build the issuer-signed transaction that opens the designed DLMM pair.
 * The pair is empty. Liquidity across the planned range is a later transaction.
 * DBC migration to DAMM v2 is unchanged.
 */
export async function buildDlmmOpenTransaction(args: {
  connection: Connection;
  plan: DlmmGraduation;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  creator: PublicKey;
  /** Quote tokens per one base token. Omitted opens at DLMM price 1. */
  priceQuotePerBase?: string;
}): Promise<{ transaction: Transaction; activeId: number }> {
  const [tokenX, tokenY] = sortMints(args.baseMint, args.quoteMint);
  const activeId = args.priceQuotePerBase
    ? DLMM.getBinIdFromPrice(args.priceQuotePerBase, args.plan.binStep, false)
    : 0;
  const transaction = await DLMM.createCustomizablePermissionlessLbPair2(
    args.connection,
    new BN(args.plan.binStep),
    tokenX,
    tokenY,
    new BN(activeId),
    new BN(args.plan.feeBps),
    ActivationType.Timestamp,
    false,
    args.creator,
  );
  return { transaction, activeId };
}

/** Read the bin step and base fee from a live LB pair. */
export async function readDlmmPool(connection: Connection, pool: PublicKey): Promise<DlmmObservation> {
  const pair = await DLMM.create(connection, pool);
  const binStep = Number(pair.lbPair.binStep);
  const baseFactor = Number(pair.lbPair.parameters.baseFactor);
  const power = Number(pair.lbPair.parameters.baseFeePowerFactor ?? 0);
  const fromFactor = power === 0 ? feeBpsFromBaseFactor(binStep, baseFactor) : null;
  const info = pair.getFeeInfo();
  const fromSdk = Math.round(Number(info.baseFeeRatePercentage) * 100);
  return {
    pool: pool.toBase58(),
    binStep,
    feeBps: fromFactor ?? (Number.isFinite(fromSdk) ? fromSdk : null),
  };
}

export function dlmmObservationMatches(
  plan: DlmmGraduation,
  observed: DlmmObservation,
): { ok: boolean; reason: string } {
  if (observed.binStep !== plan.binStep) {
    return { ok: false, reason: `DLMM bin step is ${observed.binStep}. The plan says ${plan.binStep}.` };
  }
  if (observed.feeBps == null) {
    return { ok: false, reason: "DLMM fee could not be read." };
  }
  if (Math.abs(observed.feeBps - plan.feeBps) > 1) {
    return { ok: false, reason: `DLMM fee is ${observed.feeBps} bps. The plan says ${plan.feeBps}.` };
  }
  return {
    ok: true,
    reason: "Bin step and fee match the graduation plan. The position width is a separate check.",
  };
}

/**
 * Open a spot position across the planned bins and add the issuer's amounts.
 * One side may be zero. Both zero is refused. The position keypair must sign.
 */
export async function buildDlmmLiquidityTransaction(args: {
  connection: Connection;
  pool: PublicKey;
  plan: DlmmGraduation;
  owner: PublicKey;
  amountX: BN;
  amountY: BN;
}): Promise<{ transaction: Transaction; position: Keypair; minBinId: number; maxBinId: number }> {
  if (args.amountX.isNeg() || args.amountY.isNeg() || (args.amountX.isZero() && args.amountY.isZero())) {
    throw new Error("Provide a base amount, a quote amount, or both. Zero on both sides adds no liquidity.");
  }
  const pair = await DLMM.create(args.connection, args.pool);
  const active = Number(pair.lbPair.activeId);
  if (!Number.isInteger(active)) throw new Error("DLMM active bin could not be read.");
  const minBinId = active - args.plan.rangeBins;
  const maxBinId = active + args.plan.rangeBins;
  const position = Keypair.generate();
  const transaction = await pair.initializePositionAndAddLiquidityByStrategy({
    positionPubKey: position.publicKey,
    totalXAmount: args.amountX,
    totalYAmount: args.amountY,
    strategy: { minBinId, maxBinId, strategyType: StrategyType.Spot },
    user: args.owner,
    slippage: 1,
  });
  return { transaction, position, minBinId, maxBinId };
}

/** Compare the owner's positions on this pair with the planned width. */
export async function readDlmmRange(args: {
  connection: Connection;
  pool: PublicKey;
  owner: PublicKey;
  plan: DlmmGraduation;
}): Promise<{ ok: boolean; reason: string; lowerBinId: number | null; upperBinId: number | null }> {
  const pair = await DLMM.create(args.connection, args.pool);
  const found = await pair.getPositionsByUserAndLbPair(args.owner);
  const positions = found.userPositions.map((row) => ({
    lowerBinId: Number(row.positionData.lowerBinId),
    upperBinId: Number(row.positionData.upperBinId),
  }));
  const match = positions.find((row) => dlmmRangeMatches(args.plan, row).ok) ?? positions[0] ?? null;
  const verdict = dlmmRangeMatches(args.plan, match);
  return {
    ...verdict,
    lowerBinId: match?.lowerBinId ?? null,
    upperBinId: match?.upperBinId ?? null,
  };
}
