import DLMM, { ActivationType } from "@meteora-ag/dlmm";
import { BN } from "@coral-xyz/anchor";
import type { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  feeBpsFromBaseFactor,
  type DlmmGraduation,
} from "./plan";

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
    reason: "Bin step and fee match the graduation plan. The planned range is the issuer's liquidity width and is not stored on the empty pair.",
  };
}
