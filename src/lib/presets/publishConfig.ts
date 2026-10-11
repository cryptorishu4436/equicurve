import { Keypair, PublicKey, type Connection, type Transaction } from "@solana/web3.js";
import { deriveTokenBadgeAddress } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { getDbcClient } from "@/lib/dbc/client";
import { buildPresetConfig } from "@/lib/dbc/presets";
import { isUsdcMint, WSOL_MINT } from "@/lib/constants";
import { PUBLISHED_EQUITY, publishedPartnerFeeClaimer } from "./published";

/**
 * Build the unsigned transaction that creates the published equity config.
 * The payer signs. The new config keypair signs too. Pools created against
 * this config pay the partner fee claimer. This does not deploy a pool.
 */
export async function buildPublishedConfigTransaction(args: {
  connection: Connection;
  payer: PublicKey;
  quoteMint: PublicKey;
  quoteDecimals: 6 | 7 | 8 | 9;
}): Promise<{ transaction: Transaction; config: Keypair; feeClaimer: string }> {
  const feeClaimer = new PublicKey(publishedPartnerFeeClaimer() ?? args.payer.toBase58());
  const curve = buildPresetConfig(PUBLISHED_EQUITY.presetId, {
    quoteDecimals: args.quoteDecimals,
    creatorTradingFeePercentage: PUBLISHED_EQUITY.creatorTradingFeePercentage,
    lpLockPct: 100,
    mintRenounce: true,
  });
  const config = Keypair.generate();
  const needsBadge = !args.quoteMint.equals(WSOL_MINT) && !isUsdcMint(args.quoteMint);
  const client = getDbcClient(args.connection);
  const transaction = await client.partner.createConfig({
    ...curve,
    config: config.publicKey,
    feeClaimer,
    leftoverReceiver: args.payer,
    quoteMint: args.quoteMint,
    payer: args.payer,
    ...(needsBadge ? { tokenBadge: deriveTokenBadgeAddress(args.quoteMint) } : {}),
  });
  return { transaction, config, feeClaimer: feeClaimer.toBase58() };
}
